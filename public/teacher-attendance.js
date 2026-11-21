/* Admin > Attendance: every "pass to class" (a student who was late), with which class, where they came from, why,
   and when they left and got there. Runs after teacher-dates.js (uses teacherApi, adminTabHandlers, avatarHtml, escapeHtml). */

const at = { data: null, range: "today", query: "", minutesDraft: null, timer: null, loading: false };

const AT_DAY_MS = 86400000;

function atStartOfDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function atDayLabel(ts) {
  const diff = Math.round((atStartOfDay(Date.now()) - atStartOfDay(ts)) / AT_DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

const atTime = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function atClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function atRecords() {
  if (!at.data) return [];
  const now = serverTime();
  const startOfToday = atStartOfDay(now);
  const weekStart = startOfToday - ((new Date(now).getDay() + 6) % 7) * AT_DAY_MS; // Monday
  const q = at.query.trim().toLowerCase();
  return at.data.records.filter((r) => {
    if (at.range === "today" && r.startTime < startOfToday) return false;
    if (at.range === "week" && r.startTime < weekStart) return false;
    if (!q) return true;
    return [r.name, r.to.name, r.from ? r.from.name : "", r.reason].join(" ").toLowerCase().includes(q);
  });
}

// what to show on the right of a row: still on the way, overdue, or when they got there
function atStatus(r) {
  const now = serverTime();
  if (!r.arrivedAt) {
    const left = r.plannedEnd - now;
    return left > 0
      ? { cls: "way", label: "On the way", detail: `${atClock(left)} left` }
      : { cls: "over", label: "Overdue", detail: `+${atClock(-left)}` };
  }
  const took = r.arrivedAt - r.startTime;
  return r.overtime
    ? { cls: "late", label: `Got there ${atTime(r.arrivedAt)}`, detail: `took ${atClock(took)}, over the countdown` }
    : { cls: "ok", label: `Got there ${atTime(r.arrivedAt)}`, detail: `took ${atClock(took)}` };
}

function atCsv() {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Student", "Grade", "ID", "Late to (teacher)", "Room", "Coming from", "Reason", "Date", "Left at", "Got there", "Took", "Status"].map(q).join(",")];
  atRecords().forEach((r) => {
    const s = atStatus(r);
    lines.push(
      [
        r.name,
        r.grade || "",
        r.studentId || "",
        r.to.name,
        r.to.room,
        r.from ? r.from.name : "",
        r.reason,
        new Date(r.startTime).toLocaleDateString("en-US"),
        atTime(r.startTime),
        r.arrivedAt ? atTime(r.arrivedAt) : "",
        r.arrivedAt ? atClock(r.arrivedAt - r.startTime) : "",
        r.arrivedAt ? (r.overtime ? "Over the countdown" : "On time") : s.label,
      ]
        .map(q)
        .join(",")
    );
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  a.download = "smartpass-attendance.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function renderAttendance() {
  const wrap = document.getElementById("at-wrap");
  if (!wrap) return;
  if (!at.data) {
    wrap.innerHTML = `<div class="ad-card"><p class="ad-empty">${at.loading ? "Loading..." : "Couldn't load attendance."}</p></div>`;
    return;
  }

  const all = at.data.records;
  const now = serverTime();
  const today = atStartOfDay(now);
  const weekStart = today - ((new Date(now).getDay() + 6) % 7) * AT_DAY_MS;
  const rows = atRecords();

  // the teachers students are most often late to (for the range on screen)
  const counts = new Map();
  rows.forEach((r) => counts.set(r.to.name, (counts.get(r.to.name) || 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  let lastDay = "";
  const list = rows
    .map((r, i) => {
      const day = atDayLabel(r.startTime);
      const heading = day !== lastDay ? `<h3 class="ad-day">${day}</h3>` : "";
      lastDay = day;
      const s = atStatus(r);
      return `${heading}
        <div class="at-row" style="--i:${Math.min(i, 12)}">
          ${avatarHtml({ name: r.name, avatarColor: r.avatarColor, photo: r.photo }, "ad-avatar")}
          <div class="at-main">
            <div class="at-line"><b>${escapeHtml(r.name)}</b><span>was late to</span><b class="at-to">${escapeHtml(r.to.name)}</b>${r.to.room ? `<em>${escapeHtml(r.to.room)}</em>` : ""}</div>
            <div class="at-sub">${r.from ? `from <b>${escapeHtml(r.from.name)}</b> &middot; ` : ""}left at ${atTime(r.startTime)}${r.grade ? ` &middot; Grade ${escapeHtml(r.grade)}` : ""}</div>
            <div class="at-reason">&ldquo;${escapeHtml(r.reason)}&rdquo;</div>
          </div>
          <div class="at-status ${s.cls}"><b>${s.label}</b><span>${s.detail}</span></div>
        </div>`;
    })
    .join("");

  const draft = at.minutesDraft ?? at.data.minutes;
  wrap.innerHTML = `
    <div class="ad-card">
      <div class="ad-stats">
        <div><b>${all.filter((r) => r.startTime >= today).length}</b><span>Late today</span></div>
        <div><b>${all.filter((r) => r.startTime >= weekStart).length}</b><span>Late this week</span></div>
        <div><b>${all.filter((r) => !r.arrivedAt).length}</b><span>On the way now</span></div>
        <div><b>${all.length}</b><span>All time</span></div>
      </div>

      <div class="at-setting">
        <label for="at-minutes">Longest countdown a student can pick</label>
        <select id="at-minutes">${Array.from({ length: 15 }, (_, i) => i + 1).map((m) => `<option value="${m}" ${m === draft ? "selected" : ""}>${m} minute${m === 1 ? "" : "s"}</option>`).join("")}</select>
        <button type="button" class="ad-btn" id="at-save" ${draft === at.data.minutes ? "disabled" : ""}>Save</button>
      </div>

      ${top.length ? `<div class="at-top"><span>Most late arrivals to</span>${top.map(([n, c]) => `<b>${escapeHtml(n)} <i>${c}</i></b>`).join("")}</div>` : ""}

      <div class="ad-tools">
        <div class="rt-seg ad-seg" id="at-seg">
          <button type="button" data-v="today" class="${at.range === "today" ? "on" : ""}">Today</button>
          <button type="button" data-v="week" class="${at.range === "week" ? "on" : ""}">This week</button>
          <button type="button" data-v="all" class="${at.range === "all" ? "on" : ""}">All time</button>
        </div>
        <input type="search" id="at-search" class="ad-search" placeholder="Search student, teacher or reason" value="${escapeHtml(at.query)}" autocomplete="off">
        <button type="button" class="ad-btn" id="at-export" ${rows.length ? "" : "disabled"}>Export CSV</button>
      </div>

      <div class="ad-list">${list || `<p class="ad-empty">${all.length ? "Nobody was late in this time range." : "No late passes yet. When a student uses Pass to Class, it shows up here."}</p>`}</div>
    </div>`;

  document.querySelectorAll("#at-seg button").forEach((b) =>
    b.addEventListener("click", () => {
      at.range = b.dataset.v;
      renderAttendance();
    })
  );
  const search = document.getElementById("at-search");
  search.addEventListener("input", () => {
    at.query = search.value;
    renderAttendance();
    const again = document.getElementById("at-search");
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });
  document.getElementById("at-export").addEventListener("click", atCsv);
  const select = document.getElementById("at-minutes");
  select.addEventListener("change", () => {
    at.minutesDraft = Number(select.value);
    document.getElementById("at-save").disabled = at.minutesDraft === at.data.minutes;
  });
  document.getElementById("at-save").addEventListener("click", async () => {
    const res = await teacherApi("/api/teacher/attendance/settings", { minutes: at.minutesDraft });
    if (res.status === 401) return kickToSignIn();
    if (!res.ok) return showToast(res.data.error || "Couldn't save that.", "warn");
    at.data.minutes = res.data.minutes;
    at.minutesDraft = null;
    showToast(`Students can now pick up to ${res.data.minutes} minute${res.data.minutes === 1 ? "" : "s"} on a pass to class.`, "success");
    renderAttendance();
  });
}

async function loadAttendance(quiet) {
  if (!quiet) {
    at.loading = true;
    renderAttendance();
  }
  const res = await teacherApi("/api/teacher/attendance");
  at.loading = false;
  if (res.status === 401) return kickToSignIn();
  if (res.ok) {
    syncServerClock(res.data.serverNow);
    at.data = res.data;
  }
  // don't redraw while someone is typing in the search box or picking a countdown
  const busy = document.activeElement && ["at-search", "at-minutes"].includes(document.activeElement.id);
  if (!quiet || !busy) renderAttendance();
}

adminTabHandlers.attendance = () => {
  loadAttendance(false);
  clearInterval(at.timer);
  // keep it fresh while the page is open: new late passes show up and "on the way" counts down
  at.timer = setInterval(() => {
    const panel = document.querySelector('.t-panel[data-panel="attendance"]');
    if (!panel || panel.classList.contains("hidden")) return clearInterval(at.timer);
    loadAttendance(true);
  }, 8000);
};
