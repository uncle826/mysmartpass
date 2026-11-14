/* Admin > Rooms, in the style of SmartPass's own Rooms screen:
   a header card (Options / Edit / Add), a grid of gradient tiles, folders for groups of rooms, and a room settings
   dialog with a gradient header. Runs after teacher-more.js (uses teacherApi, kickToSignIn, showToast, fileToAvatar,
   customClasses, roomOverrides, adminTabHandlers, escapeHtml and the helpers in rooms.js). */

// teachers still need to see (and un-hide) rooms that are hidden from students
ROOMS_HIDE_HIDDEN = false;
rebuildRooms();

const RT_COLORS = ["#ebbb00", "#72cc1b", "#12c29e", "#07abc3", "#139be6", "#134482", "#6651f1", "#5352e4", "#ac0cdf", "#da389d", "#7e879d", "#f86f4d", "#f59602"];
const RT_COLOR_ROWS = [RT_COLORS.slice(0, 4), RT_COLORS.slice(4, 9), RT_COLORS.slice(9)];

// pictures from SmartPass's own icon library (every name here was checked to exist)
const RT_ICONS = (
  "school-house toilet-paper drinking-fountain book-shelf user-group-man-woman restaurant hospital stethoscope medical-doctor heart-with-pulse pill syringe first-aid " +
  "library books book open-book reading graduation-cap student-male classroom clipboard pencil pen ruler picture timetable calendar alarm-clock clock hourglass " +
  "bus school-bus walking running exercise swimming basketball football baseball volleyball stadium trophy medal music musical-notes guitar microphone theatre-mask " +
  "paint-brush paint-palette camera computer laptop imac keyboard console robot microscope test-tube globe map megaphone bell flag key lock unlock door exit-sign " +
  "stairs elevator car bicycle apple hamburger pizza sandwich shower wheelchair phone email chat comments speech-bubble handshake teamwork crowd conference counselor " +
  "puzzle idea idea-sharing star sun snowflake cloud umbrella leaf recycling gear wrench hammer broom trash document file folder scissors print scanner archive " +
  "fingerprint id-card badge front-desk building bank museum checklist task to-do compass workflow design buoy zoom-in bar-chart"
)
  .split(" ")
  .filter((n) => n !== "first-aid");

const RT_ICON_BASE = "https://storage.googleapis.com/sp-img-cdn/icons8-ios/";

const rt = { cat: null, edit: false, showHidden: true, showNumbers: false, optionsOpen: false };

/* ---------- colors ---------- */

function rtHexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function rtHslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// SmartPass tiles are a two-tone radial gradient: the room's color, drifting a little lighter and warmer at the edges
function rtPair(hex) {
  const [h, s, l] = rtHexToHsl(hex);
  return [hex, rtHslToHex((h + 10) % 360, Math.min(100, s + 4), Math.min(90, l + 7))];
}

const rtTileBg = (hex) => `radial-gradient(circle at 73% 71%, ${rtPair(hex)[0]}, ${rtPair(hex)[1]})`;
const rtHeadBg = (hex) => `radial-gradient(circle at 98% 97%, ${rtPair(hex)[0]}, ${rtPair(hex)[1]})`;

/* ---------- small helpers ---------- */

const RT_CHEVRON = '<svg class="rt-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const RT_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const RT_SLIDERS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="15" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const RT_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const RT_EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const RT_EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.7M6.5 7.9C3.8 9.7 2 12 2 12s3.6 6.5 10 6.5c1.4 0 2.7-.3 3.8-.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const RT_PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

function rtIconFor(entry, cat) {
  if (entry === cat.leaf && cat.leaf) return roomIconMarkup(entry.name, cat.key);
  return roomIconMarkup(entry.name, cat.key);
}

// a settings entry: the place plus the group it belongs to (and, for a class a teacher added, its id)
function rtEntry(r, cat) {
  const custom = customClasses.find((x) => x.name === r.name);
  return { ...r, categoryKey: cat.key, id: r.custom && custom ? custom.id : undefined };
}

function rtColorOf(entry, cat) {
  return (entry.settings && entry.settings.color) || cat.color;
}

/* ---------- the grid ---------- */

let rtItems = []; // what the tiles on screen stand for, by index

