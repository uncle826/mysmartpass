const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;

const NAME_RE = /^[\p{L}\p{N} .,'’_-]{1,40}$/u;
const TEACHER_RE = /^[\p{L}\p{N} .,'’_-]{3,40}$/u;
const DEST_RE = /^[\p{L}\p{N} .,'’()#&_-]{1,60}$/u;
const KEY_RE = /^[a-z0-9]+$/;

const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PHOTO_CHARS = 30000;
const DAY_MS = 86400000;

const MIGRATIONS = [
  "ALTER TABLE students ADD COLUMN photo TEXT",
  "ALTER TABLE students ADD COLUMN request_only INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE students ADD COLUMN daily_limit INTEGER",
  "ALTER TABLE students ADD COLUMN tz_offset INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE teachers ADD COLUMN photo TEXT",
  "ALTER TABLE students ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE passes ADD COLUMN message TEXT",
  "ALTER TABLE passes ADD COLUMN bounce INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE students ADD COLUMN always_bounce INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE passes ADD COLUMN bounce_speed INTEGER NOT NULL DEFAULT 42",
];

const MIN_BOUNCE_SPEED = 10;
const MAX_BOUNCE_SPEED = 60000;

const LOGO_PRESET_RE = /^preset:[A-Za-z]{2,30}$/;

const encoder = new TextEncoder();

/* ---------------- helpers ---------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function safeEqual(a, b) {
  const x = encoder.encode(String(a));
  const y = encoder.encode(String(b));
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return toHex(bits);
}

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

function randomHex(bytes) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

function cleanName(raw) {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  return NAME_RE.test(name) ? name : null;
}

function keyOf(name) {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") || null;
}

function cleanDest(dest) {
  if (!dest || typeof dest !== "object") return null;
  const name = String(dest.name || "").trim();
  const room = String(dest.room || "").trim();
  const categoryKey = String(dest.categoryKey || "").trim();
  if (!DEST_RE.test(name)) return null;
  if (room && !DEST_RE.test(room)) return null;
  if (!/^[A-Za-z]{2,30}$/.test(categoryKey)) return null;
  return { name, room, categoryKey };
}

function cleanPhoto(photo) {
  if (photo === null) return { ok: true, value: null };
  if (typeof photo !== "string" || photo.length > MAX_PHOTO_CHARS || !PHOTO_RE.test(photo)) return { ok: false };
  return { ok: true, value: photo };
}

function cleanMessage(raw) {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  const text = String(raw)
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return { ok: true, value: null };
  if (text.length > 140) return { ok: false };
  return { ok: true, value: text };
}

function cleanLogo(raw) {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  if (LOGO_PRESET_RE.test(raw)) return { ok: true, value: raw };
  if (raw.length <= MAX_PHOTO_CHARS && PHOTO_RE.test(raw)) return { ok: true, value: raw };
  return { ok: false };
}

// null = invalid, "" only allowed when a field isn't required
function cleanClassField(raw, required) {
  const text = String(raw || "").trim();
  if (!text) return required ? null : "";
  return DEST_RE.test(text) ? text : null;
}

function cleanTz(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= -840 && n <= 840 ? n : null;
}

// start of the student's current day, using the timezone their browser reported
function dayStart(now, tzOffset) {
  const shift = (tzOffset || 0) * 60000;
  const local = now - shift;
  return local - (((local % DAY_MS) + DAY_MS) % DAY_MS) + shift;
}

function clientIp(request) {
  return request.headers.get("cf-connecting-ip") || "local";
}

/* ---------------- database ---------------- */

let schemaReady = null;

function ensureSchema(env) {
  if (!schemaReady) {
    const db = env.DB;
    schemaReady = db
      .batch([
        db.prepare(
          "CREATE TABLE IF NOT EXISTS students (key TEXT PRIMARY KEY, name TEXT NOT NULL, avatar_color TEXT, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL)"
        ),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS passes (id INTEGER PRIMARY KEY AUTOINCREMENT, student_key TEXT NOT NULL, dest_name TEXT NOT NULL, dest_room TEXT, dest_category TEXT NOT NULL, from_name TEXT, from_room TEXT, from_category TEXT, start_time INTEGER NOT NULL, end_time INTEGER NOT NULL, finished_at INTEGER, overtime INTEGER NOT NULL DEFAULT 0, created_by TEXT)"
        ),
        db.prepare("CREATE INDEX IF NOT EXISTS passes_student ON passes (student_key, id)"),
        db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS one_active_pass ON passes (student_key) WHERE finished_at IS NULL"),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS teachers (username TEXT PRIMARY KEY, display TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL)"
        ),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at INTEGER NOT NULL)"
        ),
        db.prepare("CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)"),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS pass_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, student_key TEXT NOT NULL, dest_name TEXT NOT NULL, dest_room TEXT, dest_category TEXT NOT NULL, from_name TEXT, from_room TEXT, from_category TEXT, minutes INTEGER NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, decided_at INTEGER)"
        ),
        db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request ON pass_requests (student_key) WHERE status = 'pending'"),
        db.prepare(
          "CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, room TEXT, logo TEXT, created_by TEXT, created_at INTEGER NOT NULL)"
        ),
        db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS classes_name ON classes (name COLLATE NOCASE)"),
      ])
      .then(async () => {
        for (const sql of MIGRATIONS) {
          try {
            await db.prepare(sql).run();
          } catch (err) {
            if (!/duplicate column/i.test(String(err && err.message))) throw err;
          }
        }
      })
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

