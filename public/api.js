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

function tzOffset() {
  return new Date().getTimezoneOffset();
}

function applyPhoto(el, photo) {
  if (!el) return;
  if (photo) {
    el.style.backgroundImage = `url("${photo}")`;
    el.classList.add("has-photo");
  } else {
    el.style.backgroundImage = "";
    el.classList.remove("has-photo");
  }
}

function showToast(message, kind = "info", action = null) {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  toast.setAttribute("role", "status");

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  toast.appendChild(text);

  let dismissTimer;
  const dismiss = () => {
    clearTimeout(dismissTimer);
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 350);
  };

  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      dismiss();
      action.onClick();
    });
    toast.appendChild(btn);
  }

  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  dismissTimer = setTimeout(dismiss, action ? 6000 : 4200);
}
