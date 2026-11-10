/* SmartPass Kiosk: students scan their ID card (or type their number) to start a pass, and tap their name
   under "Who's out" to end it. Leaving kiosk mode takes the teacher's 4-digit PIN.
   Uses api.js (apiFetch, escapeHtml, serverTime), rooms.js (CATEGORIES, FLAT_ROOMS) and scan39.js (startBarcodeScanner). */

const K_TOKEN = "smartpass_kiosk_token";
const K_ROOM = "smartpass_kiosk_room";
const K_TEACHER = "smartpass_kiosk_teacher";

const root = document.getElementById("kiosk");

// the SmartPass logo (green circle with the double arrow), same as the teacher dashboard
const ICON_LOGO =
  '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#00b476"/><path d="M11 11.5l8 8.5-8 8.5" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.5 11.5l8 8.5-8 8.5" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_GEAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';
const ICON_CHECK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="k-draw" d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_STOP =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M12 7v6M12 16.5v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';

let token = localStorage.getItem(K_TOKEN) || "";
let scanner = null;
let idleTimer = null;
let tickTimer = null;
let outTimers = [];
let student = null; // the student who just scanned
let picked = { category: null, dest: null };
let typed = "";
let busy = false;
let lastCode = { value: "", at: 0 };
let idleActive = false; // true only while the scan / keypad screen is showing
let idleTab = "pad"; // "out" (who's out) or "pad" (type an ID number)
let lastOut = null; // the latest "who's out" list (null until it has loaded once)
let outSig = "";
let pinOpen = false;

/* ---------- helpers ---------- */

function kioskRoomName() {
  return localStorage.getItem(K_ROOM) || "";
}

function clockText() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function firstName(full) {
  return String(full || "").trim().split(/\s+/)[0] || "there";
}

function topBar() {
  const room = kioskRoomName();
  return `<header class="k-top">
    <div class="k-brand"><span class="k-logo">${ICON_LOGO}</span><span>SmartPass</span>${room ? `<span class="k-room">${escapeHtml(room)}</span>` : ""}</div>
    <div class="k-top-right">
      <span class="k-clock" id="k-clock">${clockText()}</span>
      <button type="button" class="k-gear" id="k-gear" aria-label="Exit kiosk mode" title="Exit kiosk mode">${ICON_GEAR}</button>
    </div>
  </header>`;
}

function show(html, withBar = true) {
  stopScan();
  clearInterval(tickTimer);
  outTimers.forEach(clearInterval);
  outTimers = [];
  idleActive = false;
  root.innerHTML = `${withBar ? topBar() : ""}<div class="k-main k-enter">${html}</div>`;
  const gear = document.getElementById("k-gear");
  if (gear) gear.addEventListener("click", openExit);
  // children animate in one after another
  root.querySelectorAll(".k-tile, .k-row, .k-chip").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 14)));
}

setInterval(() => {
  const el = document.getElementById("k-clock");
  if (el) el.textContent = clockText();
}, 15000);

function avatarMarkup(s, size) {
  const initial = escapeHtml((s.name || "?").trim().charAt(0).toUpperCase());
  const style = s.photo ? `background-image:url('${s.photo}')` : `background:${escapeHtml(s.avatarColor || "#1561e6")}`;
  return `<div class="k-avatar ${size || ""}" style="${style}">${s.photo ? "" : initial}</div>`;
}

function whoMarkup(sub) {
  return `<div class="k-who">${avatarMarkup(student)}<div><h1>${escapeHtml(student.name)}</h1>${sub ? `<p>${sub}</p>` : ""}</div></div>`;
}

// anything but the idle screen goes back to idle after a quiet minute
function armIdleReset(ms = 45000) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showIdle, ms);
}

["pointerdown", "keydown"].forEach((ev) =>
  document.addEventListener(ev, () => {
    if (idleTimer && !idleActive) armIdleReset();
  })
);

