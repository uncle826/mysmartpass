/* Calendar tab: a mini month, a list for the chosen day, and a Mon–Fri week grid of
   past and scheduled passes. Runs after dashboard.js and reuses its data + helpers. */

const homePage = document.querySelector("main.content");
const calendarPage = document.getElementById("calendar-page");
const navHome = document.getElementById("nav-home");
const navCalendar = document.getElementById("nav-calendar");

const HOUR_PX = 62;
const TIME_COL_PX = 56;

function nearestWeekday(d) {
  const x = startOfDay(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x;
}

function mondayOf(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// step to the previous/next school day, skipping weekends
function stepWeekday(d, dir) {
  let x = addDays(d, dir);
  while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, dir);
  return x;
}

let calSelected = nearestWeekday(new Date());
let calMiniMonth = new Date(calSelected.getFullYear(), calSelected.getMonth(), 1);

function calendarEvents() {
  const events = logCache.map((p) => ({
    kind: "past",
    name: p.name,
    categoryKey: p.categoryKey,
    start: p.startTime,
    end: Math.max(p.endTime || p.plannedEnd, p.startTime + 60000),
    overtime: p.overtime,
  }));
  scheduledCache.forEach((s) =>
    events.push({
      kind: "scheduled",
      id: s.id,
      name: s.dest.name,
      categoryKey: s.dest.categoryKey,
      start: s.scheduledFor,
      end: s.scheduledFor + s.minutes * 60000,
    })
  );
  if (currentPass) {
    events.push({
      kind: "active",
      name: currentPass.room.name,
      categoryKey: currentPass.room.categoryKey,
      start: currentPass.startTime,
      end: Math.max(currentPass.endTime, serverTime()),
    });
  }
  return events;
}

function clockText(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function eventsOnDay(events, day) {
  return events.filter((e) => sameDay(new Date(e.start), day)).sort((a, b) => a.start - b.start);
}

function renderMiniCalendar(events) {
  const today = startOfDay(new Date());
  document.getElementById("mini-title").textContent = calMiniMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  document.getElementById("mini-grid").innerHTML = monthWeeks(calMiniMonth)
    .flat()
    .map((d) => {
      const other = d.getMonth() !== calMiniMonth.getMonth();
      const cls = [
        "mini-day",
        other ? "muted" : "",
        sameDay(d, today) ? "today" : "",
        sameDay(d, calSelected) ? "selected" : "",
        eventsOnDay(events, d).length ? "has-events" : "",
      ].join(" ");
      return `<button type="button" class="${cls}" data-ts="${d.getTime()}">${d.getDate()}</button>`;
    })
    .join("");

  document.querySelectorAll("#mini-grid .mini-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      calSelected = new Date(Number(btn.dataset.ts));
      calMiniMonth = new Date(calSelected.getFullYear(), calSelected.getMonth(), 1);
      renderCalendar();
    });
  });
}

function renderDayList(events) {
  const today = startOfDay(new Date());
  const label = document.getElementById("cal-day-label");
  const prefix = sameDay(calSelected, today)
    ? "Today"
    : calSelected.toLocaleDateString("en-US", { weekday: "short" });
  label.textContent = `${prefix}, ${calSelected.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  label.classList.toggle("is-today", sameDay(calSelected, today));

  const list = document.getElementById("cal-day-list");
  const todays = eventsOnDay(events, calSelected);
  if (todays.length === 0) {
    list.innerHTML = `<div class="cal-empty"><span class="cal-empty-emoji">🎈</span><p>Empty here! Guess you've got some free time up your sleeve!</p></div>`;
    return;
  }

  list.innerHTML = todays
    .map((e) => {
      const category = categoryByKey(e.categoryKey);
      const status =
        e.kind === "scheduled"
          ? "Scheduled"
          : e.kind === "active"
            ? "In progress"
            : e.overtime
              ? '<span class="notif-overtime-tag">Overtime</span>'
              : formatDuration(e.end - e.start);
      const cancel = e.kind === "scheduled" ? `<button type="button" class="cal-cancel" data-id="${e.id}">Cancel</button>` : "";
      return `
        <div class="cal-item">
          <span class="notif-icon" style="background:${category.color}">${roomIconMarkup(e.name, e.categoryKey)}</span>
          <div class="notif-info">
            <span class="notif-name">${escapeHtml(e.name)}</span>
            <span class="notif-meta">${clockText(e.start)} · ${status}</span>
          </div>
          ${cancel}
        </div>`;
    })
    .join("");

  list.querySelectorAll(".cal-cancel").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const res = await apiFetch("/api/student/schedule/cancel", { body: { name, id: Number(btn.dataset.id) } });
      if (res.ok) {
        applyServerState(res.data);
        showToast("Scheduled pass cancelled.", "info");
      } else {
        btn.disabled = false;
      }
    });
  });
}