async function allowAttempt(env, bucket, limit, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare("SELECT count, reset_at FROM rate_limits WHERE k = ?").bind(bucket).first();
  if (!row || row.reset_at <= now) {
    await env.DB.prepare("INSERT OR REPLACE INTO rate_limits (k, count, reset_at) VALUES (?, 1, ?)")
      .bind(bucket, now + windowMs)
      .run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE k = ?").bind(bucket).run();
  return true;
}

async function clearAttempts(env, bucket) {
  await env.DB.prepare("DELETE FROM rate_limits WHERE k = ?").bind(bucket).run();
}

/* ---------------- shaping rows for the client ---------------- */

function activeFromRow(row) {
  return {
    room: { name: row.dest_name, room: row.dest_room || "", categoryKey: row.dest_category },
    from: row.from_name ? { name: row.from_name, room: row.from_room || "", categoryKey: row.from_category } : null,
    startTime: row.start_time,
    endTime: row.end_time,
    createdBy: row.created_by || null,
    message: row.message || null,
    bounce: !!row.bounce,
    bounceSpeed: row.bounce_speed || 42,
  };
}

function logFromRow(row) {
  return {
    id: row.id,
    name: row.dest_name,
    room: row.dest_room || "",
    categoryKey: row.dest_category,
    startTime: row.start_time,
    plannedEnd: row.end_time,
    endTime: row.finished_at,
    overtime: !!row.overtime,
    message: row.message || null,
  };
}

function requestFromRow(row) {
  return {
    id: row.id,
    dest: { name: row.dest_name, room: row.dest_room || "", categoryKey: row.dest_category },
    from: row.from_name ? { name: row.from_name, room: row.from_room || "", categoryKey: row.from_category } : null,
    minutes: row.minutes,
    createdAt: row.created_at,
  };
}

async function passesToday(env, key, tzOffset) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM passes WHERE student_key = ? AND start_time >= ?")
    .bind(key, dayStart(Date.now(), tzOffset))
    .first();
  return row ? row.n : 0;
}

// returns a message when the student isn't allowed another pass right now
async function limitMessage(env, key, student) {
  if (student.daily_limit === null || student.daily_limit === undefined) return null;
  if (student.daily_limit === 0) return "Passes are turned off for you right now.";
  const used = await passesToday(env, key, student.tz_offset);
  return used >= student.daily_limit ? `You've used all ${student.daily_limit} of your passes for today.` : null;
}