function kioskCall(path, body) {
  return apiFetch(path, { body: body || {}, token });
}

function sessionExpired(res) {
  if (res.status === 401) {
    localStorage.removeItem(K_TOKEN);
    token = "";
    showSetup("This kiosk needs to be set up again.");
    return true;
  }
  return false;
}

function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------- exit kiosk mode (teacher PIN) ---------- */

let pinValue = "";
let pinBusy = false;

function openExit() {
  if (pinOpen) return;
  pinOpen = true;
  pinValue = "";
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((n) => `<button type="button" class="k-key" data-p="${n}">${n}</button>`)
    .join("");
  const host = document.createElement("div");
  host.className = "k-modal";
  host.id = "k-exit";
  host.innerHTML = `<div class="k-modal-card" id="k-exit-card" role="dialog" aria-modal="true" aria-labelledby="k-exit-title">
      <h2 id="k-exit-title">Exit kiosk mode</h2>
      <p>Teacher: enter your 4-digit PIN to leave.</p>
      <div class="k-dots" id="k-dots"><i></i><i></i><i></i><i></i></div>
      <div class="k-msg" id="k-pin-msg" role="alert"></div>
      <div class="k-pad">
        ${keys}
        <button type="button" class="k-key soft" data-p="cancel" aria-label="Cancel">&#10005;</button>
        <button type="button" class="k-key" data-p="0">0</button>
        <button type="button" class="k-key soft" data-p="back" aria-label="Delete">&#9003;</button>
      </div>
    </div>`;
  document.body.appendChild(host);
  host.addEventListener("click", (e) => {
    if (e.target === host) closeExit();
  });
  host.querySelectorAll("[data-p]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = b.dataset.p;
      if (p === "cancel") closeExit();
      else if (p === "back") pinEdit(pinValue.slice(0, -1));
      else pinEdit(pinValue + p);
    })
  );
  paintPin();
}

function closeExit() {
  const host = document.getElementById("k-exit");
  if (host) host.remove();
  pinOpen = false;
  pinValue = "";
}

function paintPin() {
  document.querySelectorAll("#k-dots i").forEach((d, i) => d.classList.toggle("on", i < pinValue.length));
}

function pinEdit(next) {
  if (pinBusy || next.length > 4) return;
  pinValue = next;
  const msg = document.getElementById("k-pin-msg");
  if (msg) msg.textContent = "";
  paintPin();
  if (pinValue.length === 4) submitPin();
}

async function submitPin() {
  pinBusy = true;
  const res = await kioskCall("/api/kiosk/exit", { pin: pinValue });
  pinBusy = false;
  if (res.ok || res.status === 401) {
    // PIN accepted (or the kiosk was already signed out): leave kiosk mode
    localStorage.removeItem(K_TOKEN);
    token = "";
    stopScan();
    return location.replace("/");
  }
  pinValue = "";
  paintPin();
  const card = document.getElementById("k-exit-card");
  const msg = document.getElementById("k-pin-msg");
  if (msg) msg.textContent = res.data.error || "That PIN isn't right.";
  if (card) {
    card.classList.remove("shake");
    void card.offsetWidth; // restart the shake
    card.classList.add("shake");
  }
}

function pinKey(e) {
  if (/^\d$/.test(e.key)) return pinEdit(pinValue + e.key);
  if (e.key === "Backspace") return pinEdit(pinValue.slice(0, -1));
  if (e.key === "Escape") return closeExit();
}

/* ---------- setup + welcome ---------- */

