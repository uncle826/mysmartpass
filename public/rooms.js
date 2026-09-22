const CATEGORIES = [
  {
    key: "mainOffice",
    label: "Main Office",
    color: "#14a3a1",
    icon: "img:https://storage.googleapis.com/sp-img-cdn/icons8-ios/school-house/FFFFFF.png",
    leaf: { name: "Main Office", room: "Main Office" },
  },
  {
    key: "restrooms",
    label: "Restrooms",
    color: "#2599d6",
    icon: "img:https://storage.googleapis.com/sp-img-cdn/icons8-ios/toilet-paper/FFFFFF.png",
    rooms: [
      { name: "100's Restroom", room: "" },
      { name: "200's Restroom", room: "" },
      { name: "300's Restroom", room: "" },
      { name: "Office Restroom", room: "" },
    ],
  },
  {
    key: "waterFountain",
    label: "Water Fountain",
    color: "#1c3f6e",
    icon: "img:https://storage.googleapis.com/sp-img-cdn/icons8-ios/drinking-fountain/FFFFFF.png",
    rooms: [
      { name: "100's Fountain", room: "" },
      { name: "200's Fountain", room: "" },
      { name: "300's Fountain", room: "" },
      { name: "Office Fountain", room: "" },
    ],
  },
  {
    key: "mediaCenter",
    label: "Media Center",
    color: "#e08a1e",
    icon: "img:https://storage.googleapis.com/sp-img-cdn/icons8-ios/book-shelf/FFFFFF.png",
    leaf: { name: "Media Center", room: "Media" },
  },
  {
    key: "admins",
    label: "Admins",
    color: "#fb6d4c",
    icon: "img:https://storage.googleapis.com/sp-img-cdn/icons8-ios/user-group-man-woman/FFFFFF.png",
    rooms: [
      { name: "Chotkowski", room: "" },
      { name: "Granger", room: "" },
      { name: "Mango", room: "" },
      { name: "Peruski", room: "" },
      { name: "Zonneveld", room: "" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    color: "#7ed321",
    icon: "svg:status",
    rooms: [
      { name: "Early Dismissal", room: "ED1" },
      { name: "Late Arrival", room: "LA1" },
    ],
  },
  {
    key: "studentServices",
    label: "Student Services",
    color: "#7b68ee",
    icon: "img:https://storage.googleapis.com/sp-img-cdn/icons8-ios/welfare/FFFFFF.png",
    rooms: [
      { name: "Levick", room: "" },
      { name: "McIntyre", room: "" },
      { name: "Roberts", room: "" },
      { name: "Shefferly", room: "" },
      { name: "Sorvari", room: "" },
      { name: "Summers", room: "" },
    ],
  },
  {
    key: "classrooms",
    label: "Classrooms",
    color: "#18c98f",
    icon: "img:https://storage.googleapis.com/sp-img-cdn/icons8-ios/classroom/FFFFFF.png",
    rooms: [
      { name: "Albert", room: "307" },
      { name: "Appling", room: "205" },
      { name: "Bageris", room: "Gym" },
      { name: "Bonanni", room: "301" },
      { name: "Browne", room: "206" },
      { name: "Durham", room: "304" },
      { name: "Fitzhorn", room: "313" },
      { name: "Fitzpatrick", room: "303" },
      { name: "Fogleman", room: "209" },
      { name: "Fox", room: "103" },
      { name: "Fuhrwerk", room: "310" },
      { name: "Haas", room: "312" },
      { name: "Harmsworth", room: "105" },
      { name: "Hinchman", room: "306" },
      { name: "Irvin", room: "106" },
      { name: "Kalis", room: "112" },
      { name: "Kehoe", room: "305" },
      { name: "Lab", room: "205" },
      { name: "LaRowe", room: "305" },
      { name: "LaRowe Gym", room: "Gym" },
      { name: "Lewis", room: "113" },
      { name: "Liggett", room: "315" },
      { name: "Lippitt", room: "316" },
      { name: "Marzec", room: "107" },
      { name: "McGowen Gym", room: "Gym" },
      { name: "Miller", room: "204" },
      { name: "Morgner", room: "201" },
      { name: "Muransky", room: "314" },
      { name: "Pieczarka", room: "307" },
      { name: "Prisciandaro", room: "212" },
      { name: "Probst", room: "101" },
      { name: "Putnam", room: "104" },
      { name: "Schlaifer", room: "303" },
      { name: "Smith, C", room: "203" },
      { name: "Smith, T", room: "102" },
      { name: "Snow", room: "302" },
      { name: "Tapley", room: "108" },
      { name: "Topper", room: "211" },
      { name: "Turner, Chris", room: "207" },
      { name: "Turner, Collen", room: "300" },
      { name: "Vivio", room: "300" },
      { name: "Wager", room: "306" },
      { name: "Waldroop", room: "311" },
      { name: "Welch", room: "202" },
      { name: "Whelan", room: "205" },
    ],
  },
  {
    key: "locker",
    label: "Locker",
    color: "#98a2b3",
    icon: "svg:locker",
    leaf: { name: "Locker", room: "" },
  },
  {
    key: "cafeteria",
    label: "Cafeteria",
    color: "#b21cc4",
    icon: "img:https://storage.googleapis.com/sp-img-cdn/icons8-ios/restaurant/FFFFFF.png",
    leaf: { name: "Cafeteria", room: "Cafe" },
  },
];

const TILE_ICONS = {
  locker: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="1.5" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="14" cy="12" r="1" fill="#fff"/></svg>',
  status: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  custom: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.4" fill="#fff"/></svg>',
};

// used when a pass's category isn't one of the normal picker categories —
// currently only a teacher's typed-in custom destination
const CUSTOM_CATEGORY = { key: "custom", label: "Custom", color: "#6b7484", icon: "svg:custom" };

function categoryIconMarkup(category) {
  if (category.icon.startsWith("img:")) {
    return `<img src="${category.icon.slice(4)}" alt="">`;
  }
  return TILE_ICONS[category.icon.slice(4)] || "";
}

function categoryByKey(key) {
  return CATEGORIES.find((c) => c.key === key) || CUSTOM_CATEGORY;
}

// a room can carry its own logo (a category's icon reused, or a fully custom image) —
// falls back to the category's default icon when it doesn't
function roomIconMarkup(name, categoryKey) {
  const room = FLAT_ROOMS.find((r) => r.categoryKey === categoryKey && r.name === name);
  if (room && room.logo) {
    if (room.logo.startsWith("preset:")) {
      const preset = CATEGORIES.find((c) => c.key === room.logo.slice(7));
      if (preset) return categoryIconMarkup(preset);
    } else {
      return `<img src="${room.logo}" alt="">`;
    }
  }
  return categoryIconMarkup(categoryByKey(categoryKey));
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

CATEGORIES.forEach((c) => {
  if (c.rooms) c.rooms.sort(byName);
});

function rebuildFlatRooms() {
  FLAT_ROOMS = CATEGORIES.flatMap((c) =>
    c.leaf
      ? [{ name: c.leaf.name, room: c.leaf.room, categoryKey: c.key }]
      : c.rooms.map((r) => ({ name: r.name, room: r.room, categoryKey: c.key, logo: r.logo || null }))
  );
  FLAT_ROOMS.sort(byName);
}

// merges classes a teacher has added on top of the built-in Classrooms list —
// called once after fetching them from the server
function applyCustomClasses(list) {
  const category = CATEGORIES.find((c) => c.key === "classrooms");
  if (!category || !Array.isArray(list) || list.length === 0) return;
  const existingNames = new Set(category.rooms.map((r) => r.name));
  list.forEach((cls) => {
    if (!cls || !cls.name || existingNames.has(cls.name)) return;
    category.rooms.push({ name: cls.name, room: cls.room || "", logo: cls.logo || null });
    existingNames.add(cls.name);
  });
  category.rooms.sort(byName);
  rebuildFlatRooms();
}

let FLAT_ROOMS = [];
rebuildFlatRooms();