function renderRoomGrid() {
  const wrap = document.getElementById("rt-wrap");
  if (!wrap) return;
  const cat = rt.cat ? categoryByKey(rt.cat) : null;
  rtItems = [];

  let tiles;
  if (!cat) {
    tiles = CATEGORIES.map((c) => {
      if (c.leaf) {
        const e = rtEntry(c.leaf, c);
        return rtTile({ e, cat: c, color: rtColorOf(e, c), icon: roomIconMarkup(e.name, c.key), label: e.name, chevron: false, kind: "room" });
      }
      return rtTile({ cat: c, color: c.color, icon: categoryIconMarkup(c), label: c.label, chevron: true, kind: "folder" });
    });
  } else {
    const list = (cat.leaf ? [cat.leaf] : cat.rooms).map((r) => rtEntry(r, cat));
    tiles = list
      .filter((e) => rt.showHidden || !(e.settings && e.settings.hidden))
      .map((e) => rtTile({ e, cat, color: rtColorOf(e, cat), icon: rtIconFor(e, cat), label: e.name, chevron: false, kind: "room" }));
    if (tiles.length === 0) tiles = [];
  }

  const title = cat
    ? `<button type="button" class="rt-back" id="rt-back" aria-label="Back to all rooms">${RT_BACK}</button><span class="rt-crumb">Rooms</span><span class="rt-sep">/</span><span>${escapeHtml(cat.label)}</span>`
    : "<span>Rooms</span>";

  wrap.innerHTML = `
    <div class="rt-head">
      <div class="rt-title">${title}</div>
      <div class="rt-head-btns">
        <div class="rt-options-wrap">
          <button type="button" class="rt-btn" id="rt-options">${RT_SLIDERS}<span>Options</span></button>
          <div class="rt-menu ${rt.optionsOpen ? "" : "hidden"}" id="rt-menu">
            <label class="rt-menu-row"><span>Show hidden rooms</span><span class="rt-switch"><input type="checkbox" id="rt-opt-hidden" ${rt.showHidden ? "checked" : ""}><i></i></span></label>
            <label class="rt-menu-row"><span>Show room numbers</span><span class="rt-switch"><input type="checkbox" id="rt-opt-numbers" ${rt.showNumbers ? "checked" : ""}><i></i></span></label>
          </div>
        </div>
        <button type="button" class="rt-btn ${rt.edit ? "rt-btn-on" : ""}" id="rt-edit"><span>${rt.edit ? "Done" : "Edit"}</span></button>
        <button type="button" class="rt-btn rt-add" id="rt-add">${RT_PLUS}<span>Add</span></button>
      </div>
    </div>
    <div class="rt-grid ${rt.edit ? "rt-editing" : ""}">${tiles.join("") || '<p class="rt-empty">Nothing here yet. Use Add to make a room.</p>'}</div>`;

  wrap.querySelectorAll(".rt-tile").forEach((btn, i) => {
    btn.style.setProperty("--i", Math.min(i, 14));
    btn.addEventListener("click", () => {
      const item = rtItems[Number(btn.dataset.i)];
      if (item.kind === "folder") {
        rt.cat = item.cat.key;
        renderRoomGrid();
      } else {
        openRoomDialog(item.e);
      }
    });
  });
  const back = document.getElementById("rt-back");
  if (back) back.addEventListener("click", () => ((rt.cat = null), renderRoomGrid()));
  document.getElementById("rt-add").addEventListener("click", () => openRoomDialog(null));
  document.getElementById("rt-edit").addEventListener("click", () => ((rt.edit = !rt.edit), renderRoomGrid()));
  document.getElementById("rt-options").addEventListener("click", (e) => {
    e.stopPropagation();
    rt.optionsOpen = !rt.optionsOpen;
    document.getElementById("rt-menu").classList.toggle("hidden", !rt.optionsOpen);
  });
  document.getElementById("rt-menu").addEventListener("click", (e) => e.stopPropagation());
  document.getElementById("rt-opt-hidden").addEventListener("change", (e) => ((rt.showHidden = e.target.checked), renderRoomGrid()));
  document.getElementById("rt-opt-numbers").addEventListener("change", (e) => ((rt.showNumbers = e.target.checked), renderRoomGrid()));
}