function showSetup(message) {
  clearTimeout(idleTimer);
  idleTimer = null;
  const err = typeof message === "string" ? message : "";
  show(
    `<form class="k-setup" id="k-setup-form" autocomplete="off">
      <div class="k-setup-logo">${ICON_LOGO}</div>
      <h1>Set up this kiosk</h1>
      <p>Sign in with a teacher account. Students will scan their ID card here to start a pass, and tap their name to end one.</p>
      ${err ? `<div class="k-error" role="alert">${escapeHtml(err)}</div>` : `<div class="k-error hidden" id="k-setup-err" role="alert"></div>`}
      <label class="k-field">Teacher username<input id="k-user" type="text" autocapitalize="none" autocomplete="username" required></label>
      <label class="k-field">Password<input id="k-pass" type="password" autocomplete="current-password" required></label>
      <label class="k-field">Where is this kiosk? (optional)<input id="k-roomname" type="text" maxlength="40" placeholder="Room 204" value="${escapeHtml(kioskRoomName())}"></label>
      <button type="submit" class="k-btn" id="k-setup-go">Start kiosk</button>
      ${token ? '<button type="button" class="k-btn ghost" id="k-setup-cancel" style="margin-top:10px">Cancel</button>' : ""}
    </form>`,
    false
  );
  const form = document.getElementById("k-setup-form");
  document.getElementById("k-user").focus();
  const cancel = document.getElementById("k-setup-cancel");
  if (cancel) cancel.addEventListener("click", () => showIdle());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const go = document.getElementById("k-setup-go");
    const box = form.querySelector(".k-error");
    go.disabled = true;
    go.textContent = "Checking...";
    const res = await apiFetch("/api/kiosk/login", {
      body: { username: document.getElementById("k-user").value, password: document.getElementById("k-pass").value },
    });
    if (!res.ok) {
      go.disabled = false;
      go.textContent = "Start kiosk";
      box.textContent = res.data.error || "Couldn't sign in. Please try again.";
      box.classList.remove("hidden");
      return;
    }
    token = res.data.token;
    localStorage.setItem(K_TOKEN, token);
    localStorage.setItem(K_TEACHER, res.data.name || "");
    const roomName = document.getElementById("k-roomname").value.replace(/[^\p{L}\p{N} .,'’()#&_-]/gu, "").trim().slice(0, 40);
    if (roomName) localStorage.setItem(K_ROOM, roomName);
    else localStorage.removeItem(K_ROOM);
    lastOut = null;
    refreshOut();
    showWelcome();
  });
}

// after the teacher signs the kiosk in: a short "ready" moment, then straight to scanning
function showWelcome() {
  const room = kioskRoomName();
  show(
    `<div class="k-welcome">
      <div class="k-welcome-logo">${ICON_LOGO}<span class="k-ring"></span><span class="k-ring r2"></span></div>
      <h1>Kiosk ready</h1>
      <p>${room ? escapeHtml(room) + " &middot; " : ""}Scan an ID card to start a pass, or tap your name to end one.</p>
      <div class="k-timer"><i style="animation-duration:2s"></i></div>
    </div>`,
    false
  );
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => showIdle(), 2000);
}

/* ---------- idle: scan or type, and who's out ---------- */

function stopScan() {
  if (scanner) {
    try {
      scanner.stop();
    } catch {
      /* already stopped */
    }
    scanner = null;
  }
}

function padMarkup() {
  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((n) => `<button type="button" class="k-key" data-k="${n}">${n}</button>`)
    .join("");
  return `<div class="k-pad-wrap" id="k-pad">
    <div class="k-pad-label">Type your ID number</div>
    <div class="k-display empty" id="k-display">Your ID number</div>
    <div class="k-pad">
      ${keys}
      <button type="button" class="k-key soft" data-k="back" aria-label="Delete">&#9003;</button>
      <button type="button" class="k-key" data-k="0">0</button>
      <button type="button" class="k-key go" data-k="go">Go</button>
    </div>
  </div>`;
}

function paintTyped() {
  const el = document.getElementById("k-display");
  if (!el) return;
  if (typed) {
    el.textContent = typed;
    el.classList.remove("empty");
  } else {
    el.textContent = "Your ID number";
    el.classList.add("empty");
  }
}

function setMsg(text) {
  const el = document.getElementById("k-msg");
  if (el) el.textContent = text || "";
}

