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
      { name: "100's Restroom", room: "undefined" },
      { name: "200's Restroom", room: "undefined" },
      { name: "300's Restroom", room: "undefined" },
      { name: "Office Restroom", room: "undefined" },
    ],
  },
  {
    key: "waterFountain",
    label: "Water Fountain",
    color: "#1c3f6e",
    icon: "svg:waterFountain",
    rooms: [],
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
      { name: "Chotkowski", room: "undefined" },
      { name: "Granger", room: "undefined" },
      { name: "Mango", room: "undefined" },
      { name: "Peruski", room: "undefined" },
      { name: "Zonneveld", room: "undefined" },
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
      { name: "Levick", room: "undefined" },
      { name: "McIntyre", room: "undefined" },
      { name: "Roberts", room: "undefined" },
      { name: "Shefferly", room: "undefined" },
      { name: "Sorvari", room: "undefined" },
      { name: "Summers", room: "undefined" },
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
  waterFountain: '<svg viewBox="0 0 24 24"><path d="M4 14.5h16v1.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5z" fill="#fff"/><rect x="10" y="16.5" width="4" height="5.5" rx="1" fill="#fff"/><path d="M8.7 14.3c0-2 1.4-3.6 3.3-3.6s3.3 1.6 3.3 3.6" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="7.3" r="1.3" fill="#fff"/></svg>',
  status: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function categoryIconMarkup(category) {
  if (category.icon.startsWith("img:")) {
    return `<img src="${category.icon.slice(4)}" alt="">`;
  }
  return TILE_ICONS[category.icon.slice(4)] || "";
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

CATEGORIES.forEach((c) => {
  if (c.rooms) c.rooms.sort(byName);
});

const FLAT_ROOMS = CATEGORIES.flatMap((c) =>
  c.leaf
    ? [{ name: c.leaf.name, room: c.leaf.room, categoryKey: c.key }]
    : c.rooms.map((r) => ({ name: r.name, room: r.room, categoryKey: c.key }))
);

FLAT_ROOMS.sort(byName);
