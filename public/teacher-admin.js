/* Admin tools: Analytics (with CSV export), school-wide Pass rules, and Emergency mode.
   Runs after teacher-dashboard.js and uses its data (students, schoolRules, teacherApi, ...). */

const DAY_MS = 86400000;

function startOfLocalDay(ts) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function panelVisible(name) {
  const panel = document.querySelector(`.t-panel[data-panel="${name}"]`);
  return !!panel && !panel.classList.contains("hidden") && currentView === "settings";
}

/* ---------- Analytics ---------- */

let analyticsDays = 30; // 7, 30, or 0 for all time

// every finished pass, with the student it belongs to
function allFinishedPasses() {
  const out = [];
  students.forEach((s) => {
    s.log.forEach((p) => out.push({ student: s.name, ...p }));
  });
  return out;
}

function passesInRange() {
  const all = allFinishedPasses();
  if (!analyticsDays) return all;
  const since = startOfLocalDay(Date.now()) - (analyticsDays - 1) * DAY_MS;
  return all.filter((p) => p.startTime >= since);
}

function minutesText(ms) {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin} min`;
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

function renderTiles(passes) {
  const total = passes.length;
  const timeOut = passes.reduce((sum, p) => sum + Math.max(0, p.endTime - p.startTime), 0);
  const overtime = passes.filter((p) => p.overtime).length;
  const tiles = [
    { value: total, label: "Total passes" },
    { value: total ? minutesText(timeOut) : "—", label: "Time out of class" },
    { value: total ? formatDuration(timeOut / total) : "—", label: "Average pass" },
    { value: total ? `${overtime} (${Math.round((overtime / total) * 100)}%)` : "—", label: "Overtime passes" },
  ];
  document.getElementById("an-tiles").innerHTML = tiles
    .map((t) => `<div class="an-tile"><b>${escapeHtml(String(t.value))}</b><span>${t.label}</span></div>`)
    .join("");
}

function renderChart(passes) {
  const chart = document.getElementById("an-chart");
  const now = Date.now();
  let days = analyticsDays;
  if (!days) {
    const first = passes.reduce((min, p) => Math.min(min, p.startTime), now);
    days = Math.min(60, Math.max(7, Math.round((startOfLocalDay(now) - startOfLocalDay(first)) / DAY_MS) + 1));
  }

  const today = startOfLocalDay(now);
  const buckets = Array.from({ length: days }, (_, i) => ({ day: today - (days - 1 - i) * DAY_MS, count: 0 }));
  passes.forEach((p) => {
    const i = days - 1 - Math.round((today - startOfLocalDay(p.startTime)) / DAY_MS);
    if (i >= 0 && i < days) buckets[i].count += 1;
  });

  const max = Math.max(1, ...buckets.map((b) => b.count));
  // round the top of the scale up to a tidy number so the gridlines read cleanly
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const labelEvery = days <= 8 ? 1 : days <= 16 ? 2 : days <= 31 ? 5 : 10;

  const grid = [top, (top * 3) / 4, top / 2, top / 4]
    .map((v) => `<div class="an-grid-line" style="bottom:${(v / top) * 100}%"><span>${Number.isInteger(v) ? v : ""}</span></div>`)
    .join("");

  const bars = buckets
    .map((b, i) => {
      const date = new Date(b.day);
      const full = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const label = date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
      const showLabel = (days - 1 - i) % labelEvery === 0;
      return `
        <div class="an-col">
          <div class="an-bar-wrap">
            <div class="an-bar ${b.count === 0 ? "zero" : ""}" style="height:${(b.count / top) * 100}%" tabindex="0"
              data-tip="${escapeHtml(full)}: ${b.count} pass${b.count === 1 ? "" : "es"}"
              aria-label="${escapeHtml(full)}: ${b.count} pass${b.count === 1 ? "" : "es"}"></div>
          </div>
          <span class="an-x">${showLabel ? label : ""}</span>
        </div>`;
    })
    .join("");

  chart.innerHTML = `<div class="an-plot">${grid}<div class="an-bars">${bars}</div></div>`;

  // hover / keyboard tooltip
  const tip = document.getElementById("an-tip");
  chart.querySelectorAll(".an-bar").forEach((bar) => {
    const show = () => {
      tip.textContent = bar.dataset.tip;
      tip.classList.remove("hidden");
      const card = tip.offsetParent.getBoundingClientRect(); // the tooltip is positioned inside the white card
      const r = bar.getBoundingClientRect();
      tip.style.left = `${r.left - card.left + r.width / 2}px`;
      tip.style.top = `${r.top - card.top - 8}px`;
    };
    bar.addEventListener("mouseenter", show);
    bar.addEventListener("focus", show);
    bar.addEventListener("mouseleave", () => tip.classList.add("hidden"));
    bar.addEventListener("blur", () => tip.classList.add("hidden"));
  });
}

function topList(rows, emptyText) {
  if (rows.length === 0) return `<p class="an-empty">${emptyText}</p>`;
  const max = Math.max(...rows.map((r) => r.count));
  return rows
    .map(
      (r) => `
      <div class="an-row">
        <div class="an-row-top"><span class="an-row-name">${escapeHtml(r.name)}</span><b>${r.count}</b></div>
        <div class="an-row-bar"><i style="width:${(r.count / max) * 100}%"></i></div>
        <div class="an-row-sub">${escapeHtml(r.sub)}</div>
      </div>`
    )
    .join("");
}

function renderRanks(passes) {
  const byRoom = new Map();
  const byStudent = new Map();
  passes.forEach((p) => {
    const dur = Math.max(0, p.endTime - p.startTime);
    const roomKey = `${p.categoryKey}|${p.name}`;
    const r = byRoom.get(roomKey) || { name: p.name, count: 0, ms: 0 };
    r.count += 1;
    r.ms += dur;
    byRoom.set(roomKey, r);

    const s = byStudent.get(p.student) || { name: p.student, count: 0, ms: 0, overtime: 0 };
    s.count += 1;
    s.ms += dur;
    if (p.overtime) s.overtime += 1;
    byStudent.set(p.student, s);
  });

  const rooms = [...byRoom.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((r) => ({ name: r.name, count: r.count, sub: `Average ${formatDuration(r.ms / r.count)}` }));
  const people = [...byStudent.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((s) => ({
      name: s.name,
      count: s.count,
      sub: `${minutesText(s.ms)} out of class${s.overtime ? ` · ${s.overtime} overtime` : ""}`,
    }));

  document.getElementById("an-rooms").innerHTML = topList(rooms, "No passes in this range yet.");
  document.getElementById("an-students").innerHTML = topList(people, "No passes in this range yet.");
}

function renderAnalytics() {
  const passes = passesInRange();
  renderTiles(passes);
  renderChart(passes);
  renderRanks(passes);
}

document.querySelectorAll("#an-range .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    analyticsDays = Number(btn.dataset.days);
    document.querySelectorAll("#an-range .seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    renderAnalytics();
  });
});

/* CSV export of the passes in the chosen range */

function csvCell(value) {
  let text = String(value ?? "");
  // a cell that starts with = + - or @ can be run as a formula by a spreadsheet, so defuse it
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function stamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

document.getElementById("an-export").addEventListener("click", () => {
  const passes = passesInRange().sort((a, b) => a.startTime - b.startTime);
  if (passes.length === 0) return showToast("There are no passes in this range to export.", "warn");

  const header = ["Student", "Destination", "Room", "Started", "Ended", "Minutes", "Overtime", "Message"];
  const lines = passes.map((p) =>
    [
      p.student,
      p.name,
      p.room || "",
      stamp(p.startTime),
      stamp(p.endTime),
      (Math.max(0, p.endTime - p.startTime) / 60000).toFixed(1),
      p.overtime ? "Yes" : "No",
      p.message || "",
    ]
      .map(csvCell)
      .join(",")
  );
  const csv = "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `smartpass-passes-${stamp(Date.now()).slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Exported ${passes.length} pass${passes.length === 1 ? "" : "es"}.`, "success");
});

/* ---------- Pass rules ---------- */

let ruleDraft = { cooldownMinutes: 0, hallwayMax: 0 };
let rulesDirty = false;

function paintRuleChips() {
  document.querySelectorAll(".rule-chips").forEach((group) => {
    const current = ruleDraft[group.dataset.key];
    group.querySelectorAll("button").forEach((b) => b.classList.toggle("active", Number(b.dataset.v) === current));
  });
}

function syncRuleDraftFromServer() {
  ruleDraft = { cooldownMinutes: schoolRules.cooldownMinutes || 0, hallwayMax: schoolRules.hallwayMax || 0 };
  rulesDirty = false;
  paintRuleChips();
}

document.querySelectorAll(".rule-chips button").forEach((b) => {
  b.addEventListener("click", () => {
    ruleDraft[b.parentElement.dataset.key] = Number(b.dataset.v);
    rulesDirty = true;
    document.getElementById("rules-saved").classList.add("hidden");
    paintRuleChips();
  });
});

document.getElementById("rules-save").addEventListener("click", async (e) => {
  e.target.disabled = true;
  const res = await teacherApi("/api/teacher/rules", ruleDraft);
  e.target.disabled = false;
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showToast(res.data.error || "Couldn't save the rules.", "warn");
  schoolRules = res.data;
  rulesDirty = false;
  const saved = document.getElementById("rules-saved");
  saved.classList.remove("hidden");
  setTimeout(() => saved.classList.add("hidden"), 2200);
  showToast("Pass rules saved.", "success");
});

/* ---------- Emergency mode ---------- */

let emergencyArmed = false;
let emergencyArmTimer = null;

function renderEmergency() {
  const on = !!schoolRules.emergency;
  const status = document.getElementById("em-status");
  status.className = `em-status ${on ? "on" : ""}`;
  status.innerHTML = on
    ? `<span class="em-dot"></span><div><b>Emergency mode is on</b><span>Since ${timeOfDay(schoolRules.emergencySince)}${schoolRules.emergencyBy ? ` · started by ${escapeHtml(schoolRules.emergencyBy)}` : ""}</span></div>`
    : `<span class="em-dot"></span><div><b>Emergency mode is off</b><span>Student passes are working normally.</span></div>`;

  const btn = document.getElementById("em-toggle");
  btn.className = `btn em-btn ${on ? "em-off" : "em-on"} ${emergencyArmed ? "armed" : ""}`;
  btn.textContent = on ? "Turn off emergency mode" : emergencyArmed ? "Tap again to turn it on" : "Turn on emergency mode";
}

function renderEmergencyHall() {
  const out = students.filter((s) => s.active);
  document.getElementById("em-count").textContent = out.length;
  const now = serverTime();
  document.getElementById("em-hall").innerHTML = out.length
    ? out
        .map((s) => {
          const remaining = s.active.endTime - now;
          const status = remaining > 0 ? `${clock(remaining, true)} left` : `Overtime +${clock(-remaining, false)}`;
          return `
          <div class="em-person ${remaining > 0 ? "" : "over"}">
            ${avatarHtml(s)}
            <div class="em-person-info"><b>${escapeHtml(s.name)}</b><span>${escapeHtml(s.active.room.name)}${s.active.from ? ` · from ${escapeHtml(s.active.from.name)}` : ""}</span></div>
            <span class="em-person-time">${status}</span>
          </div>`;
        })
        .join("")
    : `<p class="an-empty">Nobody is out on a pass. Everyone is in class.</p>`;
}

async function setEmergency(on) {
  const res = await teacherApi("/api/teacher/emergency", { on });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showToast(res.data.error || "Couldn't change emergency mode.", "warn");
  schoolRules = res.data;
  emergencyArmed = false;
  onRulesUpdate();
  showToast(on ? "Emergency mode is on. Student passes are paused." : "Emergency mode is off.", on ? "warn" : "success");
}

document.getElementById("em-toggle").addEventListener("click", () => {
  if (schoolRules.emergency) return setEmergency(false);
  // turning it ON takes two taps so it can't happen by accident
  if (!emergencyArmed) {
    emergencyArmed = true;
    renderEmergency();
    clearTimeout(emergencyArmTimer);
    emergencyArmTimer = setTimeout(() => {
      emergencyArmed = false;
      renderEmergency();
    }, 4000);
    return;
  }
  clearTimeout(emergencyArmTimer);
  setEmergency(true);
});

document.getElementById("t-emergency-off").addEventListener("click", () => setEmergency(false));

/* ---------- hooks called by teacher-dashboard.js ---------- */

// the red bar shows on every teacher page while emergency mode is on, except on the Emergency page itself (it has its own status)
function updateEmergencyBar() {
  document.getElementById("t-emergency-bar").classList.toggle("hidden", !schoolRules.emergency || panelVisible("emergency"));
}

function onRulesUpdate() {
  updateEmergencyBar();
  renderEmergency();
  if (!rulesDirty) syncRuleDraftFromServer();
}

function onStudentsUpdate() {
  if (panelVisible("analytics")) renderAnalytics();
  if (panelVisible("emergency")) renderEmergencyHall();
}

function onAdminTab(tab) {
  updateEmergencyBar();
  if (tab === "analytics") renderAnalytics();
  if (tab === "rules") syncRuleDraftFromServer();
  if (tab === "emergency") {
    renderEmergency();
    renderEmergencyHall();
  }
}

// the hall list shows a live countdown, so keep it ticking while that panel is open
setInterval(() => {
  if (panelVisible("emergency")) renderEmergencyHall();
}, 1000);

onRulesUpdate();