function hourLabel(h) {
  if (h === 0) return "";
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

function renderWeekGrid(events) {
  const monday = mondayOf(calSelected);
  const today = startOfDay(new Date());
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));

  document.getElementById("cal-title").textContent = calSelected.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const cols = `${TIME_COL_PX}px repeat(5, 1fr)`;
  const head = document.getElementById("cal-head");
  head.style.gridTemplateColumns = cols;
  head.innerHTML =
    `<span></span>` +
    days
      .map((d) => {
        const isToday = sameDay(d, today);
        const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
        return `<span class="cal-head-day ${isToday ? "is-today" : ""}">${weekday} <b>${d.getDate()}</b></span>`;
      })
      .join("");

  const body = document.getElementById("cal-body");
  body.style.gridTemplateColumns = cols;
  body.style.height = `${24 * HOUR_PX}px`;

  const labels = Array.from({ length: 24 }, (_, h) => `<span class="cal-hour" style="top:${h * HOUR_PX}px">${hourLabel(h)}</span>`).join("");
  const nowMs = Date.now();

  const columns = days
    .map((d) => {
      const dayStart = d.getTime();
      const blocks = eventsOnDay(events, d)
        .map((e) => {
          const category = categoryByKey(e.categoryKey);
          const top = ((e.start - dayStart) / 3600000) * HOUR_PX;
          const height = Math.max(22, ((e.end - e.start) / 3600000) * HOUR_PX);
          return `<div class="cal-event ${e.kind}" style="top:${top}px;height:${height}px;--c:${category.color}" title="${escapeHtml(e.name)} · ${clockText(e.start)}">
            <b>${escapeHtml(e.name)}</b><span>${clockText(e.start)}</span>
          </div>`;
        })
        .join("");
      const nowLine = sameDay(d, today)
        ? `<div class="cal-now" style="top:${((nowMs - dayStart) / 3600000) * HOUR_PX}px"><i></i></div>`
        : "";
      return `<div class="cal-col">${blocks}${nowLine}</div>`;
    })
    .join("");

  body.innerHTML = `<div class="cal-hours">${labels}</div>${columns}`;
}

let calScrolled = false;

function renderCalendar() {
  if (calendarPage.classList.contains("hidden")) return;
  const events = calendarEvents();
  renderMiniCalendar(events);
  renderDayList(events);
  renderWeekGrid(events);

  if (!calScrolled) {
    calScrolled = true;
    const hour = new Date().getHours();
    document.getElementById("cal-scroll").scrollTop = Math.max(0, hour - 1) * HOUR_PX;
  }
}

function showMainPage(page) {
  const cal = page === "calendar";
  homePage.classList.toggle("hidden", cal);
  calendarPage.classList.toggle("hidden", !cal);
  navHome.classList.toggle("active", !cal);
  navCalendar.classList.toggle("active", cal);
  if (cal) renderCalendar();
}

function syncPageFromHash() {
  // an active pass takes over the whole screen, so the home page (which holds it) always wins
  const wantCalendar = location.hash === "#calendar" && !currentPass;
  showMainPage(wantCalendar ? "calendar" : "home");
}

navHome.addEventListener("click", (e) => {
  e.preventDefault();
  if (location.hash) history.pushState(null, "", location.pathname + location.search);
  syncPageFromHash();
});
navCalendar.addEventListener("click", (e) => {
  e.preventDefault();
  if (location.hash !== "#calendar") history.pushState(null, "", "#calendar");
  syncPageFromHash();
});
window.addEventListener("hashchange", syncPageFromHash);
window.addEventListener("popstate", syncPageFromHash);

function moveSelection(next) {
  calSelected = next;
  calMiniMonth = new Date(next.getFullYear(), next.getMonth(), 1);
  renderCalendar();
}

document.getElementById("cal-today").addEventListener("click", () => moveSelection(nearestWeekday(new Date())));
document.getElementById("week-prev").addEventListener("click", () => moveSelection(addDays(calSelected, -7)));
document.getElementById("week-next").addEventListener("click", () => moveSelection(addDays(calSelected, 7)));
document.getElementById("day-prev").addEventListener("click", () => moveSelection(stepWeekday(calSelected, -1)));
document.getElementById("day-next").addEventListener("click", () => moveSelection(stepWeekday(calSelected, 1)));
document.getElementById("mini-prev").addEventListener("click", () => {
  calMiniMonth = new Date(calMiniMonth.getFullYear(), calMiniMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("mini-next").addEventListener("click", () => {
  calMiniMonth = new Date(calMiniMonth.getFullYear(), calMiniMonth.getMonth() + 1, 1);
  renderCalendar();
});

// keep the "now" line moving
setInterval(renderCalendar, 60000);

syncPageFromHash();