async function studentState(env, key) {
  const student = await env.DB
    .prepare("SELECT key, name, avatar_color, photo, request_only, daily_limit, tz_offset FROM students WHERE key = ?")
    .bind(key)
    .first();
  if (!student) return null;

  const now = Date.now();
  const activeRow = await env.DB.prepare("SELECT * FROM passes WHERE student_key = ? AND finished_at IS NULL").bind(key).first();
  const logRows = await env.DB
    .prepare(
      "SELECT * FROM (SELECT * FROM passes WHERE student_key = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 500) ORDER BY id ASC"
    )
    .bind(key)
    .all();
  const pending = await env.DB.prepare("SELECT * FROM pass_requests WHERE student_key = ? AND status = 'pending'").bind(key).first();
  const decided = await env.DB
    .prepare(
      "SELECT * FROM pass_requests WHERE student_key = ? AND status IN ('approved', 'denied') AND decided_at >= ? ORDER BY id DESC LIMIT 1"
    )
    .bind(key, now - 180000)
    .first();

  return {
    key: student.key,
    name: student.name,
    avatarColor: student.avatar_color,
    photo: student.photo || null,
    requestOnly: !!student.request_only,
    dailyLimit: student.daily_limit === null || student.daily_limit === undefined ? null : student.daily_limit,
    usedToday: await passesToday(env, key, student.tz_offset),
    request: pending ? requestFromRow(pending) : null,
    decision: decided ? { id: decided.id, status: decided.status, destName: decided.dest_name } : null,
    active: activeRow ? activeFromRow(activeRow) : null,
    log: logRows.results.map(logFromRow),
    serverNow: now,
  };
}

async function createPass(env, key, dest, from, minutes, createdBy, message = null, bounce = false) {
  const start = Date.now();
  const end = start + minutes * 60000;
  try {
    await env.DB.prepare(
      "INSERT INTO passes (student_key, dest_name, dest_room, dest_category, from_name, from_room, from_category, start_time, end_time, created_by, message, bounce) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        key,
        dest.name,
        dest.room,
        dest.categoryKey,
        from ? from.name : null,
        from ? from.room : null,
        from ? from.categoryKey : null,
        start,
        end,
        createdBy,
        message,
        bounce ? 1 : 0
      )
      .run();
    // making a pass (by the student, a teacher, or an approved request) brings a removed student back into view
    await env.DB.prepare("UPDATE students SET hidden = 0 WHERE key = ?").bind(key).run();
    return true;
  } catch (err) {
    if (String(err && err.message).includes("UNIQUE")) return false;
    throw err;
  }
}

async function endPass(env, key) {
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE passes SET finished_at = ?, overtime = CASE WHEN ? > end_time THEN 1 ELSE 0 END WHERE student_key = ? AND finished_at IS NULL"
  )
    .bind(now, now, key)
    .run();
}

function clampMinutes(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(60, Math.max(1, n)) : 5;
}

function clampMinutesTeacher(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(480, Math.max(1, n)) : 5;
}

/* ---------------- teacher auth ---------------- */

async function newSession(env, username) {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256Hex(token), username, Date.now() + SESSION_MS)
    .run();
  return token;
}

