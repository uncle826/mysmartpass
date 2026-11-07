/* Bell schedule helpers, shared by the student and teacher screens.
   A schedule looks like: { yearName, startDate, endDate, periods: [{name, start, end}], holidays: [{name, date}] }
   with times as "HH:MM" and dates as "YYYY-MM-DD" (all in the viewer's own clock). */

function bellDateKey(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function bellMinutes(hhmm) {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
}

// "13:05" -> "1:05 PM"
function bellClock(hhmm) {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3)} ${h < 12 ? "AM" : "PM"}`;
}

// What's going on in the school day right now? Returns null when there's no schedule to go by,
// otherwise { kind, title, detail } where kind is: period | passing | before | after | off
function bellInfo(schedule, now = new Date()) {
  if (!schedule || !Array.isArray(schedule.periods) || schedule.periods.length === 0) return null;

  const today = bellDateKey(now);
  if (schedule.startDate && today < schedule.startDate) return { kind: "off", title: "No school yet", detail: `The school year starts ${schedule.startDate}.` };
  if (schedule.endDate && today > schedule.endDate) return { kind: "off", title: "School year is over", detail: "Enjoy the break!" };

  const holiday = (schedule.holidays || []).find((h) => h.date === today);
  if (holiday) return { kind: "off", title: "No school today", detail: holiday.name };
  if (now.getDay() === 0 || now.getDay() === 6) return { kind: "off", title: "No school today", detail: "It's the weekend." };

  const minute = now.getHours() * 60 + now.getMinutes();
  const periods = schedule.periods;
  const current = periods.find((p) => minute >= bellMinutes(p.start) && minute < bellMinutes(p.end));
  if (current) {
    const left = bellMinutes(current.end) - minute;
    return { kind: "period", title: current.name, detail: `${bellClock(current.start)} – ${bellClock(current.end)} · ${left} min left`, period: current };
  }

  const next = periods.find((p) => bellMinutes(p.start) > minute);
  if (next) {
    const wait = bellMinutes(next.start) - minute;
    const first = next === periods[0];
    return first
      ? { kind: "before", title: "School hasn't started", detail: `${next.name} starts at ${bellClock(next.start)} (in ${wait} min)` }
      : { kind: "passing", title: "Passing time", detail: `${next.name} starts at ${bellClock(next.start)} (in ${wait} min)` };
  }
  return { kind: "after", title: "School's out for today", detail: `The last period ended at ${bellClock(periods[periods.length - 1].end)}.` };
}

// a typical school day to start from
const TYPICAL_DAY = [
  { name: "Period 1", start: "08:00", end: "08:50" },
  { name: "Period 2", start: "08:55", end: "09:45" },
  { name: "Period 3", start: "09:50", end: "10:40" },
  { name: "Period 4", start: "10:45", end: "11:35" },
  { name: "Lunch", start: "11:35", end: "12:10" },
  { name: "Period 5", start: "12:15", end: "13:05" },
  { name: "Period 6", start: "13:10", end: "14:00" },
  { name: "Period 7", start: "14:05", end: "14:55" },
];