function bindPad() {
  document.querySelectorAll(".k-key[data-k]").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.k;
      if (k === "back") typed = typed.slice(0, -1);
      else if (k === "go") return submitTyped();
      else if (typed.length < 12) typed += k;
      setMsg("");
      paintTyped();
    })
  );
  paintTyped();
}

function outRowMarkup(o) {
  return `<div class="k-out-row" data-key="${escapeHtml(o.key)}">
      ${avatarMarkup(o, "sm")}
      <div class="k-out-who"><b>${escapeHtml(o.name)}</b><span>${escapeHtml(o.room.name)}</span></div>
      <span class="k-out-time" data-end="${o.endTime}"></span>
      <button type="button" class="k-back-btn" data-end-key="${escapeHtml(o.key)}">I'm back</button>
    </div>`;
}

function paintOutTimes() {
  document.querySelectorAll(".k-out-time").forEach((el) => {
    const left = Number(el.dataset.end) - serverTime();
    el.textContent = left > 0 ? fmtLeft(left) : `+${fmtLeft(-left)}`;
    el.classList.toggle("over", left <= 0);
  });
}

function paintOut() {
  const count = document.getElementById("k-out-count");
  if (count) count.textContent = lastOut ? lastOut.length : 0;
  const panel = document.getElementById("k-panel");
  if (!panel || idleTab !== "out") return;
  const sig = (lastOut || []).map((o) => `${o.key}:${o.endTime}`).join("|");
  if (panel.dataset.painted === "out" && sig === outSig) return paintOutTimes();
  outSig = sig;
  panel.dataset.painted = "out";
  if (!lastOut || lastOut.length === 0) {
    panel.innerHTML = `<div class="k-out-empty"><div class="k-big-icon sm">${ICON_CHECK}</div><b>Nobody is out right now</b><span>Scan your ID card to start a pass.</span></div>`;
    return;
  }
  panel.innerHTML = `<div class="k-out-list">${lastOut.map(outRowMarkup).join("")}</div>`;
  panel.querySelectorAll(".k-out-row").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 10)));
  panel.querySelectorAll("[data-end-key]").forEach((b) => b.addEventListener("click", () => endByKey(b.dataset.endKey, b)));
  paintOutTimes();
}

async function refreshOut() {
  const res = await kioskCall("/api/kiosk/out");
  if (sessionExpired(res)) return false;
  if (res.ok) {
    lastOut = res.data.out || [];
    paintOut();
  }
  return true;
}

