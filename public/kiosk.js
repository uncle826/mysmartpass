/* SmartPass Kiosk: students scan their ID card (or type their number) to start and end a pass.
   Uses api.js (apiFetch, escapeHtml, serverTime), rooms.js (CATEGORIES, FLAT_ROOMS) and scan39.js (startBarcodeScanner). */

const K_TOKEN = "smartpass_kiosk_token";
const K_ROOM = "smartpass_kiosk_room";
const K_TEACHER = "smartpass_kiosk_teacher";

const root = document.getElementById("kiosk");

const ICON_LOGO = '<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#00b476"/><path d="M11 21.5l6 6L29 14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_GEAR = '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8 3.5-.2-1.7 1.8-1.4-1.8-3.1-2.1.8a7.6 7.6 0 0 0-1.5-.9L16 3h-3.6l-.4 2.2c-.5.2-1 .5-1.5.9l-2.1-.8-1.8 3.1 1.8 1.4A7.600 7.600 0 0 0 8.200 12c0 .6.1 1.100.2 1.700l-1.800 1.400 1.800 3.100 2.100-.8c.5.4 1 .7 1.500.9l.4 2.200H16l.4-2.200c.5-.2 1-.5 1.500-.9l2.100.8 1.800-3.100-1.800-1.400c.1-.5.2-1.100.2-1.700z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M12 7v6M12 16.500v.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>';

let token = localStorage.getItem(K_TOKEN) || "";
let scanner = null;
let idleTimer = null;
let tickTimer = null;
let student = null; // the student who just scanned
let picked = { category: null, dest: null };
let typed = "";
let busy = false;
let lastCode = { value: "", at: 0 };

/* ---------- helpers ---------- */

function kioskRoomName() {
  return localStorage.getItem(K_ROOM) || "";
}

function clockText() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function topBar() {
  const room = kioskRoomName();
  return `<header class="k-top">
    <div class="k-brand">${ICON_LOGO}<span>SmartPass</span>${room ? `<span class="k-room">${escapeHtml(room)}</span>` : ""}</div>
    <div style="display:flex;align-items:center;gap:14px">
      <span class="k-clock" id="k-clock">${clockText()}</span>
      <button type="button" class="k-gear" id="k-gear" aria-label="Kiosk settings">${ICON_GEAR}</button>
    </div>
  </header>`;
}

function show(html, withBar = true) {
  stopScan();
  clearInterval(tickTimer);
  root.innerHTML = `${withBar ? topBar() : ""}<div class="k-main">${html}</div>`;
  const gear = document.getElementById("k-gear");
  if (gear) gear.addEventListener("click", showSetup);
}

setInterval(() => {
  const el = document.getElementById("k-clock");
  if (el) el.textContent = clockText();
}, 15000);

function avatarMarkup(s) {
  const initial = escapeHtml((s.name || "?").trim().charAt(0).toUpperCase());
  const style = s.photo ? `background-image:url('${s.photo}')` : `background:${escapeHtml(s.avatarColor || "#1561e6")}`;
  return `<div class="k-avatar" style="${style}">${s.photo ? "" : initial}</div>`;
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
    if (idleTimer && !document.getElementById("k-pad")) armIdleReset();
  })
);

