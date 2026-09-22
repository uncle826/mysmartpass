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

const TOAST_ICONS = {
  info: '<svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" fill="currentColor"/></svg>',
  success: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

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

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.innerHTML = TOAST_ICONS[kind] || TOAST_ICONS.info;
  toast.appendChild(icon);

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  toast.appendChild(text);

  let dismissTimer;
  const dismiss = () => {
    clearTimeout(dismissTimer);
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 380);
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