function setTab(tab) {
  idleTab = tab;
  document.querySelectorAll(".k-tab").forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle("on", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  const panel = document.getElementById("k-panel");
  if (!panel) return;
  panel.dataset.painted = "";
  if (tab === "pad") {
    panel.innerHTML = padMarkup();
    bindPad();
  } else {
    paintOut();
  }
}

function showIdle(message) {
  clearTimeout(idleTimer);
  idleTimer = null;
  student = null;
  picked = { category: null, dest: null };
  typed = "";
  busy = false;
  outSig = "";
  idleTab = lastOut && lastOut.length ? "out" : "pad";
  show(`<div class="k-idle">
      <div class="k-prompt">
        <h1>Scan your ID card to get started</h1>
        <p>Hold the barcode up to the camera, or type your number.</p>
        <div class="k-camera" id="k-camera">
          <video id="k-video" playsinline muted></video>
          <div class="k-guide"><i></i></div>
          <div class="k-camera-off hidden" id="k-camera-off"></div>
        </div>
        <div class="k-camera-note" id="k-camera-note"></div>
      </div>
      <div class="k-side">
        <div class="k-tabs" role="tablist">
          <button type="button" class="k-tab" role="tab" data-tab="out">Who's out <span class="k-badge" id="k-out-count">${lastOut ? lastOut.length : 0}</span></button>
          <button type="button" class="k-tab" role="tab" data-tab="pad">Type ID</button>
        </div>
        <div class="k-panel" id="k-panel"></div>
        <div class="k-msg" id="k-msg" role="alert"></div>
      </div>
    </div>`);
  idleActive = true;
  if (typeof message === "string" && message) setMsg(message);

  document.querySelectorAll(".k-tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
  setTab(idleTab);

  // keep "who's out" fresh and counting down by itself
  refreshOut();
  outTimers.push(setInterval(refreshOut, 10000));
  outTimers.push(setInterval(paintOutTimes, 1000));

  startScan();
}

async function startScan() {
  const video = document.getElementById("k-video");
  if (!video || typeof startBarcodeScanner !== "function") return;
  try {
    const s = await startBarcodeScanner(video, onScanned);
    if (!idleActive) return s.stop(); // they already left this screen
    scanner = s;
    const note = document.getElementById("k-camera-note");
    if (note) note.textContent = "Camera is on";
  } catch (err) {
    const off = document.getElementById("k-camera-off");
    if (off) {
      off.textContent = (err && err.message) || "The camera isn't available. Use the keypad instead.";
      off.classList.remove("hidden");
      const guide = document.querySelector(".k-guide");
      if (guide) guide.classList.add("hidden");
    }
  }
}

function onScanned(code) {
  if (pinOpen) return;
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length < 3) return;
  const now = Date.now();
  if (digits === lastCode.value && now - lastCode.at < 3000) return;
  lastCode = { value: digits, at: now };
  const cam = document.getElementById("k-camera");
  if (cam) {
    cam.classList.remove("hit");
    void cam.offsetWidth;
    cam.classList.add("hit"); // a quick green flash so they know it read
  }
  handleId(digits);
}

function submitTyped() {
  if (typed.length < 3) return setMsg("Type the number printed under your barcode.");
  handleId(typed);
}

// USB barcode scanners and keyboards type the number then press Enter
document.addEventListener("keydown", (e) => {
  if (pinOpen) return pinKey(e);
  if (!idleActive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^\d$/.test(e.key) && typed.length < 12) {
    if (idleTab !== "pad") setTab("pad");
    typed += e.key;
    setMsg("");
    paintTyped();
  } else if (e.key === "Backspace") {
    typed = typed.slice(0, -1);
    paintTyped();
  } else if (e.key === "Enter") {
    submitTyped();
  }
});

/* ---------- after a scan ---------- */

async function handleId(id) {
  if (busy) return;
  busy = true;
  setMsg("");
  const res = await kioskCall("/api/kiosk/lookup", { studentId: id });
  busy = false;
  if (sessionExpired(res)) return;
  if (!res.ok) {
    typed = "";
    paintTyped();
    return setMsg(res.data.error || "Couldn't look that up. Try again.");
  }
  student = res.data.student;
  typed = "";
  student.id = id;

  if (res.data.active) return showActive(res.data.active);
  if (res.data.blocked) return showBlocked(res.data.blocked);
  showCategories();
}

function showActive(active) {
  show(`<div class="k-card">
      ${whoMarkup("You're out on a pass")}
      <div class="k-done" style="flex:1">
        <div class="k-dest">${escapeHtml(active.room.name)}</div>
        <p id="k-left"></p>
        <div class="k-bottom" style="width:min(560px,100%)">
          <button type="button" class="k-btn ghost" id="k-cancel">Not me</button>
          <button type="button" class="k-btn grow" id="k-end">I'm back, end my pass</button>
        </div>
      </div>
    </div>`);
  const left = document.getElementById("k-left");
  const tick = () => {
    const remaining = active.endTime - serverTime();
    left.textContent = remaining > 0 ? `${fmtLeft(remaining)} left` : `Over time by ${fmtLeft(-remaining)}`;
  };
  tick();
  tickTimer = setInterval(tick, 1000);
  document.getElementById("k-cancel").addEventListener("click", () => showIdle());
  document.getElementById("k-end").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const res = await kioskCall("/api/kiosk/end", { studentId: student.id });
    if (sessionExpired(res)) return;
    if (!res.ok) return showDone(res.data.error || "Couldn't end your pass. Please try again.", true, "Hmm");
    refreshOut();
    showDone("Welcome back! Your pass has ended.", false, `${firstName(student.name)}, you're all set`);
  });
  armIdleReset(60000);
}