function rtTile(item) {
  const i = rtItems.push(item) - 1;
  const e = item.e;
  const st = (e && e.settings) || {};
  const badges = [];
  if (st.closed) badges.push('<span class="rt-badge rt-badge-closed">Closed</span>');
  if (st.hidden) badges.push(`<span class="rt-badge rt-badge-icon" title="Hidden from students">${RT_EYE_OFF}</span>`);
  const number = rt.showNumbers && e && e.room ? `<span class="rt-num">${escapeHtml(e.room)}</span>` : "";
  const pencil = rt.edit && item.kind === "room" ? `<span class="rt-pencil">${RT_PENCIL}</span>` : "";
  return `
    <div class="rt-slot">
      <button type="button" class="rt-tile ${st.closed ? "rt-closed" : ""}" style="background:${rtTileBg(item.color)}" data-i="${i}">
        <span class="rt-ic">${item.icon}</span>
        <span class="rt-row"><span class="rt-name">${escapeHtml(item.label)}</span>${item.chevron ? RT_CHEVRON : ""}</span>
        ${number}${badges.join("")}${pencil}
      </button>
    </div>`;
}

document.addEventListener("click", () => {
  if (!rt.optionsOpen) return;
  rt.optionsOpen = false;
  const menu = document.getElementById("rt-menu");
  if (menu) menu.classList.add("hidden");
});

/* ---------- the room settings dialog ---------- */

let rtDialog = null; // { host, d } while open

function rtSwitch(id, on, extra = "") {
  return `<label class="rt-switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""} ${extra}><i></i></label>`;
}

function rtSeg(id, options, value) {
  return `<div class="rt-seg" id="${id}">${options.map(([v, label]) => `<button type="button" data-v="${v}" class="${v === value ? "on" : ""}">${label}</button>`).join("")}</div>`;
}

const RT_FROM = [
  ["any", "Any Teacher"],
  ["anyroom", "Any Teachers in Room"],
  ["allroom", "All Teachers in Room"],
  ["certain", "Certain Teachers"],
];
const RT_FROM_LABEL = Object.fromEntries(RT_FROM);

function rtIconPreview(d) {
  const logo = d.logo;
  const cat = categoryByKey(d.categoryKey);
  if (logo && logo.startsWith("icon:")) return libraryIconMarkup(logo);
  if (logo && logo.startsWith("preset:")) {
    const p = CATEGORIES.find((c) => c.key === logo.slice(7));
    if (p) return categoryIconMarkup(p);
  }
  if (logo) return `<img src="${logo}" alt="" class="room-logo-img">`;
  return d.entry ? roomIconMarkup(d.entry.name, d.categoryKey) : categoryIconMarkup(cat);
}

function openRoomDialog(entry) {
  if (rtDialog) return;
  const isNew = !entry;
  const builtin = !!(entry && entry.builtin);
  const categoryKey = entry ? entry.categoryKey : "classrooms";
  const cat = categoryByKey(categoryKey);
  const d = {
    entry,
    isNew,
    builtin,
    custom: !!(entry && entry.custom),
    categoryKey,
    isLeaf: !!(entry && cat.leaf && cat.leaf.name === entry.origName),
    name: entry ? entry.name : "",
    room: entry ? entry.room || "" : "",
    max: entry && entry.maxMinutes ? String(entry.maxMinutes) : "",
    logo: entry ? entry.logo || null : null,
    s: { ...((entry && entry.settings) || {}) },
    iconQuery: "",
  };
  if (!d.s.teachers) d.s.teachers = typeof teacherName === "string" ? [teacherName] : [];
  if (!d.s.maxPasses) d.s.maxPasses = 2;
  d.s.travel = d.s.travel || "both";
  d.s.nowFrom = d.s.nowFrom || "allroom";
  d.s.nowSend = d.s.nowSend || "room";
  d.s.futureFrom = d.s.futureFrom || "allroom";

  const host = document.createElement("div");
  host.className = "rt-overlay";
  document.body.appendChild(host);
  rtDialog = { host, d, cat };
  paintRoomDialog();
  host.addEventListener("mousedown", (e) => {
    if (e.target === host) closeRoomDialog();
  });
  document.addEventListener("keydown", rtEsc);
  setTimeout(() => {
    const f = document.getElementById("rd-name");
    if (f && isNew) f.focus();
  }, 60);
}

function rtEsc(e) {
  if (e.key === "Escape") closeRoomDialog();
}

function closeRoomDialog() {
  if (!rtDialog) return;
  const { host } = rtDialog;
  rtDialog = null;
  document.removeEventListener("keydown", rtEsc);
  host.classList.add("leaving");
  setTimeout(() => host.remove(), 160);
}

