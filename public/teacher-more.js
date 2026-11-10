/* Admin pages: Bell Schedule, ID Cards, Wrapped, Data Concierge and the Help center.
   Runs after teacher-admin.js (uses students, teacherApi, adminTabHandlers, studentsListeners, ...). */

function panelOpen(name) {
  const panel = document.querySelector(`.t-panel[data-panel="${name}"]`);
  return !!panel && !panel.classList.contains("hidden") && currentView === "settings";
}

function showFormError(el, message) {
  el.textContent = message;
  el.classList.toggle("hidden", !message);
}

/* ================= Bell Schedule ================= */

let bellDraft = { yearName: "", startDate: "", endDate: "", periods: [], holidays: [] };
let bellDirty = false;
const bellError = document.getElementById("bell-error");

function paintBellNow() {
  const info = bellInfo(bellDraft, new Date());
  const el = document.getElementById("bell-now");
  if (!info) {
    el.innerHTML = `<span class="bell-now-label">Right now</span><b>Add some periods to see how today looks.</b>`;
    return;
  }
  el.innerHTML = `<span class="bell-now-label">Right now</span><b>${idEscape(info.title)}</b><span>${idEscape(info.detail)}</span>`;
}

function renderBell() {
  document.getElementById("bell-year-name").value = bellDraft.yearName;
  document.getElementById("bell-start").value = bellDraft.startDate;
  document.getElementById("bell-end").value = bellDraft.endDate;

  const periodsEl = document.getElementById("bell-periods");
  periodsEl.innerHTML = bellDraft.periods.length
    ? bellDraft.periods
        .map(
          (p, i) => `
        <div class="bell-row" data-i="${i}">
          <input type="text" class="t-search bell-name" maxlength="30" value="${idEscape(p.name)}" aria-label="Period name">
          <input type="time" class="t-search bell-from" value="${p.start}" aria-label="Starts">
          <span class="bell-to">to</span>
          <input type="time" class="t-search bell-until" value="${p.end}" aria-label="Ends">
          <button type="button" class="icon-x" data-del-period="${i}" aria-label="Remove ${idEscape(p.name)}">×</button>
        </div>`
        )
        .join("")
    : `<p class="an-empty">No periods yet. Add one, or start from a typical day.</p>`;

  periodsEl.querySelectorAll(".bell-row").forEach((row) => {
    const i = Number(row.dataset.i);
    row.querySelector(".bell-name").addEventListener("input", (e) => ((bellDraft.periods[i].name = e.target.value), (bellDirty = true), paintBellNow()));
    row.querySelector(".bell-from").addEventListener("input", (e) => ((bellDraft.periods[i].start = e.target.value), (bellDirty = true), paintBellNow()));
    row.querySelector(".bell-until").addEventListener("input", (e) => ((bellDraft.periods[i].end = e.target.value), (bellDirty = true), paintBellNow()));
  });
  periodsEl.querySelectorAll("[data-del-period]").forEach((b) =>
    b.addEventListener("click", () => {
      bellDraft.periods.splice(Number(b.dataset.delPeriod), 1);
      bellDirty = true;
      renderBell();
    })
  );

  document.getElementById("bell-holiday-count").textContent = bellDraft.holidays.length;
  const holEl = document.getElementById("bell-holidays");
  holEl.innerHTML = bellDraft.holidays
    .map(
      (h, i) => `
      <div class="bell-hol">
        <span class="bell-hol-name">${idEscape(h.name)}</span>
        <span class="bell-hol-date">${new Date(`${h.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</span>
        <button type="button" class="icon-x" data-del-hol="${i}" aria-label="Remove ${idEscape(h.name)}">×</button>
      </div>`
    )
    .join("");
  holEl.querySelectorAll("[data-del-hol]").forEach((b) =>
    b.addEventListener("click", () => {
      bellDraft.holidays.splice(Number(b.dataset.delHol), 1);
      bellDirty = true;
      renderBell();
    })
  );
  paintBellNow();
}

async function loadBell() {
  if (bellDirty) return renderBell(); // keep unsaved edits when coming back to the page
  const res = await apiFetch("/api/schedule");
  const saved = res.ok ? res.data.schedule : null;
  bellDraft = saved
    ? { yearName: saved.yearName || "", startDate: saved.startDate || "", endDate: saved.endDate || "", periods: saved.periods.map((p) => ({ ...p })), holidays: saved.holidays.map((h) => ({ ...h })) }
    : { yearName: "", startDate: "", endDate: "", periods: [], holidays: [] };
  renderBell();
}

["bell-year-name", "bell-start", "bell-end"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    bellDraft.yearName = document.getElementById("bell-year-name").value;
    bellDraft.startDate = document.getElementById("bell-start").value;
    bellDraft.endDate = document.getElementById("bell-end").value;
    bellDirty = true;
    paintBellNow();
  });
});

document.getElementById("bell-template").addEventListener("click", () => {
  bellDraft.periods = TYPICAL_DAY.map((p) => ({ ...p }));
  bellDirty = true;
  renderBell();
});

document.getElementById("bell-add-period").addEventListener("click", () => {
  const last = bellDraft.periods[bellDraft.periods.length - 1];
  // the next period starts a few minutes after the last one ends
  const startMin = last ? bellMinutes(last.end) + 5 : 8 * 60;
  const pad = (n) => String(n).padStart(2, "0");
  const to = (m) => `${pad(Math.min(23, Math.floor(m / 60)))}:${pad(m % 60)}`;
  bellDraft.periods.push({ name: `Period ${bellDraft.periods.length + 1}`, start: to(startMin), end: to(Math.min(23 * 60 + 59, startMin + 50)) });
  bellDirty = true;
  renderBell();
});

document.getElementById("hol-add").addEventListener("click", () => {
  const name = document.getElementById("hol-name").value.trim();
  const date = document.getElementById("hol-date").value;
  if (!name || !date) return showFormError(bellError, "Give the holiday a name and pick a date.");
  showFormError(bellError, "");
  bellDraft.holidays.push({ name, date });
  bellDraft.holidays.sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById("hol-name").value = "";
  document.getElementById("hol-date").value = "";
  bellDirty = true;
  renderBell();
});

document.getElementById("bell-save").addEventListener("click", async (e) => {
  showFormError(bellError, "");
  e.target.disabled = true;
  const res = await teacherApi("/api/teacher/schedule", bellDraft);
  e.target.disabled = false;
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showFormError(bellError, res.data.error || "Couldn't save the schedule.");
  bellDirty = false;
  bellDraft = res.data.schedule;
  renderBell();
  showToast("Bell schedule saved.", "success");
});

adminTabHandlers.bell = loadBell;
setInterval(() => panelOpen("bell") && paintBellNow(), 20000);

/* ================= ID Cards ================= */

const IDC_COLORS = ["#00b476", "#2599d6", "#6a58f2", "#b00ee0", "#d92d3f", "#f59300", "#1f195e", "#0f766e"];
let idcSettings = { enabled: true, color: "#00b476", school: "", backText: "", barcode: "barcode" };
let idcLoaded = false;
const idcError = document.getElementById("idc-error");

function sampleStudent() {
  const real = students.find((s) => s.studentId) || students[0];
  return real
    ? { name: real.name, photo: real.photo, avatarColor: real.avatarColor, studentId: real.studentId || "1234567", grade: real.grade }
    : { name: "Alex Student", avatarColor: "#6a58f2", studentId: "1234567", grade: "7" };
}

function paintIdPreview() {
  const holder = document.getElementById("idc-preview-card");
  holder.innerHTML = idCardMarkup(sampleStudent(), idcSettings);
  holder.querySelector(".idc-card").addEventListener("click", (e) => e.currentTarget.classList.toggle("flipped"));
}

function paintIdForm() {
  document.getElementById("idc-enabled").checked = idcSettings.enabled !== false;
  document.getElementById("idc-school").value = idcSettings.school || "";
  document.getElementById("idc-back").value = idcSettings.backText || "";
  document.getElementById("idc-swatches").innerHTML = IDC_COLORS.map(
    (c) => `<button type="button" class="idc-swatch ${c === idcSettings.color ? "on" : ""}" style="background:${c}" data-color="${c}" aria-label="Card color ${c}"></button>`
  ).join("");
  document.querySelectorAll("#idc-style .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.style === idcSettings.barcode));
  paintIdPreview();
}

document.getElementById("idc-swatches").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-color]");
  if (!btn) return;
  idcSettings.color = btn.dataset.color;
  paintIdForm();
});
document.getElementById("idc-school").addEventListener("input", (e) => ((idcSettings.school = e.target.value), paintIdPreview()));
document.getElementById("idc-back").addEventListener("input", (e) => ((idcSettings.backText = e.target.value), paintIdPreview()));
document.getElementById("idc-enabled").addEventListener("change", (e) => (idcSettings.enabled = e.target.checked));
document.querySelectorAll("#idc-style .seg-btn").forEach((b) =>
  b.addEventListener("click", () => {
    idcSettings.barcode = b.dataset.style;
    paintIdForm();
  })
);

document.getElementById("idc-save").addEventListener("click", async (e) => {
  showFormError(idcError, "");
  e.target.disabled = true;
  const res = await teacherApi("/api/teacher/idcard-settings", idcSettings);
  e.target.disabled = false;
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showFormError(idcError, res.data.error || "Couldn't save the ID card settings.");
  idcSettings = res.data.settings;
  showToast("ID card settings saved.", "success");
});

adminTabHandlers.idcards = async () => {
  if (!idcLoaded) {
    const res = await apiFetch("/api/idcard-settings");
    if (res.ok && res.data.settings) idcSettings = { ...idcSettings, ...res.data.settings };
    idcLoaded = true;
  }
  paintIdForm();
};

/* ================= Wrapped ================= */

function renderWrapped() {
  const all = allFinishedPasses();
  const body = document.getElementById("wrapped-body");
  if (all.length === 0) {
    body.innerHTML = `<div class="t-admin-card wrapped-empty"><h2>Nothing to wrap up yet</h2><p>Once students start making passes, your recap shows up here.</p></div>`;
    return;
  }

  const totalMs = all.reduce((sum, p) => sum + Math.max(0, p.endTime - p.startTime), 0);
  const overtime = all.filter((p) => p.overtime).length;
  const people = new Set(all.map((p) => p.student));
  const longest = all.reduce((a, b) => (b.endTime - b.startTime > a.endTime - a.startTime ? b : a));

  const tally = (keyFn) => {
    const m = new Map();
    all.forEach((p) => m.set(keyFn(p), (m.get(keyFn(p)) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const rooms = tally((p) => p.name).slice(0, 5);
  const bathrooms = all.filter((p) => p.categoryKey === "restrooms");
  const topBath = bathrooms.length
    ? [...bathrooms.reduce((m, p) => m.set(p.name, (m.get(p.name) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1])[0]
    : null;
  const weekdays = tally((p) => new Date(p.startTime).toLocaleDateString("en-US", { weekday: "long" }));
  const hours = tally((p) => new Date(p.startTime).getHours());
  const fliers = tally((p) => p.student);
  const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  const maxRoom = rooms[0][1];

  const hrs = totalMs / 3600000;
  body.innerHTML = `
    <div class="wr-hero">
      <span class="wr-kicker">SmartPass Wrapped</span>
      <h2>${all.length.toLocaleString()} passes</h2>
      <p>${people.size} student${people.size === 1 ? "" : "s"} spent ${hrs >= 1 ? `${hrs.toFixed(1)} hours` : `${Math.round(totalMs / 60000)} minutes`} out of class on a hall pass.</p>
    </div>

    <div class="wr-grid">
      <div class="wr-card c1"><span>Most popular place</span><b>${idEscape(rooms[0][0])}</b><em>${rooms[0][1]} passes</em></div>
      <div class="wr-card c2"><span>Busiest day</span><b>${idEscape(weekdays[0][0])}</b><em>${weekdays[0][1]} passes</em></div>
      <div class="wr-card c3"><span>Busiest hour</span><b>${hourLabel(hours[0][0])}</b><em>${hours[0][1]} passes</em></div>
      <div class="wr-card c4"><span>Top pass-taker</span><b>${idEscape(fliers[0][0])}</b><em>${fliers[0][1]} passes</em></div>
      <div class="wr-card c5"><span>Longest pass</span><b>${formatDuration(longest.endTime - longest.startTime)}</b><em>${idEscape(longest.student)} · ${idEscape(longest.name)}</em></div>
      <div class="wr-card c6"><span>Went overtime</span><b>${Math.round((overtime / all.length) * 100)}%</b><em>${overtime} of ${all.length} passes</em></div>
      ${topBath ? `<div class="wr-card c7"><span>Favorite bathroom</span><b>${idEscape(topBath[0])}</b><em>${topBath[1]} visits</em></div>` : ""}
      <div class="wr-card c8"><span>Average per student</span><b>${(all.length / people.size).toFixed(1)}</b><em>passes each</em></div>
    </div>

    <div class="t-admin-card wr-rooms">
      <h3 class="an-h" style="margin-top:0">Top places</h3>
      ${rooms
        .map(
          ([name, n]) => `
        <div class="an-row"><div class="an-row-top"><span class="an-row-name">${idEscape(name)}</span><b>${n}</b></div>
        <div class="an-row-bar"><i style="width:${(n / maxRoom) * 100}%"></i></div></div>`
        )
        .join("")}
    </div>`;
}

adminTabHandlers.wrapped = renderWrapped;
studentsListeners.push(() => panelOpen("wrapped") && renderWrapped());

/* ================= Data Concierge ================= */

const conciergeMsg = document.getElementById("concierge-message");
const conciergeError = document.getElementById("concierge-error");

conciergeMsg.addEventListener("input", () => {
  document.getElementById("concierge-count").textContent = `${conciergeMsg.value.length} / 1000`;
});

async function loadConcierge() {
  const res = await teacherApi("/api/teacher/concierge");
  if (res.status === 401) return kickToSignIn();
  const list = res.ok ? res.data.requests : [];
  document.getElementById("concierge-list").innerHTML = list.length
    ? list
        .map(
          (r) => `
        <div class="cc-item">
          <div class="cc-top"><span class="cc-status">${r.status === "received" ? "Received" : idEscape(r.status)}</span><span>${new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>
          <p>${idEscape(r.message)}</p>
        </div>`
        )
        .join("")
    : `<p class="an-empty">You haven't sent any requests yet.</p>`;
}

document.getElementById("concierge-send").addEventListener("click", async (e) => {
  showFormError(conciergeError, "");
  const message = conciergeMsg.value.trim();
  if (!message) return showFormError(conciergeError, "Tell us what data you're looking for first.");
  e.target.disabled = true;
  const res = await teacherApi("/api/teacher/concierge", { message });
  e.target.disabled = false;
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showFormError(conciergeError, res.data.error || "Couldn't send that.");
  conciergeMsg.value = "";
  document.getElementById("concierge-count").textContent = "0 / 1000";
  showToast("Request sent to your Data Concierge.", "success");
  loadConcierge();
});

adminTabHandlers.concierge = loadConcierge;

/* ================= Help center ================= */

const HELP_ARTICLES = [
  { q: "How do I create a pass for a student?", a: "Click a student on the Home tab, then press Create Pass. Pick a room (or a custom place), choose how many minutes they have, and add a message if you like. The pass starts right away on their screen." },
  { q: "How do students ask for a pass instead of just going?", a: "Open a student on the Home tab and turn on Request only. After that they send a request, and you approve or deny it from the Hall Monitor tab." },
  { q: "How do I limit how many passes a student can use?", a: "On a student's page, use Passes per day (Off, 3, 2, 1 or None). For school-wide limits go to Admin → Accounts → Pass Limits, where you can set a cooldown between passes and a hallway maximum." },
  { q: "How do I add or change a room or class?", a: "Go to Admin → Rooms to edit the built-in places, or Admin → Classes to add your own. You can change the name, room number, picture and maximum time, and reset any built-in place to its defaults." },
  { q: "What's a maximum time on a class?", a: "It's the most minutes a student can ask for when going to that place. The time slider stops at that number, and the server enforces it too." },
  { q: "What does Emergency mode do?", a: "Admin → Emergency pauses new student passes everywhere and puts a red banner on every student screen. Passes already running keep going and show up in the \"In the hallway right now\" list. Turn it on with two taps; turn it off with one." },
  { q: "A student forgot their password. What do I do?", a: "Open the student on the Home tab and press Show student password (you'll need your code). From the box you can copy it, or reset it so they pick a new one next time they sign in." },
  { q: "How do I export my pass data?", a: "Admin → Analytics → Export CSV downloads every pass in the time range you've chosen, ready for a spreadsheet." },
  { q: "How do scheduled passes work?", a: "Students use Schedule Pass to pick a date and time. When the time comes (and they're free) the pass starts by itself. They'll see it on their Calendar." },
  { q: "How do I set up the bell schedule?", a: "Admin → Bell Schedule. Name the school year, set the periods of a regular day (or start from a typical day) and add holidays. Home screens then show the current period." },
  { q: "How does Flex work?", a: "Create activities on the Flex tab with a date, time, place and a limit on how many can join. Students sign up from their own Flex tab. Take attendance from the activity page, and add a student yourself to lock them in." },
  { q: "How do digital ID cards work?", a: "Admin → ID Cards lets you pick the card color, school name and the info on the back. Students open their card from the menu under their picture; it shows their ID number as a barcode." },
];

function renderHelp() {
  const term = document.getElementById("help-search").value.trim().toLowerCase();
  const shown = HELP_ARTICLES.filter((a) => !term || `${a.q} ${a.a}`.toLowerCase().includes(term));
  document.getElementById("help-list").innerHTML = shown
    .map((a) => `<details class="help-item"><summary>${idEscape(a.q)}</summary><p>${idEscape(a.a)}</p></details>`)
    .join("");
  document.getElementById("help-empty").classList.toggle("hidden", shown.length > 0);
}

document.getElementById("help-search").addEventListener("input", renderHelp);
adminTabHandlers.help = () => {
  document.getElementById("help-search").value = "";
  renderHelp();
};

document.getElementById("suggest-send").addEventListener("click", async (e) => {
  const box = document.getElementById("suggest-message");
  const message = box.value.trim();
  if (!message) return showToast("Write your idea first.", "warn");
  e.target.disabled = true;
  const res = await teacherApi("/api/teacher/suggest", { message });
  e.target.disabled = false;
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showToast(res.data.error || "Couldn't send that.", "warn");
  box.value = "";
  showToast("Thanks! Your idea was sent.", "success");
});

/* ================= Student ID number + grade (from Accounts) ================= */

const idEditOverlay = document.getElementById("idedit-overlay");
let idEditKey = null;

function openIdEdit(key) {
  const s = studentMap.get(key);
  if (!s) return;
  idEditKey = key;
  document.getElementById("idedit-sub").textContent = `${s.name}'s number on their digital ID card.`;
  document.getElementById("idedit-id").value = s.studentId || "";
  document.getElementById("idedit-grade").value = s.grade || "";
  showFormError(document.getElementById("idedit-error"), "");
  openOverlay(idEditOverlay);
  document.getElementById("idedit-id").focus();
}

document.getElementById("idedit-cancel").addEventListener("click", () => closeOverlay(idEditOverlay));
idEditOverlay.addEventListener("click", (e) => e.target === idEditOverlay && closeOverlay(idEditOverlay));
document.getElementById("idedit-save").addEventListener("click", async (e) => {
  const err = document.getElementById("idedit-error");
  showFormError(err, "");
  e.target.disabled = true;
  const res = await teacherApi("/api/teacher/student/id", {
    key: idEditKey,
    studentId: document.getElementById("idedit-id").value,
    grade: document.getElementById("idedit-grade").value,
  });
  e.target.disabled = false;
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showFormError(err, res.data.error || "Couldn't save that.");
  closeOverlay(idEditOverlay);
  showToast("ID number saved.", "success");
  refresh(true);
});

/* ================= the school-day pill on the Dashboard ================= */

let dashSchedule = null;

function paintDashBell() {
  const el = document.getElementById("dash-bell");
  const info = bellInfo(dashSchedule);
  if (!info) return el.classList.add("hidden");
  el.className = `bell-pill ${info.kind}`;
  el.innerHTML = `<b>${idEscape(info.title)}</b><span>${idEscape(info.detail)}</span>`;
}

async function loadDashBell() {
  const res = await apiFetch("/api/schedule");
  if (res.ok) dashSchedule = res.data.schedule;
  paintDashBell();
}

loadDashBell();
setInterval(paintDashBell, 20000);
setInterval(loadDashBell, 5 * 60000);
// after the bell schedule is saved, show the new one right away
document.getElementById("bell-save").addEventListener("click", () => setTimeout(loadDashBell, 900));

/* ================= Print ID cards + the kiosk link ================= */

const idpDeselected = new Set(); // keys of students unticked for printing (everyone is ticked by default)

function renderPrintList() {
  const list = document.getElementById("idp-list");
  const eligible = students.filter((s) => s.studentId);
  list.innerHTML = eligible.length
    ? eligible
        .map(
          (s) => `
        <label class="idp-row">
          <input type="checkbox" data-key="${idEscape(s.key)}" ${idpDeselected.has(s.key) ? "" : "checked"}>
          ${avatarHtml(s)}
          <span class="idp-name">${idEscape(s.name)}</span>
          <span class="idp-id">${idEscape(s.studentId)}${s.grade ? ` · Gr ${idEscape(s.grade)}` : ""}</span>
        </label>`
        )
        .join("")
    : `<p class="an-empty">No students yet. Cards appear here once students have signed in.</p>`;
  list.querySelectorAll("input[data-key]").forEach((box) =>
    box.addEventListener("change", () => {
      box.checked ? idpDeselected.delete(box.dataset.key) : idpDeselected.add(box.dataset.key);
      updatePrintCount();
    })
  );
  updatePrintCount();
}

function selectedForPrint() {
  return students.filter((s) => s.studentId && !idpDeselected.has(s.key));
}

function updatePrintCount() {
  const n = selectedForPrint().length;
  document.getElementById("idp-count").textContent = `${n} card${n === 1 ? "" : "s"} · ${Math.ceil(n / 8) || 0} page${Math.ceil(n / 8) === 1 ? "" : "s"}`;
  document.getElementById("idp-print").disabled = n === 0;
  document.getElementById("idp-all").checked = students.filter((s) => s.studentId).every((s) => !idpDeselected.has(s.key));
}

document.getElementById("idp-all").addEventListener("change", (e) => {
  students.forEach((s) => (e.target.checked ? idpDeselected.delete(s.key) : idpDeselected.add(s.key)));
  renderPrintList();
});

document.getElementById("idp-print").addEventListener("click", () => {
  const picked = selectedForPrint();
  if (picked.length === 0) return showToast("Pick at least one student.", "warn");
  printIdCards(picked, idcSettings);
});

document.getElementById("kiosk-url").textContent = `${location.origin}/smartpass-kiosk`;

adminTabHandlers.idcards = (() => {
  const previous = adminTabHandlers.idcards;
  return async () => {
    await previous();
    renderPrintList();
  };
})();
studentsListeners.push(() => panelOpen("idcards") && renderPrintList());