async function requireTeacher(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const session = await env.DB.prepare("SELECT username, expires_at FROM sessions WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .first();
  if (!session || session.expires_at < Date.now()) return null;

  return env.DB.prepare("SELECT username, display, photo FROM teachers WHERE username = ?").bind(session.username).first();
}

async function codeIsValid(env, code) {
  const expected = env.ACCESS_CODE;
  if (!expected) return false;
  return safeEqual(String(code || ""), expected);
}

/* ---------------- routes ---------------- */

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  /* ----- students (name only, no password) ----- */

  if (pathname === "/api/student/login" && method === "POST") {
    const body = await readBody(request);
    const name = cleanName(body.name);
    const key = name && keyOf(name);
    if (!key) return fail("Please enter a valid name.");

    const now = Date.now();
    const tz = cleanTz(body.tz);
    const existing = await env.DB.prepare("SELECT key FROM students WHERE key = ?").bind(key).first();
    if (existing) {
      await env.DB.prepare("UPDATE students SET last_seen = ?, tz_offset = COALESCE(?, tz_offset) WHERE key = ?")
        .bind(now, tz, key)
        .run();
    } else {
      await env.DB.prepare("INSERT INTO students (key, name, created_at, last_seen, tz_offset) VALUES (?, ?, ?, ?, ?)")
        .bind(key, name, now, now, tz === null ? 0 : tz)
        .run();
    }
    return json(await studentState(env, key));
  }

  if (pathname === "/api/student/state" && method === "GET") {
    const name = cleanName(url.searchParams.get("name"));
    const key = name && keyOf(name);
    if (!key) return fail("Please enter a valid name.");
    const tz = cleanTz(url.searchParams.get("tz"));
    if (tz !== null) await env.DB.prepare("UPDATE students SET tz_offset = ? WHERE key = ? AND tz_offset != ?").bind(tz, key, tz).run();
    const state = await studentState(env, key);
    return state ? json(state) : fail("Student not found.", 404);
  }

  if (pathname === "/api/student/pass" && method === "POST") {
    const body = await readBody(request);
    const name = cleanName(body.name);
    const key = name && keyOf(name);
    const dest = cleanDest(body.dest);
    if (!key || !dest) return fail("Invalid pass.");

    let from = null;
    if (body.from) {
      from = cleanDest(body.from);
      if (!from) return fail("Invalid pass.");
    }
    const student = await env.DB.prepare("SELECT request_only, daily_limit, tz_offset FROM students WHERE key = ?").bind(key).first();
    if (!student) return fail("Student not found.", 404);
    if (student.request_only) return fail("Your teacher needs to approve your passes. Send a request instead.", 403);
    const blocked = await limitMessage(env, key, student);
    if (blocked) return fail(blocked, 403);

    const created = await createPass(env, key, dest, from, clampMinutes(body.minutes), null);
    if (!created) return fail("You're already on a pass.", 409);
    await env.DB.prepare("UPDATE pass_requests SET status = 'cancelled' WHERE student_key = ? AND status = 'pending'").bind(key).run();
    return json(await studentState(env, key));
  }

  if (pathname === "/api/student/request" && method === "POST") {
    const body = await readBody(request);
    const name = cleanName(body.name);
    const key = name && keyOf(name);
    const dest = cleanDest(body.dest);
    if (!key || !dest) return fail("Invalid request.");

    let from = null;
    if (body.from) {
      from = cleanDest(body.from);
      if (!from) return fail("Invalid request.");
    }
    const student = await env.DB.prepare("SELECT request_only, daily_limit, tz_offset FROM students WHERE key = ?").bind(key).first();
    if (!student) return fail("Student not found.", 404);
    const active = await env.DB.prepare("SELECT id FROM passes WHERE student_key = ? AND finished_at IS NULL").bind(key).first();
    if (active) return fail("You're already on a pass.", 409);
    const blocked = await limitMessage(env, key, student);
    if (blocked) return fail(blocked, 403);

    try {
      await env.DB.prepare(
        "INSERT INTO pass_requests (student_key, dest_name, dest_room, dest_category, from_name, from_room, from_category, minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(
          key,
          dest.name,
          dest.room,
          dest.categoryKey,
          from ? from.name : null,
          from ? from.room : null,
          from ? from.categoryKey : null,
          clampMinutes(body.minutes),
          Date.now()
        )
        .run();
    } catch (err) {
      if (String(err && err.message).includes("UNIQUE")) return fail("You already have a request waiting.", 409);
      throw err;
    }
    return json(await studentState(env, key));
  }

  if (pathname === "/api/student/request/cancel" && method === "POST") {
    const body = await readBody(request);
    const name = cleanName(body.name);
    const key = name && keyOf(name);
    if (!key) return fail("Invalid request.");
    await env.DB.prepare("UPDATE pass_requests SET status = 'cancelled' WHERE student_key = ? AND status = 'pending'").bind(key).run();
    return json(await studentState(env, key));
  }

  if (pathname === "/api/student/pass/end" && method === "POST") {
    const body = await readBody(request);
    const name = cleanName(body.name);
    const key = name && keyOf(name);
    if (!key) return fail("Invalid request.");
    await endPass(env, key);
    return json(await studentState(env, key));
  }

  if (pathname === "/api/student/log/clear" && method === "POST") {
    const body = await readBody(request);
    const name = cleanName(body.name);
    const key = name && keyOf(name);
    if (!key) return fail("Invalid request.");
    await env.DB.prepare("DELETE FROM passes WHERE student_key = ? AND finished_at IS NOT NULL").bind(key).run();
    return json(await studentState(env, key));
  }

  if (pathname === "/api/student/avatar" && method === "POST") {
    const body = await readBody(request);
    const name = cleanName(body.name);
    const key = name && keyOf(name);
    const color = String(body.color || "");
    if (!key || !/^#[0-9a-fA-F]{6}$/.test(color)) return fail("Invalid request.");
    await env.DB.prepare("UPDATE students SET avatar_color = ? WHERE key = ?").bind(color, key).run();
    return json({ ok: true });
  }

  if (pathname === "/api/classes" && method === "GET") {
    const rows = await env.DB.prepare("SELECT id, name, room, logo FROM classes ORDER BY name COLLATE NOCASE").all();
    return json({ classes: rows.results });
  }

  /* ----- teacher accounts ----- */

  if (pathname === "/api/teacher/verify-code" && method === "POST") {
    const body = await readBody(request);
    const ip = clientIp(request);
    if (!(await allowAttempt(env, `code:${ip}`, 8, 15 * 60000))) {
      return fail("Too many attempts. Please wait a few minutes and try again.", 429);
    }
    if (!(await codeIsValid(env, body.code))) return fail("Incorrect access code.", 403);
    await clearAttempts(env, `code:${ip}`);
    return json({ ok: true });
  }

  if (pathname === "/api/teacher/signup" && method === "POST") {
    const body = await readBody(request);
    const ip = clientIp(request);
    if (!(await allowAttempt(env, `code:${ip}`, 8, 15 * 60000))) {
      return fail("Too many attempts. Please wait a few minutes and try again.", 429);
    }
    if (!(await codeIsValid(env, body.code))) return fail("Incorrect access code.", 403);

    const display = String(body.username || "").replace(/\s+/g, " ").trim();
    const username = display.toLowerCase();
    const password = String(body.password || "");
    if (!TEACHER_RE.test(display)) return fail("Usernames need 3–40 letters, numbers, spaces or . _ -");
    if (password.length < 6 || password.length > 100) return fail("Passwords need at least 6 characters.");

    const existing = await env.DB.prepare("SELECT username FROM teachers WHERE username = ?").bind(username).first();
    if (existing) return fail("That username is already taken.", 409);

    const salt = randomHex(16);
    await env.DB.prepare("INSERT INTO teachers (username, display, salt, hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(username, display, salt, await hashPassword(password, salt), Date.now())
      .run();
    await clearAttempts(env, `code:${ip}`);

    return json({ token: await newSession(env, username), name: display });
  }

  if (pathname === "/api/teacher/login" && method === "POST") {
    const body = await readBody(request);
    const ip = clientIp(request);
    const bucket = `login:${ip}`;
    if (!(await allowAttempt(env, bucket, 10, 15 * 60000))) {
      return fail("Too many attempts. Please wait a few minutes and try again.", 429);
    }

    const username = String(body.username || "").replace(/\s+/g, " ").trim().toLowerCase();
    const password = String(body.password || "");
    const teacher = username
      ? await env.DB.prepare("SELECT username, display, salt, hash FROM teachers WHERE username = ?").bind(username).first()
      : null;

    // hash even when the user doesn't exist so timing doesn't reveal which usernames are real
    const attempt = await hashPassword(password, teacher ? teacher.salt : "00".repeat(16));
    if (!teacher || !safeEqual(attempt, teacher.hash)) return fail("Incorrect username or password.", 401);

    await clearAttempts(env, bucket);
    return json({ token: await newSession(env, teacher.username), name: teacher.display });
  }

  /* ----- everything below needs a signed-in teacher ----- */

  if (pathname.startsWith("/api/teacher/")) {
    const teacher = await requireTeacher(request, env);
    if (!teacher) return fail("Please sign in.", 401);

    if (pathname === "/api/teacher/me" && method === "GET") {
      return json({ name: teacher.display, photo: teacher.photo || null });
    }

    if (pathname === "/api/teacher/photo" && method === "POST") {
      const body = await readBody(request);
      const photo = cleanPhoto(body.photo);
      if (!photo.ok) return fail("That photo isn't valid. Try a different image.");
      await env.DB.prepare("UPDATE teachers SET photo = ? WHERE username = ?").bind(photo.value, teacher.username).run();
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/logout" && method === "POST") {
      const token = (request.headers.get("authorization") || "").slice(7).trim();
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/students" && method === "GET") {
      const now = Date.now();
      const students = await env.DB
        .prepare("SELECT key, name, avatar_color, photo, request_only, daily_limit, tz_offset, hidden FROM students ORDER BY name COLLATE NOCASE")
        .all();
      const active = await env.DB.prepare("SELECT * FROM passes WHERE finished_at IS NULL").all();
      const finished = await env.DB
        .prepare("SELECT * FROM passes WHERE finished_at IS NOT NULL ORDER BY id ASC")
        .all();
      const pending = await env.DB.prepare("SELECT * FROM pass_requests WHERE status = 'pending' ORDER BY id ASC").all();

      const activeByKey = new Map(active.results.map((r) => [r.student_key, activeFromRow(r)]));
      const requestByKey = new Map(pending.results.map((r) => [r.student_key, requestFromRow(r)]));
      const logByKey = new Map();
      const startsByKey = new Map();
      for (const row of [...finished.results, ...active.results]) {
        if (!startsByKey.has(row.student_key)) startsByKey.set(row.student_key, []);
        startsByKey.get(row.student_key).push(row.start_time);
      }
      for (const row of finished.results) {
        if (!logByKey.has(row.student_key)) logByKey.set(row.student_key, []);
        logByKey.get(row.student_key).push(logFromRow(row));
      }

      return json({
        serverNow: now,
        students: students.results.map((s) => {
          const since = dayStart(now, s.tz_offset);
          return {
            key: s.key,
            name: s.name,
            avatarColor: s.avatar_color,
            photo: s.photo || null,
            requestOnly: !!s.request_only,
            hidden: !!s.hidden,
            dailyLimit: s.daily_limit === null || s.daily_limit === undefined ? null : s.daily_limit,
            usedToday: (startsByKey.get(s.key) || []).filter((t) => t >= since).length,
            request: requestByKey.get(s.key) || null,
            active: activeByKey.get(s.key) || null,
            log: logByKey.get(s.key) || [],
          };
        }),
      });
    }

    if (pathname === "/api/teacher/student/settings" && method === "POST") {
      const body = await readBody(request);
      const key = String(body.key || "");
      if (!KEY_RE.test(key)) return fail("Invalid request.");

      if ("requestOnly" in body) {
        await env.DB.prepare("UPDATE students SET request_only = ? WHERE key = ?").bind(body.requestOnly ? 1 : 0, key).run();
      }
      if ("dailyLimit" in body) {
        const v = body.dailyLimit;
        if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 3)) return fail("Invalid limit.");
        await env.DB.prepare("UPDATE students SET daily_limit = ? WHERE key = ?").bind(v, key).run();
      }
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/student/hide" && method === "POST") {
      const body = await readBody(request);
      const key = String(body.key || "");
      if (!KEY_RE.test(key)) return fail("Invalid request.");
      if (body.hidden) {
        const active = await env.DB.prepare("SELECT id FROM passes WHERE student_key = ? AND finished_at IS NULL").bind(key).first();
        if (active) return fail("Can't remove a student while they're on a pass.", 409);
      }
      await env.DB.prepare("UPDATE students SET hidden = ? WHERE key = ?").bind(body.hidden ? 1 : 0, key).run();
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/student/photo" && method === "POST") {
      const body = await readBody(request);
      const key = String(body.key || "");
      const photo = cleanPhoto(body.photo);
      if (!KEY_RE.test(key) || !photo.ok) return fail("That photo isn't valid. Try a different image.");
      await env.DB.prepare("UPDATE students SET photo = ? WHERE key = ?").bind(photo.value, key).run();
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/class" && method === "POST") {
      const body = await readBody(request);
      const name = cleanClassField(body.name, true);
      const room = cleanClassField(body.room, false);
      const logo = cleanLogo(body.logo);
      if (!name || room === null || !logo.ok) return fail("Invalid class.");
      let id;
      try {
        const res = await env.DB.prepare("INSERT INTO classes (name, room, logo, created_by, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(name, room, logo.value, teacher.display, Date.now())
          .run();
        id = res.meta.last_row_id;
      } catch (err) {
        if (String(err && err.message).includes("UNIQUE")) return fail("A class with that name already exists.", 409);
        throw err;
      }
      return json({ ok: true, id });
    }

    if (pathname === "/api/teacher/class/update" && method === "POST") {
      const body = await readBody(request);
      const id = Number(body.id);
      const name = cleanClassField(body.name, true);
      const room = cleanClassField(body.room, false);
      const logo = cleanLogo(body.logo);
      if (!Number.isInteger(id) || !name || room === null || !logo.ok) return fail("Invalid class.");
      try {
        await env.DB.prepare("UPDATE classes SET name = ?, room = ?, logo = ? WHERE id = ?")
          .bind(name, room, logo.value, id)
          .run();
      } catch (err) {
        if (String(err && err.message).includes("UNIQUE")) return fail("A class with that name already exists.", 409);
        throw err;
      }
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/class/delete" && method === "POST") {
      const body = await readBody(request);
      const id = Number(body.id);
      if (!Number.isInteger(id)) return fail("Invalid request.");
      await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/pass/bounce" && method === "POST") {
      const body = await readBody(request);
      const key = String(body.key || "");
      if (!KEY_RE.test(key)) return fail("Invalid request.");
      const active = await env.DB.prepare("SELECT id FROM passes WHERE student_key = ? AND finished_at IS NULL").bind(key).first();
      if (!active) return fail("That student isn't on a pass right now.", 409);

      if ("speed" in body) {
        const speed = Math.round(Number(body.speed));
        if (!Number.isFinite(speed) || speed < MIN_BOUNCE_SPEED || speed > MAX_BOUNCE_SPEED) return fail("Invalid speed.");
        await env.DB.prepare("UPDATE passes SET bounce = ?, bounce_speed = ? WHERE id = ?")
          .bind(body.bounce ? 1 : 0, speed, active.id)
          .run();
      } else {
        await env.DB.prepare("UPDATE passes SET bounce = ? WHERE id = ?").bind(body.bounce ? 1 : 0, active.id).run();
      }
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/pass/delete" && method === "POST") {
      const body = await readBody(request);
      const key = String(body.key || "");
      const id = Number(body.id);
      if (!KEY_RE.test(key) || !Number.isInteger(id)) return fail("Invalid request.");
      await env.DB.prepare("DELETE FROM passes WHERE id = ? AND student_key = ? AND finished_at IS NOT NULL").bind(id, key).run();
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/request/decide" && method === "POST") {
      const body = await readBody(request);
      const id = Number(body.id);
      if (!Number.isInteger(id)) return fail("Invalid request.");
      const req = await env.DB.prepare("SELECT * FROM pass_requests WHERE id = ? AND status = 'pending'").bind(id).first();
      if (!req) return fail("That request is no longer waiting.", 409);

      if (body.approve) {
        const dest = { name: req.dest_name, room: req.dest_room || "", categoryKey: req.dest_category };
        const from = req.from_name ? { name: req.from_name, room: req.from_room || "", categoryKey: req.from_category } : null;
        const created = await createPass(env, req.student_key, dest, from, clampMinutes(req.minutes), null);
        if (!created) {
          await env.DB.prepare("UPDATE pass_requests SET status = 'cancelled' WHERE id = ?").bind(id).run();
          return fail("That student is already on a pass.", 409);
        }
      }
      await env.DB.prepare("UPDATE pass_requests SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?")
        .bind(body.approve ? "approved" : "denied", teacher.display, Date.now(), id)
        .run();
      return json({ ok: true, serverNow: Date.now() });
    }

    if (pathname === "/api/teacher/pass" && method === "POST") {
      const body = await readBody(request);
      const key = String(body.key || "");
      const dest = cleanDest(body.dest);
      const message = cleanMessage(body.message);
      if (!KEY_RE.test(key) || !dest || !message.ok) return fail("Invalid pass.");
      if (!(await studentState(env, key))) return fail("Student not found.", 404);

      const created = await createPass(env, key, dest, null, clampMinutesTeacher(body.minutes), teacher.display, message.value);
      if (!created) return fail("That student is already on a pass.", 409);
      await env.DB.prepare("UPDATE pass_requests SET status = 'cancelled' WHERE student_key = ? AND status = 'pending'").bind(key).run();
      return json({ ok: true, serverNow: Date.now() });
    }

    if (pathname === "/api/teacher/pass/end" && method === "POST") {
      const body = await readBody(request);
      const key = String(body.key || "");
      if (!KEY_RE.test(key)) return fail("Invalid request.");
      await endPass(env, key);
      return json({ ok: true, serverNow: Date.now() });
    }
  }

  return fail("Not found.", 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      await ensureSchema(env);
      return await handleApi(request, env, url);
    } catch (err) {
      console.error("API error", err && err.message);
      return fail("Something went wrong. Please try again.", 500);
    }
  },
};
