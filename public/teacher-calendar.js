/* Teacher Calendar: every student's passes (finished, running and scheduled) in a Mon–Fri week grid,
   with a mini month and a list for the chosen day. Runs after teacher-admin.js. */

const viewHandlers = {};

// the dashboard calls this whenever a top-level page is shown
function onViewShown(view) {
  if (viewHandlers[view]) viewHandlers[view]();
}

const TC_HOUR_PX = 56;
const TC_TIME_COL = 56;
const calRoot = document.getElementById("calendar-view");

const tcDay = (ts) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};
const tcSame = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const tcAdd = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const tcMonday = (d) => tcAdd(tcDay(d), -((d.getDay() + 6) % 7));

function tcNearestWeekday(d) {
  let x = tcDay(d);
  while (x.getDay() === 0 || x.getDay() === 6) x = tcAdd(x, 1);
  return x;
}

function tcStep(d, dir) {
  let x = tcAdd(d, dir);
  while (x.getDay() === 0 || x.getDay() === 6) x = tcAdd(x, dir);
  return x;
}

// Monday-to-Friday weeks that cover a month
function tcMonthWeeks(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const weeks = [];
  for (let w = tcMonday(first); w <= last; w = tcAdd(w, 7)) weeks.push([0, 1, 2, 3, 4].map((i) => tcAdd(w, i)));
  return weeks;
}

let tcSelected = tcNearestWeekday(new Date());
let tcMiniMonth = new Date(tcSelected.getFullYear(), tcSelected.getMonth(), 1);
let tcBuilt = false;
let tcScrolled = false;

function tcEvents() {
  const events = [];
  const now = serverTime();
  students.forEach((s) => {
    s.log.forEach((p) =>
      events.push({ kind: "past", who: s.name, name: p.name, categoryKey: p.categoryKey, start: p.startTime, end: Math.max(p.endTime || p.plannedEnd, p.startTime + 60000), overtime: p.overtime })
    );
    (s.scheduled || []).forEach((p) =>
      events.push({ kind: "scheduled", who: s.name, name: p.dest.name, categoryKey: p.dest.categoryKey, start: p.scheduledFor, end: p.scheduledFor + p.minutes * 60000 })
    );
    if (s.active) {
      events.push({ kind: "active", who: s.name, name: s.active.room.name, categoryKey: s.active.room.categoryKey, start: s.active.startTime, end: Math.max(s.active.endTime, now) });
    }
  });
  return events;
}