function paintRoomDialog() {
  const { host, d, cat } = rtDialog;
  const s = d.s;
  const color = s.color || (d.entry ? rtColorOf(d.entry, cat) : categoryByKey("classrooms").color);
  const label = d.name.trim() || "New room";
  const q = d.iconQuery.trim().toLowerCase();
  const icons = RT_ICONS.filter((n) => !q || n.replace(/-/g, " ").includes(q)).slice(0, 25);
  const selectedIcon = d.logo && d.logo.startsWith("icon:") ? d.logo.slice(5) : null;

  host.innerHTML = `
    <div class="rt-dialog" role="dialog" aria-modal="true" aria-labelledby="rd-title">
      <div class="rd-head" id="rd-head" style="background:${rtHeadBg(color)}">
        <button type="button" class="rd-cancel" id="rd-cancel">Cancel</button>
        <div class="rd-title" id="rd-title"><span class="rd-title-ic" id="rd-title-ic">${rtIconPreview(d)}</span><span id="rd-title-text">${escapeHtml(label)}</span></div>
        <button type="button" class="rd-save" id="rd-save" style="color:${rtPair(color)[0]}">Save</button>
      </div>

      <div class="rd-body">
        <div class="rd-left">
          <div class="rd-row2">
            <label class="rd-field">Room Name<input type="text" id="rd-name" class="rd-input" maxlength="60" value="${escapeHtml(d.name)}" placeholder="e.g. Mr. Reynolds" autocomplete="off"></label>
            <label class="rd-field">Room Number<input type="text" id="rd-room" class="rd-input" maxlength="60" value="${escapeHtml(d.room)}" placeholder="214" autocomplete="off"></label>
          </div>

          <div class="rd-row2">
            <div class="rd-field">Travel Type${rtSeg("rd-travel", [["round", "Round-trip"], ["oneway", "One-way"], ["both", "Both"]], s.travel)}</div>
            <label class="rd-field">Time Limit
              <span class="rd-suffix"><input type="number" id="rd-max" class="rd-input" min="1" max="60" step="1" value="${escapeHtml(d.max)}" placeholder="15" inputmode="numeric"><em>min</em></span>
            </label>
          </div>

          <div class="rd-field">Teachers in Room
            <div class="rd-teachers" id="rd-teachers">
              ${(s.teachers || []).map((t, i) => `<span class="rd-teacher"><b>${escapeHtml(t.charAt(0).toUpperCase())}</b>${escapeHtml(t)}<button type="button" data-rm="${i}" aria-label="Remove ${escapeHtml(t)}">&times;</button></span>`).join("")}
              <span class="rd-add-teacher"><input type="text" id="rd-teacher-input" class="hidden" maxlength="40" placeholder="Name" autocomplete="off"><button type="button" class="rd-mini" id="rd-teacher-add">Add</button></span>
            </div>
          </div>

          <div class="rd-switchrow"><span>${rtSwitch("rd-origin", s.origin)}</span><b>Show as Origin Room</b></div>
          <div class="rd-card ${s.origin ? "" : "hidden"}" id="rd-closest">
            <p class="rd-card-title">Closest Rooms to Origin</p>
            <p class="rd-note">Add closest restrooms and water fountains. <a href="https://www.smartpass.app" target="_blank" rel="noopener">Learn more</a></p>
            <button type="button" class="rd-green" id="rd-closest-add">Add Room</button>
          </div>

          <div class="rd-card rd-card-row"><span>${rtSwitch("rd-maxfrom", s.maxFromOn)}</span><b class="${s.maxFromOn ? "" : "dim"}" id="rd-maxfrom-label">Max Passes From ${escapeHtml(label)}</b></div>

          <div class="rd-switchrow"><span>${rtSwitch("rd-counts", s.counts)}</span><b class="${s.counts ? "" : "dim"}" id="rd-counts-label">Counts Toward Pass Limits</b></div>

          <div class="rd-switchrow top"><span>${rtSwitch("rd-now", s.nowOn)}</span>
            <div><b>Restriction for Now</b><p class="rd-sub">Pass approval from: <span id="rd-now-label">${RT_FROM_LABEL[s.nowFrom]}</span></p></div></div>
          <div class="rd-indent ${s.nowOn ? "" : "hidden"}" id="rd-now-opts">
            ${rtSeg("rd-nowfrom", RT_FROM, s.nowFrom)}
            <div class="rd-sendrow"><p class="rd-sub">Pass requests will automatically get sent to ${RT_FROM_LABEL[s.nowFrom]} to:</p>${rtSeg("rd-nowsend", [["room", "This Room"], ["origin", "Origin"], ["both", "Both"]], s.nowSend)}</div>
          </div>

          <div class="rd-switchrow top"><span>${rtSwitch("rd-future", s.futureOn)}</span>
            <div><b>Restriction for Future</b><p class="rd-sub">Pass approval from: ${RT_FROM_LABEL[s.futureFrom]}</p></div></div>

          <div class="rd-switchrow"><span>${rtSwitch("rd-endrestrict", s.restrictEnding)}</span><b class="${s.restrictEnding ? "" : "dim"}" id="rd-end-label">Restrict Ending Passes</b></div>

          <div class="rd-switchrow top"><span>${rtSwitch("rd-maxpasses", s.maxPassesOn)}</span>
            <div><b>Max Passes to ${escapeHtml(label)}</b>
              <div class="rd-suffix rd-maxbox ${s.maxPassesOn ? "" : "hidden"}" id="rd-maxbox"><input type="number" id="rd-maxn" class="rd-input" min="1" max="99" step="1" value="${s.maxPasses}"><em>passes max</em></div>
              <p class="rd-sub ${s.maxPassesOn ? "" : "hidden"}" id="rd-max-hint">If this place is full, other students can't start a pass there until someone comes back.</p>
            </div></div>

          <div class="rd-vis">
            <span class="rd-vis-ic">${s.hidden ? RT_EYE_OFF : RT_EYE}</span><b>Visibility</b>
            <button type="button" class="rd-chip" id="rd-vis" ${d.isLeaf ? 'disabled title="This built-in place is always visible"' : ""}>${s.hidden ? "Hidden" : "All students"}<i></i></button>
          </div>

          <div class="rd-danger">
            ${
              d.isNew
                ? ""
                : d.custom
                  ? '<button type="button" class="rd-delete" id="rd-delete">Delete room</button><p class="rd-note">Deleting a room will permanently delete the room, but will not delete any active, scheduled, or expired passes to or from this room.</p>'
                  : `<button type="button" class="rd-delete rd-reset ${d.entry.overridden ? "" : "hidden"}" id="rd-reset">Reset to defaults</button>`
            }
          </div>
          <p class="rd-error hidden" id="rd-error" role="alert"></p>
        </div>

        <div class="rd-right">
          <div class="rd-card rd-avail"><b>Availability</b><button type="button" class="rd-chip rd-open ${s.closed ? "closed" : ""}" id="rd-avail">${s.closed ? "Closed" : "Open"}<i></i></button></div>

          <p class="rd-label">Color</p>
          <div class="rd-colors" id="rd-colors">
            ${RT_COLOR_ROWS.map((row) => `<div>${row.map((c) => `<button type="button" class="rd-swatch ${s.color === c ? "on" : ""}" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join("")}</div>`).join("")}
          </div>

          <div class="rd-iconhead"><p class="rd-label">Icon</p><span class="rd-icon-now" id="rd-icon-now" style="background:${color}">${rtIconPreview(d)}</span></div>
          <input type="search" id="rd-icon-search" class="rd-input rd-search" placeholder="Search icons" value="${escapeHtml(d.iconQuery)}" autocomplete="off">
          <p class="rd-suggested">${q ? "Results" : "Suggested"}</p>
          <div class="rd-icons" id="rd-icons">
            ${icons.map((n) => `<button type="button" class="rd-icon ${n === selectedIcon ? "on" : ""}" data-icon="${n}" title="${n.replace(/-/g, " ")}" ${n === selectedIcon ? `style="background:${color}"` : ""}><img src="${RT_ICON_BASE}${n}/FFFFFF.png" alt=""></button>`).join("") || '<p class="rd-note">No icons match that.</p>'}
          </div>
          <div class="rd-upload"><button type="button" class="rd-mini" id="rd-upload">Upload your own</button>${d.logo ? '<button type="button" class="rd-mini" id="rd-icon-clear">Use default</button>' : ""}<input type="file" id="rd-file" accept="image/*" hidden></div>
        </div>
      </div>
    </div>`;
  bindRoomDialog();
}

function rtField(id) {
  return document.getElementById(id);
}

// small updates that shouldn't throw away what's typed in the rest of the form
function rtRefreshHead() {
  const { d, cat } = rtDialog;
  const color = d.s.color || (d.entry ? rtColorOf(d.entry, cat) : categoryByKey("classrooms").color);
  const label = d.name.trim() || "New room";
  rtField("rd-head").style.background = rtHeadBg(color);
  rtField("rd-save").style.color = rtPair(color)[0];
  rtField("rd-title-text").textContent = label;
  rtField("rd-title-ic").innerHTML = rtIconPreview(d);
  rtField("rd-icon-now").style.background = color;
  rtField("rd-icon-now").innerHTML = rtIconPreview(d);
  rtField("rd-maxfrom-label").textContent = `Max Passes From ${label}`;
  const hint = document.querySelector('label[for="rd-maxpasses"]');
  if (hint) hint.textContent = label;
}

function bindRoomDialog() {
  const { d } = rtDialog;
  const s = d.s;

  rtField("rd-cancel").addEventListener("click", closeRoomDialog);
  rtField("rd-name").addEventListener("input", (e) => {
    d.name = e.target.value;
    rtRefreshHead();
    document.querySelectorAll(".rd-switchrow.top b").forEach((b) => {
      if (/^Max Passes to/.test(b.textContent)) b.textContent = `Max Passes to ${d.name.trim() || "New room"}`;
    });
  });
  rtField("rd-room").addEventListener("input", (e) => (d.room = e.target.value));
  rtField("rd-max").addEventListener("input", (e) => (d.max = e.target.value));

  const seg = (id, key, after) =>
    rtField(id).querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        s[key] = b.dataset.v;
        rtField(id).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        if (after) after();
      })
    );
  seg("rd-travel", "travel");
  seg("rd-nowfrom", "nowFrom", () => paintRoomDialogKeepScroll());
  seg("rd-nowsend", "nowSend");

  // teachers (a list shown on the room; adding a name here doesn't change who can approve passes)
  document.querySelectorAll("#rd-teachers [data-rm]").forEach((b) =>
    b.addEventListener("click", () => {
      s.teachers.splice(Number(b.dataset.rm), 1);
      paintRoomDialogKeepScroll();
    })
  );
  const tIn = rtField("rd-teacher-input");
  const tAdd = rtField("rd-teacher-add");
  tAdd.addEventListener("click", () => {
    if (tIn.classList.contains("hidden")) {
      tIn.classList.remove("hidden");
      tIn.focus();
      return;
    }
    const v = tIn.value.trim();
    if (v && s.teachers.length < 12) s.teachers.push(v);
    paintRoomDialogKeepScroll();
  });
  tIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tAdd.click();
    }
  });

  const flip = (id, key, after) =>
    rtField(id).addEventListener("change", (e) => {
      s[key] = e.target.checked;
      if (after) after();
    });
  flip("rd-origin", "origin", () => rtField("rd-closest").classList.toggle("hidden", !s.origin));
  flip("rd-maxfrom", "maxFromOn", () => rtField("rd-maxfrom-label").classList.toggle("dim", !s.maxFromOn));
  flip("rd-counts", "counts", () => rtField("rd-counts-label").classList.toggle("dim", !s.counts));
  flip("rd-now", "nowOn", () => rtField("rd-now-opts").classList.toggle("hidden", !s.nowOn));
  flip("rd-future", "futureOn");
  flip("rd-endrestrict", "restrictEnding", () => rtField("rd-end-label").classList.toggle("dim", !s.restrictEnding));
  flip("rd-maxpasses", "maxPassesOn", () => {
    rtField("rd-maxbox").classList.toggle("hidden", !s.maxPassesOn);
    rtField("rd-max-hint").classList.toggle("hidden", !s.maxPassesOn);
  });
  rtField("rd-maxn").addEventListener("input", (e) => (s.maxPasses = Number(e.target.value) || 1));
  rtField("rd-closest-add").addEventListener("click", () => showToast("Picking closest rooms isn't available yet.", "info"));

  rtField("rd-vis").addEventListener("click", () => {
    if (d.isLeaf) return;
    s.hidden = !s.hidden;
    rtField("rd-vis").firstChild.textContent = s.hidden ? "Hidden" : "All students";
    document.querySelector(".rd-vis-ic").innerHTML = s.hidden ? RT_EYE_OFF : RT_EYE;
  });
  rtField("rd-avail").addEventListener("click", () => {
    s.closed = !s.closed;
    const b = rtField("rd-avail");
    b.firstChild.textContent = s.closed ? "Closed" : "Open";
    b.classList.toggle("closed", s.closed);
  });

  rtField("rd-colors").querySelectorAll(".rd-swatch").forEach((b) =>
    b.addEventListener("click", () => {
      s.color = s.color === b.dataset.c ? null : b.dataset.c;
      rtField("rd-colors").querySelectorAll(".rd-swatch").forEach((x) => x.classList.toggle("on", x.dataset.c === s.color));
      rtRefreshHead();
      const sel = document.querySelector(".rd-icon.on");
      if (sel) sel.style.background = rtField("rd-icon-now").style.background;
    })
  );

  const search = rtField("rd-icon-search");
  search.addEventListener("input", (e) => {
    d.iconQuery = e.target.value;
    paintRoomDialogKeepScroll(true);
  });
  rtField("rd-icons").querySelectorAll("[data-icon]").forEach((b) =>
    b.addEventListener("click", () => {
      d.logo = `icon:${b.dataset.icon}`;
      paintRoomDialogKeepScroll();
    })
  );
  rtField("rd-upload").addEventListener("click", () => rtField("rd-file").click());
  rtField("rd-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return rtError("Please choose an image file.");
    try {
      d.logo = await fileToAvatar(file);
      paintRoomDialogKeepScroll();
    } catch {
      rtError("That image couldn't be read. Try a different one.");
    }
  });
  const clear = rtField("rd-icon-clear");
  if (clear) clear.addEventListener("click", () => ((d.logo = null), paintRoomDialogKeepScroll()));

  rtField("rd-save").addEventListener("click", saveRoomDialog);
  const del = rtField("rd-delete");
  if (del) {
    let armed = null;
    del.addEventListener("click", () => {
      if (!armed) {
        del.textContent = "Click again to delete";
        armed = setTimeout(() => {
          del.textContent = "Delete room";
          armed = null;
        }, 3000);
        return;
      }
      clearTimeout(armed);
      deleteRoomFromDialog();
    });
  }
  const reset = rtField("rd-reset");
  if (reset) reset.addEventListener("click", resetRoomFromDialog);
}

// repaint the whole dialog but keep the user's place (and focus on the search box when they're typing in it)
function paintRoomDialogKeepScroll(refocusSearch) {
  const body = rtDialog.host.querySelector(".rd-left");
  const top = body ? body.scrollTop : 0;
  const right = rtDialog.host.querySelector(".rd-right");
  const rightTop = right ? right.scrollTop : 0;
  paintRoomDialog();
  const b2 = rtDialog.host.querySelector(".rd-left");
  if (b2) b2.scrollTop = top;
  const r2 = rtDialog.host.querySelector(".rd-right");
  if (r2) r2.scrollTop = rightTop;
  if (refocusSearch) {
    const input = rtField("rd-icon-search");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function rtError(text) {
  const el = rtField("rd-error");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function rtSettingsToSave(s) {
  const out = {};
  ["closed", "hidden", "maxPassesOn", "origin", "counts", "nowOn", "futureOn", "restrictEnding", "maxFromOn"].forEach((k) => {
    if (s[k]) out[k] = true;
  });
  if (s.color) out.color = s.color;
  if (s.maxPassesOn && s.maxPasses) out.maxPasses = s.maxPasses;
  if (s.travel && s.travel !== "both") out.travel = s.travel;
  if (s.nowFrom && s.nowFrom !== "allroom") out.nowFrom = s.nowFrom;
  if (s.nowSend && s.nowSend !== "room") out.nowSend = s.nowSend;
  if (s.futureFrom && s.futureFrom !== "allroom") out.futureFrom = s.futureFrom;
  if (s.teachers && s.teachers.length) out.teachers = s.teachers;
  return out;
}

async function saveRoomDialog() {
  const { d } = rtDialog;
  const name = d.name.trim();
  const room = d.room.trim();
  if (!name) return rtError("Give the room a name.");
  const maxText = String(d.max).trim();
  const maxMinutes = maxText === "" ? null : Number(maxText);
  if (maxMinutes !== null && (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 60)) {
    return rtError("The time limit has to be a whole number from 1 to 60 minutes.");
  }
  if (d.s.maxPassesOn && (!Number.isInteger(d.s.maxPasses) || d.s.maxPasses < 1 || d.s.maxPasses > 99)) {
    return rtError("Max passes has to be a number from 1 to 99.");
  }

  // a name that already belongs to another place in the same group would silently do nothing
  const collision = FLAT_ROOMS.find((r) => r.categoryKey === d.categoryKey && r.name.toLowerCase() === name.toLowerCase());
  let same = false;
  if (collision && d.builtin) same = collision.builtin && collision.origName === d.entry.origName;
  else if (collision && d.custom) same = collision.custom && customClasses.some((c) => c.id === d.entry.id && c.name.toLowerCase() === name.toLowerCase());
  if (collision && !same) return rtError("A place with that name already exists. Choose a different name.");

  const settings = rtSettingsToSave(d.s);
  const save = rtField("rd-save");
  save.disabled = true;

  let res;
  if (d.builtin) {
    res = await teacherApi("/api/teacher/room/override", { categoryKey: d.categoryKey, origName: d.entry.origName, name, room, logo: d.logo, maxMinutes, settings });
  } else {
    res = await teacherApi(d.custom ? "/api/teacher/class/update" : "/api/teacher/class", {
      ...(d.custom ? { id: d.entry.id } : {}),
      name,
      room,
      logo: d.logo,
      maxMinutes,
      settings,
    });
  }
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) {
    save.disabled = false;
    return rtError(res.data.error || "Couldn't save that room.");
  }

  const stored = Object.keys(settings).length ? settings : null;
  if (d.builtin) {
    roomOverrides = roomOverrides.filter((o) => !(o.categoryKey === d.categoryKey && o.origName === d.entry.origName));
    roomOverrides.push({ categoryKey: d.categoryKey, origName: d.entry.origName, name, room, logo: d.logo, maxMinutes, settings: stored });
    applyRoomOverrides(roomOverrides);
  } else if (d.custom) {
    const existing = customClasses.find((c) => c.id === d.entry.id);
    if (existing) Object.assign(existing, { name, room, logo: d.logo, maxMinutes, settings: stored });
    applyCustomClasses(customClasses);
  } else {
    customClasses.push({ id: res.data.id, name, room, logo: d.logo, maxMinutes, settings: stored });
    applyCustomClasses(customClasses);
  }
  closeRoomDialog();
  renderRoomGrid();
  if (typeof renderClassSettings === "function") renderClassSettings();
  showToast(d.isNew ? `Added ${name} to Classrooms` : `Saved changes to ${name}`, "success");
}

async function deleteRoomFromDialog() {
  const { d } = rtDialog;
  const c = customClasses.find((x) => x.id === d.entry.id);
  if (!c) return closeRoomDialog();
  const res = await teacherApi("/api/teacher/class/delete", { id: c.id });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return rtError(res.data.error || "Couldn't delete that room.");
  customClasses = customClasses.filter((x) => x.id !== c.id);
  applyCustomClasses(customClasses);
  closeRoomDialog();
  renderRoomGrid();
  if (typeof renderClassSettings === "function") renderClassSettings();
  showToast(`Removed ${c.name}`, "info", {
    label: "Undo",
    onClick: async () => {
      const r = await teacherApi("/api/teacher/class", { name: c.name, room: c.room, logo: c.logo, maxMinutes: c.maxMinutes || null, settings: c.settings || undefined });
      if (!r.ok) return showToast(r.data.error || "Couldn't bring that room back.", "warn");
      customClasses.push({ ...c, id: r.data.id });
      applyCustomClasses(customClasses);
      renderRoomGrid();
      if (typeof renderClassSettings === "function") renderClassSettings();
    },
  });
}

async function resetRoomFromDialog() {
  const { d } = rtDialog;
  const res = await teacherApi("/api/teacher/room/override/reset", { categoryKey: d.categoryKey, origName: d.entry.origName });
  if (res.status === 401) return kickToSignIn();
  if (!res.ok) return rtError(res.data.error || "Couldn't reset that place.");
  roomOverrides = roomOverrides.filter((o) => !(o.categoryKey === d.categoryKey && o.origName === d.entry.origName));
  applyRoomOverrides(roomOverrides);
  closeRoomDialog();
  renderRoomGrid();
  if (typeof renderClassSettings === "function") renderClassSettings();
  showToast(`${d.entry.origName} is back to its defaults`, "info");
}

/* ---------- hook it up ---------- */

// the old Add-a-class button and the pencils on the Classes tab open the same new dialog
openClassDialog = function (existing) {
  openRoomDialog(existing || null);
};

adminTabHandlers.rooms = () => {
  rt.cat = null;
  rt.edit = false;
  rt.optionsOpen = false;
  renderRoomGrid();
};