function kioskCall(path, body) {
  return apiFetch(path, { body, token });
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

/* ---------- setup ---------- */

function showSetup(message) {
  clearTimeout(idleTimer);
  const err = typeof message === "string" ? message : "";
  show(
    `<form class="k-setup" id="k-setup-form" autocomplete="off">
      <h1>Set up this kiosk</h1>
      <p>Sign in with a teacher account. Students will scan their ID card here to start and end passes.</p>
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
  if (cancel) cancel.addEventListener("click", showIdle);

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
    showIdle();
  });
}

/* ---------- idle: scan or type ---------- */

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
    <div class="k-pad-label">Or type your ID number</div>
    <div class="k-display empty" id="k-display">Your ID number</div>
    <div class="k-pad">
      ${keys}
      <button type="button" class="k-key soft" data-k="back" aria-label="Delete">&#9003;</button>
      <button type="button" class="k-key" data-k="0">0</button>
      <button type="button" class="k-key go" data-k="go">Go</button>
    </div>
    <div class="k-msg" id="k-msg" role="alert"></div>
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

function showIdle(message) {
  clearTimeout(idleTimer);
  idleTimer = null;
  student = null;
  picked = { category: null, dest: null };
  typed = "";
  busy = false;
  show(`<div class="k-idle">
      <div class="k-prompt">
        <h1>Scan your ID card to get started</h1>
        <p>Hold the barcode up to the camera, or type your number on the keypad.</p>
        <div class="k-camera" id="k-camera">
          <video id="k-video" playsinline muted></video>
          <div class="k-guide"><i></i></div>
          <div class="k-camera-off hidden" id="k-camera-off"></div>
        </div>
        <div class="k-camera-note" id="k-camera-note"></div>
      </div>
      ${padMarkup()}
    </div>`);
  if (typeof message === "string" && message) setMsg(message);

  document.querySelectorAll(".k-key").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.k;
      if (k === "back") typed = typed.slice(0, -1);
      else if (k === "go") return submitTyped();
      else if (typed.length < 12) typed += k;
      setMsg("");
      paintTyped();
    })
  );

  startScan();
}

async function startScan() {
  const video = document.getElementById("k-video");
  if (!video || typeof startBarcodeScanner !== "function") return;
  try {
    scanner = await startBarcodeScanner(video, onScanned);
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
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length < 3) return;
  const now = Date.now();
  if (digits === lastCode.value && now - lastCode.at < 3000) return;
  lastCode = { value: digits, at: now };
  handleId(digits);
}

function submitTyped() {
  if (typed.length < 3) return setMsg("Type the number printed under your barcode.");
  handleId(typed);
}

// USB barcode scanners and keyboards type the number then press Enter
document.addEventListener("keydown", (e) => {
  if (!document.getElementById("k-pad") || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^\d$/.test(e.key) && typed.length < 12) {
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

function fmtLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
  document.getElementById("k-cancel").addEventListener("click", showIdle);
  document.getElementById("k-end").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const res = await kioskCall("/api/kiosk/end", { studentId: student.id });
    if (sessionExpired(res)) return;
    if (!res.ok) return showDone(res.data.error || "Couldn't end your pass. Please try again.", true, "Hmm");
    showDone("Welcome back! Your pass has ended.", false, student.name.split(" ")[0] + ", you're all set");
  });
  armIdleReset(60000);
}

function showBlocked(reason) {
  showDone(reason, true, "You can't start a pass right now");
}

function showDone(text, warn, title) {
  show(`<div class="k-done">
      <div class="k-big-icon ${warn ? "warn" : ""}">${warn ? ICON_STOP : ICON_CHECK}</div>
      <h1>${escapeHtml(title || (warn ? "Hold on" : "Done"))}</h1>
      <p>${escapeHtml(text)}</p>
      <div class="k-timer"><i></i></div>
    </div>`);
  clearTimeout(idleTimer);
  idleTimer = setTimeout(showIdle, 4500);
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
  grid.querySelectorAll("[data-cat]").forEach((b) =>
    b.addEventListener("click", () => {
      const cat = CATEGORIES.find((c) => c.key === b.dataset.cat);
      picked.category = cat;
      if (cat.leaf) {
        picked.dest = { name: cat.leaf.name, room: cat.leaf.room || "", categoryKey: cat.key, maxMinutes: cat.leaf.maxMinutes || null };
        showMinutes();
      } else {
        showRooms();
      }
    })
  );
  document.getElementById("k-cancel").addEventListener("click", showIdle);
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
            (r, i) =>
              `<button type="button" class="k-row" data-i="${cat.rooms.indexOf(r)}">${escapeHtml(r.name)}${r.room ? `<small>${escapeHtml(r.room)}</small>` : ""}</button>`
          )
          .join("")
      : '<div class="k-camera-note">Nothing matches that.</div>';
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
  document.getElementById("k-back").addEventListener("click", () => (picked.category.leaf ? showCategories() : showRooms()));
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
    showDone(`Have a good trip to ${dest.name}. You have ${minutes} minute${minutes === 1 ? "" : "s"}.`, false, `Enjoy, ${student.name.split(" ")[0]}`);
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
  if (token) showIdle();
  else showSetup();
}

boot();
