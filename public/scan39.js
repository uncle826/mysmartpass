/* Reads the Code 39 barcode on a digital ID card with the device's camera.
   Shared by the "Sign in with ID" screen and the kiosk. No outside libraries: the decoder below works on rows of
   pixel brightness, so it runs in any browser that can show the camera. (If the browser has its own
   BarcodeDetector, that's tried too.) */

// the 9 bar/space widths of each digit, as narrow (n) or wide (w), plus the * that starts and ends every code
const CODE39_PATTERNS = {
  nnnwwnwnn: "0", wnnwnnnnw: "1", nnwwnnnnw: "2", wnwwnnnnn: "3", nnnwwnnnw: "4",
  wnnwwnnnn: "5", nnwwwnnnn: "6", nnnwnnwnw: "7", wnnwnnwnn: "8", nnwwnnwnn: "9",
  nwnnwnwnn: "*",
};

// Turns 9 run lengths (bar, space, bar, ...) into "n"/"w" letters, or null when they don't look like Code 39:
// exactly 3 of the 9 must be clearly wider than the other 6.
function code39Widths(runs) {
  const order = runs.map((len, i) => [len, i]).sort((a, b) => b[0] - a[0]);
  const wide = order.slice(0, 3);
  const narrow = order.slice(3);
  const narrowMax = narrow[0][0];
  const wideMin = wide[2][0];
  if (wideMin < narrowMax * 1.35) return null;
  const isWide = new Set(wide.map((w) => w[1]));
  return runs.map((_, i) => (isWide.has(i) ? "w" : "n")).join("");
}

// Reads one row of brightness values (0 = black, 255 = white). Returns the digits it found, or null.
function decodeCode39Row(row) {
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] < lo) lo = row[i];
    if (row[i] > hi) hi = row[i];
  }
  if (hi - lo < 40) return null; // flat row: nothing to read
  const threshold = (lo + hi) / 2;

  // run-length encode: lengths of alternating dark and light stretches
  const runs = [];
  let dark = row[0] < threshold;
  const firstDark = dark;
  let len = 0;
  for (let i = 0; i < row.length; i++) {
    const isDark = row[i] < threshold;
    if (isDark === dark) len++;
    else {
      runs.push(len);
      dark = isDark;
      len = 1;
    }
  }
  runs.push(len);

  // runs[k] is a bar when (k even) matches the first run being dark
  const isBar = (k) => (k % 2 === 0) === firstDark;

  for (let start = 0; start + 9 * 11 <= runs.length + 10; start++) {
    if (!isBar(start)) continue;
    let k = start;
    let text = "";
    let ok = true;
    while (k + 9 <= runs.length) {
      const widths = code39Widths(runs.slice(k, k + 9));
      const ch = widths && CODE39_PATTERNS[widths];
      if (!ch) {
        ok = false;
        break;
      }
      text += ch;
      k += 9;
      if (text.length > 1 && ch === "*") break; // reached the stop mark
      k += 1; // the narrow gap between characters
      if (text.length > 14) {
        ok = false;
        break;
      }
    }
    if (ok && text.length >= 5 && text[0] === "*" && text[text.length - 1] === "*") {
      const digits = text.slice(1, -1);
      if (/^\d{3,12}$/.test(digits)) return digits;
    }
  }
  return null;
}

// Tries a row both ways round, so an upside-down card still reads.
function decodeCode39(row) {
  return decodeCode39Row(row) || decodeCode39Row(Array.prototype.slice.call(row).reverse());
}

// Reads a whole camera frame by trying many horizontal lines across it. Returns the digits, or null.
function scanFrameForCode39(imageData) {
  const { data, width, height } = imageData;
  const gray = (x, y) => {
    const i = (y * width + x) * 4;
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  };
  const votes = new Map();
  for (let step = 0; step < 17; step++) {
    const y = Math.round(height * (0.2 + (0.6 * step) / 16));
    const row = new Array(width);
    for (let x = 0; x < width; x++) {
      // average three neighbouring lines to smooth out camera noise
      row[x] = (gray(x, Math.max(0, y - 1)) + gray(x, y) + gray(x, Math.min(height - 1, y + 1))) / 3;
    }
    const code = decodeCode39(row);
    if (code) votes.set(code, (votes.get(code) || 0) + 1);
  }
  let best = null;
  votes.forEach((count, code) => {
    if (count >= 2 && (!best || count > votes.get(best))) best = code; // a code has to show up on 2+ lines
  });
  return best;
}

/* The live scanner. startBarcodeScanner(videoEl, onCode) opens the camera into the video element and calls
   onCode(digits) when a card is read. It returns { stop() }, and throws if the camera can't be opened. */
async function startBarcodeScanner(video, onCode) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("This browser can't use the camera here. Try a different browser, or type your ID number.");
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
    throw new Error(denied ? "Camera access was blocked. Allow the camera for this site, or type your ID number." : "Couldn't open a camera on this device.");
  }
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  await video.play().catch(() => {});

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const native = typeof BarcodeDetector !== "undefined" ? new BarcodeDetector({ formats: ["code_39"] }) : null;
  let running = true;
  let busy = false;
  let lastCode = null;
  let lastAt = 0;

  const found = (code) => {
    // the same card has to be seen twice in a row, so a smudge can't sign the wrong student in
    const now = Date.now();
    if (code === lastCode && now - lastAt < 1500) {
      running = false;
      onCode(code);
      return;
    }
    lastCode = code;
    lastAt = now;
  };

  const tick = async () => {
    if (!running || busy || video.readyState < 2 || !video.videoWidth) return;
    busy = true;
    try {
      const scale = Math.min(1, 960 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      let code = null;
      if (native) {
        try {
          const hits = await native.detect(canvas);
          const raw = hits[0] && String(hits[0].rawValue || "").replace(/\D/g, "");
          if (raw && raw.length >= 3 && raw.length <= 12) code = raw;
        } catch {
          /* fall back to the built-in reader below */
        }
      }
      if (!code) code = scanFrameForCode39(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (code && running) found(code);
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(tick, 130);
  return {
    stop() {
      running = false;
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
