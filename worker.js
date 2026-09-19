const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;

const NAME_RE = /^[\p{L}\p{N} .,'’_-]{1,40}$/u;
const TEACHER_RE = /^[\p{L}\p{N} .,'’_-]{3,40}$/u;
const DEST_RE = /^[\p{L}\p{N} .,'’()#&_-]{1,60}$/u;
const KEY_RE = /^[a-z0-9]+$/;

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
      ])
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
  };
}

function logFromRow(row) {
  return {
    name: row.dest_name,
    room: row.dest_room || "",
    categoryKey: row.dest_category,
    startTime: row.start_time,
    plannedEnd: row.end_time,
    endTime: row.finished_at,
    overtime: !!row.overtime,
  };
}

async function studentState(env, key) {
  const student = await env.DB.prepare("SELECT key, name, avatar_color FROM students WHERE key = ?").bind(key).first();
  if (!student) return null;

  const activeRow = await env.DB.prepare("SELECT * FROM passes WHERE student_key = ? AND finished_at IS NULL").bind(key).first();
  const logRows = await env.DB
    .prepare(
      "SELECT * FROM (SELECT * FROM passes WHERE student_key = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 500) ORDER BY id ASC"
    )
    .bind(key)
    .all();

  return {
    key: student.key,
    name: student.name,
    avatarColor: student.avatar_color,
    active: activeRow ? activeFromRow(activeRow) : null,
    log: logRows.results.map(logFromRow),
    serverNow: Date.now(),
  };
}

async function createPass(env, key, dest, from, minutes, createdBy) {
  const start = Date.now();
  const end = start + minutes * 60000;
  try {
    await env.DB.prepare(
      "INSERT INTO passes (student_key, dest_name, dest_room, dest_category, from_name, from_room, from_category, start_time, end_time, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
        createdBy
      )
      .run();
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

  return env.DB.prepare("SELECT username, display FROM teachers WHERE username = ?").bind(session.username).first();
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
    const existing = await env.DB.prepare("SELECT key FROM students WHERE key = ?").bind(key).first();
    if (existing) {
      await env.DB.prepare("UPDATE students SET last_seen = ? WHERE key = ?").bind(now, key).run();
    } else {
      await env.DB.prepare("INSERT INTO students (key, name, created_at, last_seen) VALUES (?, ?, ?, ?)")
        .bind(key, name, now, now)
        .run();
    }
    return json(await studentState(env, key));
  }

  if (pathname === "/api/student/state" && method === "GET") {
    const name = cleanName(url.searchParams.get("name"));
    const key = name && keyOf(name);
    if (!key) return fail("Please enter a valid name.");
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
    if (!(await studentState(env, key))) return fail("Student not found.", 404);

    const created = await createPass(env, key, dest, from, clampMinutes(body.minutes), null);
    if (!created) return fail("You're already on a pass.", 409);
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
      return json({ name: teacher.display });
    }

    if (pathname === "/api/teacher/logout" && method === "POST") {
      const token = (request.headers.get("authorization") || "").slice(7).trim();
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
      return json({ ok: true });
    }

    if (pathname === "/api/teacher/students" && method === "GET") {
      const students = await env.DB.prepare("SELECT key, name, avatar_color FROM students ORDER BY name COLLATE NOCASE").all();
      const active = await env.DB.prepare("SELECT * FROM passes WHERE finished_at IS NULL").all();
      const finished = await env.DB
        .prepare("SELECT * FROM passes WHERE finished_at IS NOT NULL ORDER BY id ASC")
        .all();

      const activeByKey = new Map(active.results.map((r) => [r.student_key, activeFromRow(r)]));
      const logByKey = new Map();
      for (const row of finished.results) {
        if (!logByKey.has(row.student_key)) logByKey.set(row.student_key, []);
        logByKey.get(row.student_key).push(logFromRow(row));
      }

      return json({
        serverNow: Date.now(),
        students: students.results.map((s) => ({
          key: s.key,
          name: s.name,
          avatarColor: s.avatar_color,
          active: activeByKey.get(s.key) || null,
          log: logByKey.get(s.key) || [],
        })),
      });
    }

    if (pathname === "/api/teacher/pass" && method === "POST") {
      const body = await readBody(request);
      const key = String(body.key || "");
      const dest = cleanDest(body.dest);
      if (!KEY_RE.test(key) || !dest) return fail("Invalid pass.");
      if (!(await studentState(env, key))) return fail("Student not found.", 404);

      const created = await createPass(env, key, dest, null, clampMinutes(body.minutes), teacher.display);
      if (!created) return fail("That student is already on a pass.", 409);
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