// a student taps "I'm back" next to their own name: no scan or typing needed
async function endByKey(key, btn) {
  const who = (lastOut || []).find((o) => o.key === key);
  btn.disabled = true;
  btn.textContent = "Ending...";
  const res = await kioskCall("/api/kiosk/end", { studentKey: key });
  if (sessionExpired(res)) return;
  if (res.status === 409) {
    btn.disabled = false;
    btn.textContent = "I'm back";
    return refreshOut(); // someone already ended it
  }
  if (!res.ok) {
    btn.disabled = false;
    btn.textContent = "I'm back";
    return setMsg(res.data.error || "Couldn't end that pass. Try again.");
  }
  refreshOut();
  const name = (res.data.student && res.data.student.name) || (who && who.name) || "";
  student = { name, photo: res.data.student && res.data.student.photo, avatarColor: res.data.student && res.data.student.avatarColor };
  showDone("Welcome back! Your pass has ended.", false, `${firstName(name)}, you're all set`);
}

function showBlocked(reason) {
  showDone(reason, true, "You can't start a pass right now");
}

function showDone(text, warn, title) {
  show(`<div class="k-done">
      <div class="k-big-icon ${warn ? "warn" : ""}">${warn ? ICON_STOP : ICON_CHECK}<span class="k-ring"></span></div>
      <h1>${escapeHtml(title || (warn ? "Hold on" : "Done"))}</h1>
      <p>${escapeHtml(text)}</p>
      <div class="k-timer"><i></i></div>
    </div>`);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => showIdle(), 4500);
}

/* ---------- pick where you're going ---------- */

function showCategories() {
  show(`<div class="k-card">
      ${whoMarkup("Where are you going?")}
      <div class="k-grid" id="k-grid"></div>
      <div class="k-bottom"><button type="button" class="k-btn ghost" id="k-cancel">Cancel</button></div>
    </div>`);
  const grid = document.getElementById("k-grid");
  grid.innerHTML = CATEGORIES.map((c) => {
    const rooms = c.leaf ? 1 : c.rooms.length;
    if (rooms === 0) return "";
    return `<button type="button" class="k-tile" data-cat="${escapeHtml(c.key)}" style="background:${c.color}">
        <span class="k-tile-icon">${categoryIconMarkup(c)}</span>${escapeHtml(c.label)}
      </button>`;
  }).join("");
  grid.querySelectorAll(".k-tile").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 14)));
  grid.querySelectorAll("[data-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      const cat = CATEGORIES.find((c) => c.key === b.dataset.cat);
      picked.category = cat;
      // a category with only one place skips the list and goes straight to "how long"
      const only = cat.leaf || (cat.rooms.length === 1 ? cat.rooms[0] : null);
      if (only) {
        picked.dest = { name: only.name, room: only.room || "", categoryKey: cat.key, maxMinutes: only.maxMinutes || null };
        showMinutes();
      } else {
        showRooms();
      }
    })
  );
  document.getElementById("k-cancel").addEventListener("click", () => showIdle());
  armIdleReset();
}

