const CATEGORIES = [
  {
    key: "mainOffice",
    label: "Main Office",
    color: "#14a3a1",
    icon: "svg:mainOffice",
    leaf: { name: "Main Office", room: "Main Office" },
  },
  {
    key: "restrooms",
    label: "Restrooms",
    color: "#2599d6",
    icon: "svg:restrooms",
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
    icon: "svg:media",
    leaf: { name: "Media Center", room: "Media" },
  },
  {
    key: "admins",
    label: "Admins",
    color: "#fb6d4c",
    icon: "svg:office",
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
    icon: "svg:studentServices",
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
    icon: "svg:classroom",
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
    icon: "svg:cafeteria",
    leaf: { name: "Cafeteria", room: "Cafe" },
  },
];

const TILE_ICONS = {
  mainOffice: '<svg viewBox="0 0 24 24"><path d="M4 21V9.3l8-5 8 5V21" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 21v-6h6v6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  locker: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="1.5" fill="none" stroke="#fff" stroke-width="1.7"/><circle cx="14" cy="12" r="1" fill="#fff"/></svg>',
  waterFountain: '<svg viewBox="0 0 24 24"><path d="M4 14.5h16v1.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5z" fill="#fff"/><rect x="10" y="16.5" width="4" height="5.5" rx="1" fill="#fff"/><path d="M8.7 14.3c0-2 1.4-3.6 3.3-3.6s3.3 1.6 3.3 3.6" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="7.3" r="1.3" fill="#fff"/></svg>',
  classroom: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="2" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M9 20h6M12 16v4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
  office: '<svg viewBox="0 0 24 24"><circle cx="9.5" cy="8" r="3.4" fill="#fff"/><circle cx="16.5" cy="9.6" r="2.6" fill="#fff"/><path d="M3 20.5c0-3.7 2.9-6.2 6.5-6.2s6.5 2.5 6.5 6.2" fill="#fff"/><path d="M14.8 20.5c.3-2.9 2-4.7 4.2-4.7s3.9 2.1 4 4.7" fill="#fff"/></svg>',
  status: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  studentServices: '<svg viewBox="0 0 24 24"><path d="M8.6 11.5V6.2a1.5 1.5 0 0 1 3 0v4.6M11.6 10.6V5a1.5 1.5 0 0 1 3 0v5.6M14.6 11.2V7.6a1.5 1.5 0 0 1 3 0v6.9c0 3.6-2.5 6.5-6.3 6.5-2.5 0-4.4-1.1-5.6-3.2l-1.9-3.3c-.5-.9.6-1.9 1.5-1.2l1.7 1.3" fill="#fff"/></svg>',
  cafeteria: '<svg viewBox="0 0 24 24"><path d="M6.5 3v7.5M4.7 3v4.3a1.8 1.8 0 0 0 3.6 0V3M17.3 3c-1.7 0-3.3 1.7-3.3 4.3 0 2 1 3.5 1 3.5v10.2h2.3V3z" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
  media: '<svg viewBox="0 0 24 24"><rect x="4.5" y="8" width="3" height="10.5" rx="0.6" fill="#fff"/><rect x="8.5" y="4.5" width="3" height="14" rx="0.6" fill="#fff"/><rect x="12.5" y="9.5" width="3" height="9" rx="0.6" fill="#fff"/><rect x="16.5" y="6" width="3" height="12.5" rx="0.6" fill="#fff"/></svg>',
  restrooms: '<svg viewBox="0 0 24 24"><rect x="5.5" y="6.5" width="9" height="13" rx="4.5" fill="none" stroke="#fff" stroke-width="1.6"/><ellipse cx="10" cy="6.5" rx="4.5" ry="2" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M14.5 10.5c2 0 3.8 1 3.8 2.8s-1.3 2.7-2.8 2.7" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

function categoryIconMarkup(category) {
  if (category.icon.startsWith("img:")) {
    return `<img src="${category.icon.slice(4)}" alt="">`;
  }
  return TILE_ICONS[category.icon.slice(4)] || "";
}

const FLAT_ROOMS = CATEGORIES.flatMap((c) =>
  c.leaf
    ? [{ name: c.leaf.name, room: c.leaf.room, categoryKey: c.key }]
    : c.rooms.map((r) => ({ name: r.name, room: r.room, categoryKey: c.key }))
);
