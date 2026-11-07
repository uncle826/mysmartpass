/* Flex (teacher): create activities students can sign up for, see the roster, take attendance,
   and add a student yourself (which locks them in). Runs after teacher-calendar.js. */

const flexRoot = document.getElementById("flex-view");
const FLEX_COLORS = ["#6a58f2", "#00b476", "#2599d6", "#f59300", "#d92d3f", "#b00ee0", "#0f766e", "#1f195e"];
let flexActs = [];
let flexSel = null; // an activity id, "new", or null
let flexBuilt = false;
let flexLoaded = false;
let flexColor = FLEX_COLORS[0];
let flexDeleteArmed = false;

const flexDayText = (day) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const flexTimeText = (a) => `${bellClock(a.start)} – ${bellClock(a.end)}`;

function buildFlex() {
  flexRoot.innerHTML = `
    <div class="flex-page">
      <aside class="flex-list-col">
        <div class="flex-list-head">
          <h2>Flex activities</h2>
          <button type="button" class="btn btn-primary" id="flex-new">+ New</button>
        </div>
        <div id="flex-list"></div>
      </aside>
      <section class="flex-detail" id="flex-detail"></section>
    </div>`;
  document.getElementById("flex-new").addEventListener("click", () => {
    flexSel = "new";
    flexColor = FLEX_COLORS[0];
    renderFlexList();
    renderFlexDetail();
  });
  flexBuilt = true;
}

async function loadFlex() {
  const res = await teacherApi("/api/teacher/flex");
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return;
  flexActs = res.data.activities;
  flexLoaded = true;
  renderFlexList();
  if (typeof flexSel === "number") {
    if (!flexActs.some((a) => a.id === flexSel)) {
      flexSel = null;
      renderFlexDetail();
    } else {
      renderFlexRoster(); // only the roster refreshes, so a form being edited isn't wiped
    }
  } else if (flexSel === null) {
    renderFlexDetail();
  }
}