function showRooms() {
  const cat = picked.category;
  show(`<div class="k-card">
      ${whoMarkup(escapeHtml(cat.label))}
      ${cat.rooms.length > 8 ? '<input type="search" class="k-search" id="k-search" placeholder="Search..." autocomplete="off">' : ""}
      <div class="k-list" id="k-list"></div>
      <div class="k-bottom"><button type="button" class="k-btn ghost" id="k-back">Back</button></div>
    </div>`);
  const list = document.getElementById("k-list");
  const paint = (filter) => {
    const q = (filter || "").trim().toLowerCase();
    const rooms = cat.rooms.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.room || "").toLowerCase().includes(q));
    list.innerHTML = rooms.length
      ? rooms
          .map(
            (r) =>
              `<button type="button" class="k-row" data-i="${cat.rooms.indexOf(r)}">${escapeHtml(r.name)}${r.room ? `<small>${escapeHtml(r.room)}</small>` : ""}</button>`
          )
          .join("")
      : '<div class="k-camera-note">Nothing matches that.</div>';
    list.querySelectorAll(".k-row").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 14)));
    list.querySelectorAll("[data-i]").forEach((b) =>
      b.addEventListener("click", () => {
        const r = cat.rooms[Number(b.dataset.i)];
        picked.dest = { name: r.name, room: r.room || "", categoryKey: cat.key, maxMinutes: r.maxMinutes || null };
        showMinutes();
      })
    );
  };
  paint("");
  const search = document.getElementById("k-search");
  if (search) search.addEventListener("input", () => paint(search.value));
  document.getElementById("k-back").addEventListener("click", showCategories);
  armIdleReset();
}

function showMinutes() {
  const dest = picked.dest;
  const max = Math.min(60, dest.maxMinutes || 60);
  let options = [3, 5, 10, 15, 20, 30].filter((m) => m <= max);
  if (!options.length) options = [max];
  if (dest.maxMinutes && !options.includes(max)) options.push(max);
  let minutes = options.includes(5) ? 5 : options[0];

  show(`<div class="k-card">
      ${whoMarkup("How long do you need?")}
      <div class="k-dest">${escapeHtml(dest.name)}</div>
      ${dest.maxMinutes ? `<p style="margin:0;color:#b9d0f5">Up to ${dest.maxMinutes} minutes here</p>` : ""}
      <div class="k-chips" id="k-chips">${options
        .map((m) => `<button type="button" class="k-chip ${m === minutes ? "on" : ""}" data-m="${m}">${m}<small>min</small></button>`)
        .join("")}</div>
      <div class="k-bottom">
        <button type="button" class="k-btn ghost" id="k-back">Back</button>
        <button type="button" class="k-btn grow" id="k-start">Start pass</button>
      </div>
    </div>`);
  const chips = document.querySelectorAll(".k-chip");
  chips.forEach((c) =>
    c.addEventListener("click", () => {
      minutes = Number(c.dataset.m);
      chips.forEach((x) => x.classList.toggle("on", x === c));
    })
  );
  document.getElementById("k-back").addEventListener("click", () => (picked.category.leaf || picked.category.rooms.length === 1 ? showCategories() : showRooms()));
  document.getElementById("k-start").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const from = kioskRoomName();
    const res = await kioskCall("/api/kiosk/start", {
      studentId: student.id,
      dest: { name: dest.name, room: dest.room, categoryKey: dest.categoryKey },
      from: from ? { name: from, room: "", categoryKey: "custom" } : undefined,
      minutes,
    });
    if (sessionExpired(res)) return;
    if (!res.ok) return showDone(res.data.error || "Couldn't start your pass. Please try again.", true, "Pass not started");
    refreshOut();
    showDone(`Have a good trip to ${dest.name}. You have ${minutes} minute${minutes === 1 ? "" : "s"}.`, false, `Enjoy, ${firstName(student.name)}`);
  });
  armIdleReset();
}

/* ---------- boot ---------- */

async function boot() {
  // use the same room list students see (built-in places + a teacher's edits + added classes)
  try {
    const res = await apiFetch("/api/classes");
    if (res.ok) {
      applyRoomOverrides(res.data.overrides || []);
      applyCustomClasses(res.data.classes || []);
    }
  } catch {
    /* the built-in list still works */
  }
  if (!token) return showSetup();
  // load who's out first so the right tab is showing the moment the screen appears
  if ((await refreshOut()) !== false) showIdle();
}

boot();
