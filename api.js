let serverClockOffset = 0;

function syncServerClock(serverNow) {
  if (typeof serverNow === "number") serverClockOffset = serverNow - Date.now();
}

function serverTime() {
  return Date.now() + serverClockOffset;
}

async function apiFetch(path, options = {}) {
  const { method, body, token } = options;
  try {
    const res = await fetch(path, {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (data && data.serverNow) syncServerClock(data.serverNow);
    return { ok: res.ok, status: res.status, data: data || {} };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: "Can't reach SmartPass right now. Check your internet connection." },
    };
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
