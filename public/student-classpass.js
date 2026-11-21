/* Student "Pass to Class": for when you're late. Pick the teacher you're coming from and the teacher you're going to,
   say why you're late, and start the pass. It's a short countdown, and it is logged on the teacher's Attendance page.
   Runs after student-extras.js (uses name, apiFetch, escapeHtml, showToast, applyServerState, currentPass, CATEGORIES). */

(function () {
  const btn = document.getElementById("class-pass-btn");
  if (!btn) return;

  // the people a student can pick: classrooms, admins and student services are all named after staff
  const TEACHER_GROUPS = ["classrooms", "admins", "studentServices"];

  const REASONS = ["Was with another teacher", "Bathroom", "Locker", "Nurse or office", "Talking with a friend"];

  let host = null;
  let st = null; // { from, to, reason, view: "main" | "from" | "to", query, busy }

  function teachers() {
    const out = [];
    TEACHER_GROUPS.forEach((key) => {
      const cat = CATEGORIES.find((c) => c.key === key);
      if (!cat || !cat.rooms) return;
      cat.rooms.forEach((r) => out.push({ name: r.name, room: r.room || "", categoryKey: key, group: cat.label }));
    });
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  }

  function open() {
    if (host) return;
    if (typeof currentPass !== "undefined" && currentPass) return showToast("You're already on a pass.", "info");
    st = { from: null, to: null, reason: "", view: "main", query: "", busy: false, error: "" };
    host = document.createElement("div");
    host.className = "cp-overlay";
    document.body.appendChild(host);
    host.addEventListener("mousedown", (e) => {
      if (e.target === host) close();
    });
    document.addEventListener("keydown", onKey);
    paint();
  }

  function close() {
    if (!host) return;
    const h = host;
    host = null;
    document.removeEventListener("keydown", onKey);
    h.classList.add("leaving");
    setTimeout(() => h.remove(), 170);
  }

  function onKey(e) {
    if (e.key !== "Escape") return;
    if (st.view !== "main") {
      st.view = "main";
      st.query = "";
      paint();
    } else {
      close();
    }
  }

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function minutesText() {
    const n = typeof classPassMinutesNow === "number" ? classPassMinutesNow : 3;
    return `${n} minute${n === 1 ? "" : "s"}`;
  }

  function field(kind, label, value) {
    const done = !!value;
    return `
      <button type="button" class="cp-field ${done ? "done" : ""}" data-pick="${kind}">
        <span class="cp-dot">${done ? CHECK : ""}</span>
        <span class="cp-field-text"><small>${label}</small><b>${done ? escapeHtml(value.name) : "Choose a teacher"}</b></span>
        ${done && value.room ? `<span class="cp-room">${escapeHtml(value.room)}</span>` : ""}
        <span class="cp-chev">${CHEV}</span>
      </button>`;
  }

  function paint() {
    if (!host) return;
    if (st.view !== "main") return paintList();

    const ready = st.from && st.to;
    const ok = ready && st.reason.trim().length >= 2 && !st.busy;
    host.innerHTML = `
      <div class="cp-box" role="dialog" aria-modal="true" aria-labelledby="cp-title">
        <div class="cp-head">
          <div><h2 id="cp-title">Pass to Class</h2><p>Late to class? Pick who you were with and where you're going.</p></div>
          <button type="button" class="cp-x" id="cp-x" aria-label="Close">&times;</button>
        </div>

        <div class="cp-route">
          ${field("from", "Coming from", st.from)}
          <span class="cp-line"></span>
          ${field("to", "Going to", st.to)}
        </div>

        <div class="cp-reason ${ready ? "show" : ""}" id="cp-reason-wrap">
          <label for="cp-reason">Why are you late to class?</label>
          <textarea id="cp-reason" maxlength="140" rows="3" placeholder="Type a short reason" autocomplete="off">${escapeHtml(st.reason)}</textarea>
          <div class="cp-chips">${REASONS.map((r) => `<button type="button" class="cp-chip" data-reason="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("")}</div>
        </div>

        <p class="cp-note">${ready ? `You'll have <b>${minutesText()}</b> to get to class. Your teacher will see when you were late.` : "Choose both teachers to continue."}</p>
        <p class="cp-error ${st.error ? "" : "hidden"}" id="cp-error" role="alert">${escapeHtml(st.error)}</p>

        <button type="button" class="cp-start" id="cp-start" ${ok ? "" : "disabled"}>${st.busy ? "Starting..." : "Start Pass"}</button>
      </div>`;

    document.getElementById("cp-x").addEventListener("click", close);
    host.querySelectorAll("[data-pick]").forEach((b) =>
      b.addEventListener("click", () => {
        st.view = b.dataset.pick;
        st.query = "";
        paint();
      })
    );
    const area = document.getElementById("cp-reason");
    const start = document.getElementById("cp-start");
    area.addEventListener("input", () => {
      st.reason = area.value;
      start.disabled = !(st.from && st.to && st.reason.trim().length >= 2 && !st.busy);
    });
    host.querySelectorAll("[data-reason]").forEach((c) =>
      c.addEventListener("click", () => {
        st.reason = c.dataset.reason;
        area.value = st.reason;
        start.disabled = !(st.from && st.to && !st.busy);
        area.focus();
      })
    );
    start.addEventListener("click", submit);
    if (ready && !st.reason) setTimeout(() => area.focus(), 60);
  }

  function paintList() {
    const kind = st.view;
    const q = st.query.trim().toLowerCase();
    const other = kind === "from" ? st.to : st.from;
    const list = teachers().filter((t) => (!q || t.name.toLowerCase().includes(q) || t.room.toLowerCase().includes(q)) && !(other && other.name === t.name));
    host.innerHTML = `
      <div class="cp-box" role="dialog" aria-modal="true" aria-labelledby="cp-title">
        <div class="cp-head">
          <button type="button" class="cp-back" id="cp-back" aria-label="Back">${BACK}</button>
          <div class="cp-head-grow"><h2 id="cp-title">${kind === "from" ? "Coming from" : "Going to"}</h2><p>${kind === "from" ? "Which teacher were you with?" : "Which teacher's class are you going to?"}</p></div>
          <button type="button" class="cp-x" id="cp-x" aria-label="Close">&times;</button>
        </div>
        <input type="search" id="cp-search" class="cp-search" placeholder="Search teachers" value="${escapeHtml(st.query)}" autocomplete="off">
        <div class="cp-list" id="cp-list">
          ${
            list
              .map(
                (t, i) =>
                  `<button type="button" class="cp-row" data-i="${i}" style="--i:${Math.min(i, 12)}"><span class="cp-row-name">${escapeHtml(t.name)}</span>${t.room ? `<span class="cp-room">${escapeHtml(t.room)}</span>` : ""}</button>`
              )
              .join("") || '<p class="cp-none">No teachers match that.</p>'
          }
        </div>
      </div>`;
    document.getElementById("cp-x").addEventListener("click", close);
    document.getElementById("cp-back").addEventListener("click", () => {
      st.view = "main";
      st.query = "";
      paint();
    });
    const search = document.getElementById("cp-search");
    search.addEventListener("input", () => {
      st.query = search.value;
      paintList();
      const again = document.getElementById("cp-search");
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    });
    host.querySelectorAll("[data-i]").forEach((b) =>
      b.addEventListener("click", () => {
        const t = list[Number(b.dataset.i)];
        st[kind] = { name: t.name, room: t.room, categoryKey: t.categoryKey };
        st.view = "main";
        st.query = "";
        st.error = "";
        paint();
      })
    );
    search.focus();
  }

  async function submit() {
    if (st.busy) return;
    st.busy = true;
    st.error = "";
    paint();
    const res = await apiFetch("/api/student/pass/class", {
      body: {
        name,
        from: { name: st.from.name, room: st.from.room, categoryKey: st.from.categoryKey },
        dest: { name: st.to.name, room: st.to.room, categoryKey: st.to.categoryKey },
        reason: st.reason.trim(),
      },
    });
    st.busy = false;
    if (!res.ok) {
      st.error = res.data.error || "Couldn't start your pass. Please try again.";
      return paint();
    }
    const where = st.to.name;
    close();
    applyServerState(res.data);
    if (typeof showMainPage === "function") showMainPage("home");
    showToast(`Pass started. Get to ${where}'s class before the countdown ends.`, "success");
  }

  btn.addEventListener("click", open);
})();
