/* Digital ID card: the card itself and its Code 39 barcode. Shared by the student's "ID Card" screen and the
   teacher's ID Cards settings preview. */

// Code 39 draws each character as 9 elements (bars and spaces, starting with a bar); "w" is wide, "n" is narrow.
// Only digits (plus the * start/stop mark) are needed for ID numbers.
const CODE39 = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  "*": "nwnnwnwnn",
};

function barcodeSvg(text, height = 46) {
  const NARROW = 2;
  const WIDE = 5;
  const chars = `*${String(text).replace(/[^0-9]/g, "")}*`.split("");
  let x = 0;
  let bars = "";
  chars.forEach((ch, ci) => {
    const pattern = CODE39[ch];
    if (!pattern) return;
    pattern.split("").forEach((w, i) => {
      const width = w === "w" ? WIDE : NARROW;
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${width}" height="${height}"/>`; // even positions are bars
      x += width;
    });
    if (ci < chars.length - 1) x += NARROW; // gap between characters
  });
  return `<svg class="idc-barcode" viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" aria-hidden="true" fill="#111827">${bars}</svg>`;
}

function idEscape(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// "#rrggbb" darkened a little, for the card's gradient
function idShade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v));
  return `#${(0x1000000 + c((n >> 16) + amount) * 0x10000 + c(((n >> 8) & 255) + amount) * 0x100 + c((n & 255) + amount)).toString(16).slice(1)}`;
}

// student: { name, photo, avatarColor, studentId, grade }; settings: { color, school, backText, barcode }
function idCardMarkup(student, settings) {
  const color = /^#[0-9a-f]{6}$/i.test(settings.color || "") ? settings.color : "#00b476";
  const initial = idEscape((student.name || "?").charAt(0).toUpperCase());
  const photo = student.photo
    ? `<span class="idc-photo" style="background-image:url('${student.photo}')"></span>`
    : `<span class="idc-photo" style="background:${student.avatarColor || "#d3d7de"}">${initial}</span>`;
  const idNumber = idEscape(student.studentId || "—");
  const grade = student.grade ? `<span class="idc-grade">Grade ${idEscape(student.grade)}</span>` : "";
  const code =
    settings.barcode === "number"
      ? `<div class="idc-bignum">${idNumber}</div>`
      : `${student.studentId ? barcodeSvg(student.studentId) : ""}<div class="idc-num">${idNumber}</div>`;

  return `
    <div class="idc-card" style="--idc:${color};--idc-dark:${idShade(color, -38)}">
      <div class="idc-flip">
        <div class="idc-face idc-front">
          <div class="idc-top"><span class="idc-school">${idEscape(settings.school || "Your School")}</span><span class="idc-kind">STUDENT ID</span></div>
          <div class="idc-body">
            ${photo}
            <div class="idc-who"><b>${idEscape(student.name || "")}</b>${grade}</div>
          </div>
          <div class="idc-code">${code}</div>
          <div class="idc-live" aria-hidden="true"><i></i></div>
        </div>
        <div class="idc-face idc-back">
          <div class="idc-top"><span class="idc-school">${idEscape(settings.school || "Your School")}</span><span class="idc-kind">IMPORTANT INFO</span></div>
          <p class="idc-backtext">${settings.backText ? idEscape(settings.backText) : "If found, please return this card to the main office."}</p>
          <div class="idc-live" aria-hidden="true"><i></i></div>
        </div>
      </div>
    </div>`;
}

/* ---------- printing ---------- */

// the front of an ID card for paper: name and barcode (and the grade and school), credit-card sized
function idPrintMarkup(student, settings) {
  const color = /^#[0-9a-f]{6}$/i.test(settings.color || "") ? settings.color : "#00b476";
  const grade = student.grade ? `<span class="pc-grade">Grade ${idEscape(student.grade)}</span>` : "";
  const code =
    settings.barcode === "number"
      ? `<div class="pc-bignum">${idEscape(student.studentId || "")}</div>`
      : `${barcodeSvg(student.studentId || "0", 52)}<div class="pc-num">${idEscape(student.studentId || "")}</div>`;
  return `
    <div class="pc" style="--pc:${color}">
      <div class="pc-top"><span class="pc-school">${idEscape(settings.school || "Student ID")}</span><span class="pc-kind">STUDENT ID</span></div>
      <div class="pc-body">
        <div class="pc-name">${idEscape(student.name || "")}</div>
        ${grade}
      </div>
      <div class="pc-code">${code}</div>
    </div>`;
}

// Puts the cards on a hidden sheet, opens the browser's print dialog, and cleans up afterwards.
// Pass { print: false } to only build the sheet (used by tests).
function printIdCards(students, settings, options = {}) {
  const old = document.getElementById("print-sheet");
  if (old) old.remove();
  const sheet = document.createElement("div");
  sheet.id = "print-sheet";
  sheet.innerHTML = students.map((s) => idPrintMarkup(s, settings)).join("");
  document.body.appendChild(sheet);
  if (options.print === false) return sheet;

  document.body.classList.add("printing");
  const cleanup = () => {
    sheet.remove();
    document.body.classList.remove("printing");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(() => window.print(), 60);
  return sheet;
}
