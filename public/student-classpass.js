/* Student "Pass to Class": for when you're late. It looks and works like creating a normal pass:
   pick who you're coming from and which teacher's class you're going to, then (on the time screen) say why you're late
   and slide to how long you need as a countdown. It is logged on the teacher's Attendance page.
   Uses the same classes as the real pass box (modal, route, room-row, dur-track...) so it looks the same.
   Runs after student-extras.js (uses name, apiFetch, escapeHtml, showToast, applyServerState, currentPass, CATEGORIES). */

(function () {
  const btn = document.getElementById("class-pass-btn");
  if (!btn) return;

  // the people a student can pick: classrooms, admins and student services are all named after staff
  const TEACHER_GROUPS = ["classrooms", "admins", "studentServices"];
  const REASONS = ["Was with another teacher", "Bathroom", "Locker", "Nurse or office"];
  const LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const GO = '<svg viewBox="0 0 24 24" class="btn-icon"><path d="M9 6l6 6-6 6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const FROM_DOT_PIN = '<svg viewBox="0 0 24 24" class="route-pin"><path d="M12 22s-7-6.4-7-12a7 7 0 0 1 14 0c0 5.6-7 12-7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="#f3f4f7"/></svg>';

  let overlay = null;
  let st = null; // { from, to, active: "from" | "to", step: "pick" | "time", reason, minutes, max, busy, error, query }

  function teachers() {
    const out = [];
    TEACHER_GROUPS.forEach((key) => {
      const cat = CATEGORIES.find((c) => c.key === key);
      if (!cat || !cat.rooms) return;
      cat.rooms.forEach((r) => out.push({ name: r.name, room: r.room || "", categoryKey: key }));
    });
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  }

  function open() {
    if (overlay) return;
    if (typeof currentPass !== "undefined" && currentPass) return showToast("You're already on a pass.", "info");
    const max = typeof classPassMinutesNow === "number" ? classPassMinutesNow : 5;
    st = { from: null, to: null, active: "from", step: "pick", reason: "", minutes: Math.min(3, max), max, busy: false, error: "", query: "" };
    overlay = document.createElement("div");
    overlay.className = "modal-overlay centered cpm-overlay";
    document.body.appendChild(overlay);
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey);
    paint();
  }

  function close() {
    if (!overlay) return;
    const o = overlay;
    overlay = null;
    document.removeEventListener("keydown", onKey);
    o.classList.add("closing");
    setTimeout(() => o.remove(), 190);
  }

  function onKey(e) {
    if (e.key === "Escape") goBack();
  }

  function goBack() {
    if (!overlay) return;
    if (st.step === "time") {
      st.step = "pick";
      st.to = null;
      st.active = "to";
      st.error = "";
      paint();
    } else {
      close();
    }
  }

  /* ---------- step 1: pick the two teachers ---------- */

  function rowMarkup(t, i) {
    const cat = categoryByKey(t.categoryKey);
    const selected = (st[st.active] && st[st.active].name === t.name) || false;
    return `
      <button type="button" class="room-row ${selected ? "selected" : ""}" data-i="${i}" style="--i:${Math.min(i, 12)}">
        <span class="room-icon" style="background:${cat.color}">${roomIconMarkup(t.name, t.categoryKey)}</span>
        <span class="room-name">${escapeHtml(t.name)}</span>
        <span class="room-code">${LOCK} ${escapeHtml(t.room || "—")}</span>
      </button>`;
  }

  function visibleTeachers() {
    const q = st.query.trim().toLowerCase();
    const other = st.active === "from" ? st.to : st.from;
    return teachers().filter((t) => (!q || t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q)) && !(other && other.name === t.name));
  }

  function paintPick() {
    const hasFrom = !!st.from;
    overlay.innerHTML = `
      <div class="modal cpm cpm-pick" role="dialog" aria-modal="true" aria-label="Pass to Class">
        <div class="modal-top"><button type="button" class="modal-top-back" id="cpm-back" aria-label="Close">${BACK}</button></div>
        <div class="route ${hasFrom ? "has-from" : "from-only"}" id="cpm-route">
          <div class="route-icons" aria-hidden="true">
            <span class="route-circle"></span>
            <span class="route-dots"><span></span><span></span><span></span></span>
            ${FROM_DOT_PIN}
          </div>
          <div class="route-fields">
            <div class="modal-field ${st.active === "from" ? "active" : ""} ${st.from ? "filled" : ""}" id="cpm-from-field"><input type="text" class="modal-input" id="cpm-from" placeholder="Coming from?" autocomplete="off" value="${st.active === "from" ? escapeHtml(st.query) : st.from ? escapeHtml(st.from.name) : ""}"></div>
            <div class="modal-field cpm-going ${st.active === "to" ? "active" : ""} ${st.to ? "filled" : ""}" id="cpm-to-field"><input type="text" class="modal-input" id="cpm-to" placeholder="Going to?" autocomplete="off" value="${st.active === "to" ? escapeHtml(st.query) : st.to ? escapeHtml(st.to.name) : ""}"></div>
          </div>
        </div>
        <div class="modal-list-header"><h3 class="modal-list-title">All Teachers</h3></div>
        <div class="modal-room-list" id="cpm-list"></div>
      </div>`;

    const list = document.getElementById("cpm-list");
    const items = visibleTeachers();
    list.innerHTML = items.map(rowMarkup).join("") || '<p class="cpm-none">No teachers match that.</p>';
    list.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => choose(items[Number(b.dataset.i)])));

    document.getElementById("cpm-back").addEventListener("click", goBack);
    const fromIn = document.getElementById("cpm-from");
    const toIn = document.getElementById("cpm-to");
    [["from", fromIn], ["to", toIn]].forEach(([which, input]) => {
      input.addEventListener("focus", () => {
        if (st.active === which) return;
        st.active = which;
        st.query = "";
        paintPick();
        document.getElementById(which === "from" ? "cpm-from" : "cpm-to").focus();
      });
      input.addEventListener("input", () => {
        st.query = input.value;
        const items2 = visibleTeachers();
        list.innerHTML = items2.map(rowMarkup).join("") || '<p class="cpm-none">No teachers match that.</p>';
        list.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => choose(items2[Number(b.dataset.i)])));
      });
    });
    const active = st.active === "from" ? fromIn : toIn;
    active.focus();
    active.setSelectionRange(active.value.length, active.value.length);
  }

  function choose(t) {
    st[st.active] = { name: t.name, room: t.room, categoryKey: t.categoryKey };
    st.query = "";
    if (st.active === "from") {
      st.active = "to";
      paintPick();
    } else {
      st.step = "time";
      paint();
    }
  }

  /* ---------- step 2: why you're late, and how long ---------- */

  function paintTime() {
    const cat = categoryByKey(st.to.categoryKey);
    overlay.innerHTML = `
      <div class="modal cpm cpm-time" role="dialog" aria-modal="true" aria-label="Pass to Class" style="--dest-color:${cat.color}">
        <div class="modal-top"><button type="button" class="modal-top-back" id="cpm-back" aria-label="Back">${BACK}</button></div>
        <div class="duration-dest-title"><span class="duration-dest-icon" id="cpm-dest-icon">${roomIconMarkup(st.to.name, st.to.categoryKey)}</span><span>${escapeHtml(st.to.name)}</span></div>
        <div class="duration-from-row"><span class="duration-from-line"></span><span class="duration-from">from <span class="duration-from-badge"><span class="duration-from-icon" id="cpm-from-icon">${roomIconMarkup(st.from.name, st.from.categoryKey)}</span><span>${escapeHtml(st.from.name)}</span></span></span></div>

        <div class="cpm-reason">
          <label for="cpm-reason">Why are you late to class?</label>
          <input type="text" id="cpm-reason" class="cpm-reason-input" maxlength="140" placeholder="Type a short reason" autocomplete="off" value="${escapeHtml(st.reason)}">
          <div class="cpm-chips">${REASONS.map((r) => `<button type="button" class="cpm-chip" data-reason="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("")}</div>
        </div>

        <div class="duration-body">
          <div class="duration-slider-col">
            <div class="dur-track" id="cpm-track" role="slider" tabindex="0" aria-label="Minutes" aria-valuemin="1" aria-valuemax="${st.max}" aria-valuenow="${st.minutes}">
              <div class="dur-fill" id="cpm-fill"></div>
              <div class="dur-thumb" id="cpm-thumb"></div>
            </div>
          </div>
          <div class="duration-info">
            <span class="round-trip-pill">Late pass</span>
            <p class="duration-question">How long to<br>get there?</p>
            <p class="duration-value" id="cpm-value"></p>
            <p class="duration-max">Up to ${st.max} min</p>
          </div>
        </div>

        <p class="duration-error ${st.error ? "" : "hidden"}" id="cpm-error" role="alert">${escapeHtml(st.error)}</p>
        <button type="button" class="duration-start-btn" id="cpm-start" ${canStart() ? "" : "disabled"}><span>${st.busy ? "Starting..." : "Start Pass"}</span>${GO}</button>
      </div>`;

    // the destination's icon takes its color, like on the real time screen
    const tint = document.getElementById("dest-tint-matrix");
    if (tint && typeof tintFilterValues === "function") tint.setAttribute("values", tintFilterValues(cat.color));
    document.querySelectorAll("#cpm-dest-icon, #cpm-from-icon").forEach((el) => el.classList.toggle("photo", el.innerHTML.includes("room-logo-img")));

    document.getElementById("cpm-back").addEventListener("click", goBack);
    const reason = document.getElementById("cpm-reason");
    const start = document.getElementById("cpm-start");
    reason.addEventListener("input", () => {
      st.reason = reason.value;
      start.disabled = !canStart();
    });
    overlay.querySelectorAll("[data-reason]").forEach((c) =>
      c.addEventListener("click", () => {
        st.reason = c.dataset.reason;
        reason.value = st.reason;
        start.disabled = !canStart();
        reason.focus();
      })
    );
    start.addEventListener("click", submit);
    bindSlider();
    paintSlider();
    if (!st.reason) setTimeout(() => reason.focus(), 80);
  }

  function canStart() {
    return !st.busy && st.reason.trim().length >= 2;
  }

  /* the same vertical slider as the real pass box: drag or tap the track, or use the arrow keys */

  function setMinutes(v) {
    st.minutes = Math.min(st.max, Math.max(1, Math.round(v)));
    paintSlider();
  }

  function paintSlider() {
    const fill = document.getElementById("cpm-fill");
    if (!fill) return;
    const frac = st.max > 1 ? (st.minutes - 1) / (st.max - 1) : 1;
    fill.style.height = `${frac * 100}%`;
    document.getElementById("cpm-thumb").style.top = `${(1 - frac) * 100}%`;
    document.getElementById("cpm-value").textContent = `${st.minutes} min`;
    document.getElementById("cpm-track").setAttribute("aria-valuenow", st.minutes);
  }

  function bindSlider() {
    const track = document.getElementById("cpm-track");
    const fromPointer = (e) => {
      const r = track.getBoundingClientRect();
      const frac = 1 - (e.clientY - r.top) / r.height;
      setMinutes(1 + Math.min(1, Math.max(0, frac)) * (st.max - 1));
    };
    track.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      track.setPointerCapture(e.pointerId);
      fromPointer(e);
      const move = (ev) => fromPointer(ev);
      const up = () => {
        track.removeEventListener("pointermove", move);
        track.removeEventListener("pointerup", up);
        track.removeEventListener("pointercancel", up);
      };
      track.addEventListener("pointermove", move);
      track.addEventListener("pointerup", up);
      track.addEventListener("pointercancel", up);
    });
    track.addEventListener("keydown", (e) => {
      const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      setMinutes(st.minutes + step);
    });
  }

  function paint() {
    if (!overlay) return;
    if (st.step === "pick") paintPick();
    else paintTime();
  }

  async function submit() {
    if (!canStart()) return;
    st.busy = true;
    st.error = "";
    paintTime();
    const res = await apiFetch("/api/student/pass/class", {
      body: {
        name,
        from: { name: st.from.name, room: st.from.room, categoryKey: st.from.categoryKey },
        dest: { name: st.to.name, room: st.to.room, categoryKey: st.to.categoryKey },
        reason: st.reason.trim(),
        minutes: st.minutes,
      },
    });
    st.busy = false;
    if (!res.ok) {
      st.error = res.data.error || "Couldn't start your pass. Please try again.";
      return paintTime();
    }
    const where = st.to.name;
    close();
    applyServerState(res.data);
    if (typeof showMainPage === "function") showMainPage("home");
    showToast(`Pass started. Get to ${where}'s class before the countdown ends.`, "success");
  }

  btn.addEventListener("click", open);
})();