const tcOnDay = (events, day) => events.filter((e) => tcSame(new Date(e.start), day)).sort((a, b) => a.start - b.start);
const tcClock = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function buildCalendar() {
  const arrow = (id, dir, label) =>
    `<button type="button" class="cal-arrow" id="${id}" aria-label="${label}"><svg viewBox="0 0 24 24"><path d="${dir < 0 ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  calRoot.innerHTML = `
    <div class="calendar-page tcal">
      <aside class="cal-side">
        <div class="mini-cal">
          <div class="mini-cal-head">${arrow("tc-mini-prev", -1, "Previous month")}<span class="mini-cal-title" id="tc-mini-title"></span>${arrow("tc-mini-next", 1, "Next month")}</div>
          <div class="mini-cal-weekdays"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span></div>
          <div class="mini-cal-grid" id="tc-mini-grid"></div>
        </div>
        <div class="cal-day-row"><span class="cal-day-label" id="tc-day-label"></span><span class="cal-day-arrows">${arrow("tc-day-prev", -1, "Previous day")}${arrow("tc-day-next", 1, "Next day")}</span></div>
        <div class="cal-day-list" id="tc-day-list"></div>
      </aside>
      <section class="cal-main">
        <div class="cal-toolbar">
          <button type="button" class="cal-today-btn" id="tc-today">Today</button>
          ${arrow("tc-week-prev", -1, "Previous week")}${arrow("tc-week-next", 1, "Next week")}
          <h2 class="cal-title" id="tc-title"></h2>
        </div>
        <div class="cal-card">
          <div class="cal-head" id="tc-head"></div>
          <div class="cal-scroll" id="tc-scroll"><div class="cal-body" id="tc-body"></div></div>
        </div>
      </section>
    </div>`;

  const move = (d) => {
    tcSelected = d;
    tcMiniMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    renderTeacherCalendar();
  };
  document.getElementById("tc-today").addEventListener("click", () => move(tcNearestWeekday(new Date())));
  document.getElementById("tc-week-prev").addEventListener("click", () => move(tcAdd(tcSelected, -7)));
  document.getElementById("tc-week-next").addEventListener("click", () => move(tcAdd(tcSelected, 7)));
  document.getElementById("tc-day-prev").addEventListener("click", () => move(tcStep(tcSelected, -1)));
  document.getElementById("tc-day-next").addEventListener("click", () => move(tcStep(tcSelected, 1)));
  document.getElementById("tc-mini-prev").addEventListener("click", () => ((tcMiniMonth = new Date(tcMiniMonth.getFullYear(), tcMiniMonth.getMonth() - 1, 1)), renderTeacherCalendar()));
  document.getElementById("tc-mini-next").addEventListener("click", () => ((tcMiniMonth = new Date(tcMiniMonth.getFullYear(), tcMiniMonth.getMonth() + 1, 1)), renderTeacherCalendar()));
  tcBuilt = true;
}

function renderTeacherCalendar() {
  if (!tcBuilt) buildCalendar();
  const events = tcEvents();
  const today = tcDay(Date.now());

  // mini month
  document.getElementById("tc-mini-title").textContent = tcMiniMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  document.getElementById("tc-mini-grid").innerHTML = tcMonthWeeks(tcMiniMonth)
    .flat()
    .map((d) => {
      const cls = ["mini-day", d.getMonth() !== tcMiniMonth.getMonth() ? "muted" : "", tcSame(d, today) ? "today" : "", tcSame(d, tcSelected) ? "selected" : "", tcOnDay(events, d).length ? "has-events" : ""].join(" ");
      return `<button type="button" class="${cls}" data-ts="${d.getTime()}">${d.getDate()}</button>`;
    })
    .join("");
  document.querySelectorAll("#tc-mini-grid .mini-day").forEach((b) =>
    b.addEventListener("click", () => {
      tcSelected = new Date(Number(b.dataset.ts));
      tcMiniMonth = new Date(tcSelected.getFullYear(), tcSelected.getMonth(), 1);
      renderTeacherCalendar();
    })
  );

  // list for the chosen day
  const label = document.getElementById("tc-day-label");
  label.textContent = `${tcSame(tcSelected, today) ? "Today" : tcSelected.toLocaleDateString("en-US", { weekday: "short" })}, ${tcSelected.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  label.classList.toggle("is-today", tcSame(tcSelected, today));
  const todays = tcOnDay(events, tcSelected);
  document.getElementById("tc-day-list").innerHTML = todays.length
    ? todays
        .map((e) => {
          const cat = categoryByKey(e.categoryKey);
          const status = e.kind === "scheduled" ? "Scheduled" : e.kind === "active" ? "In progress" : e.overtime ? '<span class="notif-overtime-tag">Overtime</span>' : formatDuration(e.end - e.start);
          return `
          <div class="cal-item">
            <span class="notif-icon" style="background:${cat.color}">${roomIconMarkup(e.name, e.categoryKey)}</span>
            <div class="notif-info"><span class="notif-name">${escapeHtml(e.who)}</span><span class="notif-meta">${escapeHtml(e.name)} · ${tcClock(e.start)} · ${status}</span></div>
          </div>`;
        })
        .join("")
    : `<div class="cal-empty"><span class="cal-empty-emoji">🎈</span><p>Nothing here. Nobody had a pass this day.</p></div>`;

  // week grid
  const monday = tcMonday(tcSelected);
  const days = [0, 1, 2, 3, 4].map((i) => tcAdd(monday, i));
  document.getElementById("tc-title").textContent = tcSelected.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const cols = `${TC_TIME_COL}px repeat(5, 1fr)`;
  const head = document.getElementById("tc-head");
  head.style.gridTemplateColumns = cols;
  head.innerHTML =
    "<span></span>" +
    days.map((d) => `<span class="cal-head-day ${tcSame(d, today) ? "is-today" : ""}">${d.toLocaleDateString("en-US", { weekday: "short" })} <b>${d.getDate()}</b></span>`).join("");

  const body = document.getElementById("tc-body");
  body.style.gridTemplateColumns = cols;
  body.style.height = `${24 * TC_HOUR_PX}px`;
  const hourLabels = Array.from({ length: 24 }, (_, h) => `<span class="cal-hour" style="top:${h * TC_HOUR_PX}px">${h === 0 ? "" : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`}</span>`).join("");
  const nowMs = Date.now();
  const columns = days
    .map((d) => {
      const dayStart = d.getTime();
      const blocks = tcOnDay(events, d)
        .map((e) => {
          const cat = categoryByKey(e.categoryKey);
          const top = ((e.start - dayStart) / 3600000) * TC_HOUR_PX;
          const height = Math.max(20, ((e.end - e.start) / 3600000) * TC_HOUR_PX);
          return `<div class="cal-event ${e.kind}" style="top:${top}px;height:${height}px;--c:${cat.color}" title="${escapeHtml(e.who)} · ${escapeHtml(e.name)} · ${tcClock(e.start)}"><b>${escapeHtml(e.who)}</b><span>${escapeHtml(e.name)}</span></div>`;
        })
        .join("");
      const nowLine = tcSame(d, today) ? `<div class="cal-now" style="top:${((nowMs - dayStart) / 3600000) * TC_HOUR_PX}px"><i></i></div>` : "";
      return `<div class="cal-col tc-col">${blocks}${nowLine}</div>`;
    })
    .join("");
  body.innerHTML = `<div class="cal-hours">${hourLabels}</div>${columns}`;

  if (!tcScrolled) {
    tcScrolled = true;
    document.getElementById("tc-scroll").scrollTop = Math.max(0, new Date().getHours() - 1) * TC_HOUR_PX;
  }
}

viewHandlers.calendar = renderTeacherCalendar;
studentsListeners.push(() => {
  if (currentView === "calendar") renderTeacherCalendar();
});
setInterval(() => currentView === "calendar" && renderTeacherCalendar(), 60000);