function renderFlexList() {
  const list = document.getElementById("flex-list");
  if (!flexLoaded) return (list.innerHTML = `<p class="an-empty">Loading…</p>`);
  if (flexActs.length === 0) {
    list.innerHTML = `<p class="an-empty">No activities yet. Press <b>New</b> to make one.</p>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  let lastDay = "";
  list.innerHTML = flexActs
    .map((a) => {
      const header = a.day !== lastDay ? `<div class="flex-day">${flexDayText(a.day)}${a.day < today ? " · past" : ""}</div>` : "";
      lastDay = a.day;
      const full = a.capacity > 0 && a.signups.length >= a.capacity;
      return `${header}
        <button type="button" class="flex-item ${a.id === flexSel ? "on" : ""}" data-id="${a.id}" style="--c:${a.color}">
          <i></i>
          <span class="flex-item-main"><b>${idEscape(a.name)}</b><span>${flexTimeText(a)}${a.location ? ` · ${idEscape(a.location)}` : ""}</span></span>
          <span class="flex-count ${full ? "full" : ""}">${a.signups.length}${a.capacity > 0 ? `/${a.capacity}` : ""}</span>
        </button>`;
    })
    .join("");
  list.querySelectorAll(".flex-item").forEach((b) =>
    b.addEventListener("click", () => {
      flexSel = Number(b.dataset.id);
      flexDeleteArmed = false;
      flexColor = flexActs.find((a) => a.id === flexSel).color;
      renderFlexList();
      renderFlexDetail();
    })
  );
}

function renderFlexDetail() {
  const el = document.getElementById("flex-detail");
  if (flexSel === null) {
    el.innerHTML = `<div class="flex-placeholder"><svg viewBox="0 0 24 24"><rect x="2.8" y="2.8" width="5.2" height="5.2" rx="1.2" fill="currentColor"/><rect x="16" y="2.8" width="5.2" height="5.2" rx="1.2" fill="currentColor"/><rect x="2.8" y="16" width="5.2" height="5.2" rx="1.2" fill="currentColor"/><rect x="16" y="16" width="5.2" height="5.2" rx="1.2" fill="currentColor"/><path d="M8 5.4h8M8 18.6h8M5.4 8v8M18.6 8v8M8 8l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg><b>Pick an activity, or make a new one</b><span>Students sign up from their own Flex tab. You can also add a student yourself, and they can't leave it.</span></div>`;
    return;
  }

  const a = flexSel === "new" ? { name: "", description: "", location: "", day: new Date().toISOString().slice(0, 10), start: "13:00", end: "13:40", capacity: 0, signups: [] } : flexActs.find((x) => x.id === flexSel);
  const editing = flexSel !== "new";
  el.innerHTML = `
    <div class="t-admin-card flex-card">
      <h2>${editing ? "Edit activity" : "New activity"}</h2>
      <div class="form-grid">
        <label class="f-field wide">Name<input type="text" class="t-search" id="fx-name" maxlength="60" value="${idEscape(a.name)}" placeholder="e.g. Chess Club" autocomplete="off"></label>
        <label class="f-field">Date<input type="date" class="t-search" id="fx-day" value="${a.day}"></label>
        <label class="f-field">Starts<input type="time" class="t-search" id="fx-start" value="${a.start}"></label>
        <label class="f-field">Ends<input type="time" class="t-search" id="fx-end" value="${a.end}"></label>
        <label class="f-field">Where<input type="text" class="t-search" id="fx-loc" maxlength="40" value="${idEscape(a.location)}" placeholder="e.g. Room 214" autocomplete="off"></label>
        <label class="f-field">Most students <span class="f-hint">(0 = no limit)</span><input type="number" class="t-search" id="fx-cap" min="0" max="500" value="${a.capacity}"></label>
        <label class="f-field wide">About<input type="text" class="t-search" id="fx-desc" maxlength="200" value="${idEscape(a.description)}" placeholder="What will students do?" autocomplete="off"></label>
      </div>
      <div class="f-field">Color
        <div class="idc-swatches" id="fx-colors">${FLEX_COLORS.map((c) => `<button type="button" class="idc-swatch ${c === flexColor ? "on" : ""}" style="background:${c}" data-color="${c}" aria-label="Color ${c}"></button>`).join("")}</div>
      </div>
      <p class="f-error hidden" id="fx-error" role="alert"></p>
      <div class="f-row">
        <button type="button" class="btn btn-primary" id="fx-save">${editing ? "Save changes" : "Create activity"}</button>
        ${editing ? `<button type="button" class="btn btn-danger-outline" id="fx-delete">Delete activity</button>` : ""}
      </div>
    </div>
    ${editing ? `<div class="t-admin-card flex-card"><h3 class="an-h" style="margin-top:0">Who's in <span class="t-count" id="fx-count">0</span></h3><div id="flex-roster"></div></div>` : ""}`;

  document.getElementById("fx-colors").addEventListener("click", (e) => {
    const b = e.target.closest("[data-color]");
    if (!b) return;
    flexColor = b.dataset.color;
    document.querySelectorAll("#fx-colors .idc-swatch").forEach((s) => s.classList.toggle("on", s === b));
  });
  document.getElementById("fx-save").addEventListener("click", saveFlex);
  const del = document.getElementById("fx-delete");
  if (del) del.addEventListener("click", () => deleteFlex(del));
  if (editing) renderFlexRoster();
}

async function saveFlex(e) {
  const err = document.getElementById("fx-error");
  showFormError(err, "");
  const body = {
    id: typeof flexSel === "number" ? flexSel : undefined,
    name: document.getElementById("fx-name").value,
    day: document.getElementById("fx-day").value,
    start: document.getElementById("fx-start").value,
    end: document.getElementById("fx-end").value,
    location: document.getElementById("fx-loc").value,
    capacity: Number(document.getElementById("fx-cap").value || 0),
    description: document.getElementById("fx-desc").value,
    color: flexColor,
  };
  e.target.disabled = true;
  const res = await teacherApi("/api/teacher/flex", body);
  e.target.disabled = false;
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return showFormError(err, res.data.error || "Couldn't save that activity.");
  showToast(body.id ? "Activity saved." : "Activity created.", "success");
  flexSel = res.data.id;
  await loadFlex();
  renderFlexDetail();
}

