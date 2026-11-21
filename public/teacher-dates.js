/* Admin > Account Creation Dates: when each student (and teacher) signed up for SmartPass, by date and time.
   Runs after teacher-hall.js (uses teacherApi, adminTabHandlers, avatarHtml, escapeHtml, kickToSignIn). */

const ad = { data: null, who: "students", newestFirst: true, query: "", loading: false };

const AD_DAY_MS = 86400000;

function adDay(ts) {
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(new Date(ts))) / AD_DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function adDateText(ts) {
  return new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function adTimeText(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function adAgo(ts) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const days = Math.round(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.round(months / 12)} year${months >= 18 ? "s" : ""} ago`;
}

function adRows() {
  if (!ad.data) return [];
  const list = ad.who === "students" ? ad.data.students : ad.data.teachers;
  const q = ad.query.trim().toLowerCase();
  const rows = list.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.studentId || "").includes(q));
  rows.sort((a, b) => (ad.newestFirst ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
  return rows;
}

function adCsv() {
  const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Name", "Role", "Date", "Time", "ID number", "Grade"].map(quote).join(",")];
  [
    ...ad.data.students.map((s) => ({ ...s, role: "Student" })),
    ...ad.data.teachers.map((t) => ({ ...t, role: "Teacher" })),
  ]
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((r) => lines.push([r.name, r.role, new Date(r.createdAt).toLocaleDateString("en-US"), adTimeText(r.createdAt), r.studentId || "", r.grade || ""].map(quote).join(",")));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "smartpass-account-creation-dates.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function renderAccountDates() {
  const wrap = document.getElementById("ad-wrap");
  if (!wrap) return;
  if (!ad.data) {
    wrap.innerHTML = `<div class="ad-card"><p class="ad-empty">${ad.loading ? "Loading..." : "Couldn't load the account dates."}</p></div>`;
    return;
  }

  const all = [...ad.data.students, ...ad.data.teachers];
  const newest = all.length ? Math.max(...all.map((r) => r.createdAt)) : null;
  const first = all.length ? Math.min(...all.map((r) => r.createdAt)) : null;
  const weekAgo = Date.now() - 7 * AD_DAY_MS;
  const thisWeek = all.filter((r) => r.createdAt >= weekAgo).length;
  const rows = adRows();

  let lastDay = "";
  const list = rows
    .map((r, i) => {
      const day = adDay(r.createdAt);
      const heading = day !== lastDay ? `<h3 class="ad-day">${day}</h3>` : "";
      lastDay = day;
      const meta = ad.who === "students" ? [r.studentId ? `ID ${escapeHtml(r.studentId)}` : "", r.grade ? `Grade ${escapeHtml(r.grade)}` : ""].filter(Boolean).join(" · ") : "Teacher account";
      const avatar =
        ad.who === "students"
          ? avatarHtml({ name: r.name, avatarColor: r.avatarColor, photo: r.photo }, "ad-avatar")
          : `<span class="t-avatar ad-avatar" style="background:#1f195e">${escapeHtml(r.name.charAt(0).toUpperCase())}</span>`;
      return `${heading}
        <div class="ad-row" style="--i:${Math.min(i, 12)}">
          ${avatar}
          <div class="ad-who"><b>${escapeHtml(r.name)}</b>${meta ? `<span>${meta}</span>` : ""}</div>
          <div class="ad-when"><b>${adTimeText(r.createdAt)}</b><span>${adDateText(r.createdAt)}</span></div>
          <div class="ad-ago">${adAgo(r.createdAt)}</div>
        </div>`;
    })
    .join("");

  wrap.innerHTML = `
    <div class="ad-card">
      <div class="ad-stats">
        <div><b>${all.length}</b><span>Total accounts</span></div>
        <div><b>${ad.data.students.length}</b><span>Students</span></div>
        <div><b>${ad.data.teachers.length}</b><span>Teachers</span></div>
        <div><b>${thisWeek}</b><span>Joined this week</span></div>
      </div>
      <p class="ad-range">${all.length ? `First account: <b>${adDateText(first)}</b> at ${adTimeText(first)} &middot; Newest: <b>${adDateText(newest)}</b> at ${adTimeText(newest)}` : "No accounts yet."}</p>

      <div class="ad-tools">
        <div class="rt-seg ad-seg" id="ad-seg">
          <button type="button" data-v="students" class="${ad.who === "students" ? "on" : ""}">Students (${ad.data.students.length})</button>
          <button type="button" data-v="teachers" class="${ad.who === "teachers" ? "on" : ""}">Teachers (${ad.data.teachers.length})</button>
        </div>
        <input type="search" id="ad-search" class="ad-search" placeholder="Search names" value="${escapeHtml(ad.query)}" autocomplete="off">
        <button type="button" class="ad-btn" id="ad-sort">${ad.newestFirst ? "Newest first" : "Oldest first"}</button>
        <button type="button" class="ad-btn" id="ad-export">Export CSV</button>
      </div>

      <div class="ad-list">${list || `<p class="ad-empty">${ad.query ? "Nobody matches that search." : "No accounts here yet."}</p>`}</div>
    </div>`;

  document.querySelectorAll("#ad-seg button").forEach((b) =>
    b.addEventListener("click", () => {
      ad.who = b.dataset.v;
      renderAccountDates();
    })
  );
  const search = document.getElementById("ad-search");
  search.addEventListener("input", () => {
    ad.query = search.value;
    renderAccountDates();
    const again = document.getElementById("ad-search");
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  });
  document.getElementById("ad-sort").addEventListener("click", () => ((ad.newestFirst = !ad.newestFirst), renderAccountDates()));
  document.getElementById("ad-export").addEventListener("click", adCsv);
}

async function loadAccountDates() {
  ad.loading = true;
  renderAccountDates();
  const res = await teacherApi("/api/teacher/accounts");
  ad.loading = false;
  if (res.status === 401) return kickToSignIn();
  if (res.ok) ad.data = res.data;
  renderAccountDates();
}

adminTabHandlers.accountdates = loadAccountDates;