function deleteFlex(btn) {
  if (!flexDeleteArmed) {
    flexDeleteArmed = true;
    btn.textContent = "Tap again to delete";
    setTimeout(() => {
      flexDeleteArmed = false;
      if (btn.isConnected) btn.textContent = "Delete activity";
    }, 4000);
    return;
  }
  flexDeleteArmed = false;
  const id = flexSel;
  teacherApi("/api/teacher/flex/delete", { id }).then(async (res) => {
    if (res.status === 401) return kickToSignIn();
    if (!res.ok) return showToast(res.data.error || "Couldn't delete that.", "warn");
    flexSel = null;
    showToast("Activity deleted.", "info");
    await loadFlex();
    renderFlexDetail();
  });
}

function renderFlexRoster() {
  const holder = document.getElementById("flex-roster");
  const a = flexActs.find((x) => x.id === flexSel);
  if (!holder || !a) return;
  document.getElementById("fx-count").textContent = a.capacity > 0 ? `${a.signups.length}/${a.capacity}` : a.signups.length;

  const inIds = new Set(a.signups.map((s) => s.key));
  const addable = students.filter((s) => !inIds.has(s.key));
  const rows = a.signups.length
    ? a.signups
        .map((s) => {
          const stu = studentMap.get(s.key);
          const av = stu ? avatarHtml(stu) : `<span class="t-avatar">${idEscape(s.name.charAt(0))}</span>`;
          return `
          <div class="fx-person">
            ${av}
            <span class="fx-name">${idEscape(s.name)}${s.locked ? '<em class="fx-lock">Assigned</em>' : ""}</span>
            <span class="fx-att" role="group" aria-label="Attendance for ${idEscape(s.name)}">
              <button type="button" class="${s.attended === true ? "on present" : ""}" data-att="1" data-key="${idEscape(s.key)}">Present</button>
              <button type="button" class="${s.attended === false ? "on absent" : ""}" data-att="0" data-key="${idEscape(s.key)}">Absent</button>
            </span>
            <button type="button" class="icon-x" data-remove="${idEscape(s.key)}" aria-label="Remove ${idEscape(s.name)}">×</button>
          </div>`;
        })
        .join("")
    : `<p class="an-empty">Nobody has signed up yet.</p>`;

  holder.innerHTML = `${rows}
    <div class="fx-add">
      <select class="t-search" id="fx-add-select" aria-label="Add a student"><option value="">Add a student…</option>${addable.map((s) => `<option value="${idEscape(s.key)}">${idEscape(s.name)}</option>`).join("")}</select>
      <button type="button" class="btn btn-outline" id="fx-add-btn">Add</button>
    </div>
    <p class="f-hint">Students you add can't take themselves out. Press a status again to clear it.</p>`;

  holder.querySelectorAll("[data-att]").forEach((b) =>
    b.addEventListener("click", async () => {
      const person = a.signups.find((s) => s.key === b.dataset.key);
      const want = b.dataset.att === "1";
      const next = person.attended === want ? null : want; // pressing the active one again clears it
      person.attended = next;
      renderFlexRoster();
      const res = await teacherApi("/api/teacher/flex/attendance", { id: a.id, key: person.key, attended: next });
      if (res.status === 401) return kickToSignIn();
      if (!res.ok) showToast("Couldn't save attendance.", "warn");
    })
  );
  holder.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", async () => {
      await teacherApi("/api/teacher/flex/remove", { id: a.id, key: b.dataset.remove });
      loadFlex();
    })
  );
  document.getElementById("fx-add-btn").addEventListener("click", async () => {
    const key = document.getElementById("fx-add-select").value;
    if (!key) return;
    const res = await teacherApi("/api/teacher/flex/assign", { id: a.id, key });
    if (res.status === 401) return kickToSignIn();
    if (!res.ok) return showToast(res.data.error || "Couldn't add them.", "warn");
    loadFlex();
  });
}

viewHandlers.flex = () => {
  if (!flexBuilt) buildFlex();
  renderFlexList();
  renderFlexDetail();
  loadFlex();
};
setInterval(() => currentView === "flex" && flexBuilt && loadFlex(), 6000);
