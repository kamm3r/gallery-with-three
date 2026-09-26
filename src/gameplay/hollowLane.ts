// Hollow Lane: the Halloween neighbourhood's layout, shared by the renderer,
// the colliders and the killer's navigation grid so all three agree.
//
// World axes: +x east, +z south. The player arrives at the south end of the
// lane; the crooked Monster House looms over the cul-de-sac at the north end,
// and Elm Street crosses the lane just south of the middle.

export const LANE_HALF = 110;
export const LANE_START: [number, number, number] = [0, 0, 92];
export const LANE_PORTAL: [number, number, number] = [0, 2.6, 100];

export interface Rect {
  x: number;
  z: number;
  /** Half extents. */
  hx: number;
  hz: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Point {
  x: number;
  z: number;
}

/** Streets as asphalt rectangles (sidewalks are drawn around them). */
export const STREETS: Rect[] = [
  { x: 0, z: 15, hx: 6, hz: 85 }, // Hollow Lane, south gate to the cul-de-sac
  { x: 0, z: 10, hx: 110, hz: 5 }, // Elm Street
];
export const CUL_DE_SAC: Circle = { x: 0, z: -74, r: 16 };

export type HouseStyle = 0 | 1 | 2 | 3;

export interface House {
  x: number;
  z: number;
  /** Direction the front door faces (radians, 0 = +z). */
  yaw: number;
  style: HouseStyle;
  /** Half width along the street and half depth. */
  hw: number;
  hd: number;
}

export const HOUSE_HW = 8,
  HOUSE_HD = 6.5;

function house(x: number, z: number, facing: "e" | "w" | "n" | "s", style: HouseStyle): House {
  const yaw = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }[facing];
  return { x, z, yaw, style, hw: HOUSE_HW, hd: HOUSE_HD };
}

export const HOUSES: House[] = [
  house(-26, 72, "e", 0),
  house(-26, 46, "e", 1),
  house(-26, -26, "e", 2),
  house(-26, -52, "e", 3),
  house(26, 72, "w", 1),
  house(26, 46, "w", 3),
  house(26, -26, "w", 0),
  house(26, -52, "w", 2),
  house(-60, -18, "s", 3),
  house(-92, -18, "s", 0),
  house(60, -18, "s", 1),
  house(92, -18, "s", 2),
  house(-60, 38, "n", 2),
  house(-92, 38, "n", 1),
  house(60, 38, "n", 0),
  house(92, 38, "n", 3),
];

/** The Monster House: bigger, crooked, and very much awake. */
export const MONSTER_HOUSE: House = { x: 0, z: -101, yaw: 0, style: 0, hw: 10, hd: 8 };

/** Rotate a house-local offset (x right, z toward the front) into the world. */
export function houseToWorld(h: House, lx: number, lz: number): Point {
  const c = Math.cos(h.yaw),
    s = Math.sin(h.yaw);
  return { x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c };
}

/** Axis-aligned footprint (body plus porch) in world space. */
export function houseFootprint(h: House, porch = 2.8): Rect {
  const front = houseToWorld(h, 0, porch / 2);
  const sideways = Math.abs(Math.sin(h.yaw)) > 0.5;
  const hw = h.hw,
    hd = h.hd + porch / 2;
  return { x: front.x, z: front.z, hx: sideways ? hd : hw, hz: sideways ? hw : hd };
}

export const GRAVEYARD: Rect = { x: -62, z: 82, hx: 13, hz: 10 };
/** Half-width of the gap in the graveyard's east fence. */
export const GRAVEYARD_GATE = 2.5;
export const PARK: Point = { x: 62, z: 82 };
export const ESCAPE_CAR = { x: 9, z: -72, yaw: -0.4 };
export const PAYPHONE = { x: -10, z: 1 };
/** Where the police pull up once called. */
export const POLICE_STOP = { x: 0, z: 86 };
export const KILLER_START: Point = { x: 0, z: -88 };

// --- Inside the houses ---------------------------------------------------------
// Every bungalow shares one floor plan, in house-local coordinates (x right,
// z toward the front door): a wide living room across the front, then a
// kitchen (back left, with the back door), a study, and a bedroom with a
// walk-in wardrobe. Walls are 0.2 m thick, generated from wall lines with
// openings: doors, open doorways and windows. Windows let the moonlight in
// (and let him see you); their sills stop you climbing through.

export const FLOOR_Y = 0.6;
export const CEILING_Y = 4.6;
export const DOOR_HEIGHT = 2.3;
export const SILL = 1;
export const WINDOW_HEAD = 2.3;
const THICK = 0.1;

export type FurnitureKind =
  | "counter"
  | "fridge"
  | "table"
  | "bed"
  | "dresser"
  | "wardrobe"
  | "sofa"
  | "tv"
  | "shelf"
  | "chair"
  | "desk"
  | "cabinet"
  | "nightstand";

export interface LocalRect extends Rect {
  /** Furniture kind, for the renderer. */
  kind?: FurnitureKind;
}

type Side = "+x" | "-x" | "+z" | "-z";

interface Opening {
  a: number;
  b: number;
  kind: "door" | "doorway" | "window";
}

interface WallLine {
  /** Axis the wall runs along. */
  along: "x" | "z";
  /** Its fixed coordinate on the other axis. */
  at: number;
  from: number;
  to: number;
  openings: Opening[];
  /** Exterior face, for outer walls. */
  outside?: Side;
}

export interface WallPiece extends LocalRect {
  /** Vertical extent. */
  y0: number;
  y1: number;
  outside?: Side;
  /** Part of a window: the sill (blocks walking, not sight) or the head. */
  window?: "sill" | "head";
}

export interface WindowPane extends Point {
  along: "x" | "z";
  width: number;
  outside: Side;
}

const HW = HOUSE_HW,
  HD = HOUSE_HD;
const LINES: WallLine[] = [
  {
    along: "x",
    at: HD,
    from: -HW - THICK,
    to: HW + THICK,
    outside: "+z",
    openings: [
      { a: -5.5, b: -3.5, kind: "window" },
      { a: -0.8, b: 0.4, kind: "door" },
      { a: 3.5, b: 5.5, kind: "window" },
    ],
  },
  {
    along: "x",
    at: -HD,
    from: -HW - THICK,
    to: HW + THICK,
    outside: "-z",
    openings: [
      { a: -5.6, b: -4.4, kind: "door" },
      { a: -0.9, b: 0.9, kind: "window" },
      { a: 4.2, b: 6.2, kind: "window" },
    ],
  },
  ...([-1, 1] as const).map((side): WallLine => ({
    along: "z",
    at: side * HW,
    from: -HD,
    to: HD,
    outside: side < 0 ? "-x" : "+x",
    openings: [
      { a: -4.2, b: -2.2, kind: "window" },
      { a: 2.2, b: 4.2, kind: "window" },
    ],
  })),
  {
    along: "x",
    at: 0,
    from: -HW + THICK,
    to: HW - THICK,
    openings: [
      { a: -5.3, b: -3.9, kind: "doorway" },
      { a: -0.7, b: 0.7, kind: "doorway" },
      { a: 3.9, b: 5.3, kind: "doorway" },
    ],
  },
  { along: "z", at: -2, from: -HD + THICK, to: -THICK, openings: [] },
  { along: "z", at: 2, from: -HD + THICK, to: -THICK, openings: [] },
];

function piece(line: WallLine, a: number, b: number, y0: number, y1: number): WallPiece {
  const mid = (a + b) / 2,
    half = (b - a) / 2;
  return line.along === "x"
    ? { x: mid, z: line.at, hx: half, hz: THICK, y0, y1, outside: line.outside }
    : { x: line.at, z: mid, hx: THICK, hz: half, y0, y1, outside: line.outside };
}

/** Every wall slab of the floor plan, with its height range. */
export const PLAN_WALLS: WallPiece[] = LINES.flatMap((line) => {
  const pieces: WallPiece[] = [];
  let cursor = line.from;
  for (const o of [...line.openings].sort((p, q) => p.a - q.a)) {
    if (o.a > cursor) pieces.push(piece(line, cursor, o.a, FLOOR_Y, CEILING_Y));
    if (o.kind === "window") {
      pieces.push({ ...piece(line, o.a, o.b, FLOOR_Y, FLOOR_Y + SILL), window: "sill" });
      pieces.push({ ...piece(line, o.a, o.b, FLOOR_Y + WINDOW_HEAD, CEILING_Y), window: "head" });
    } else pieces.push(piece(line, o.a, o.b, FLOOR_Y + DOOR_HEIGHT, CEILING_Y));
    cursor = o.b;
  }
  if (line.to > cursor) pieces.push(piece(line, cursor, line.to, FLOOR_Y, CEILING_Y));
  return pieces;
});

/** Open doorways between rooms (no door), as floor rects to keep walkable. */
export const PLAN_DOORWAYS: Rect[] = LINES.flatMap((line) =>
  line.openings
    .filter((o) => o.kind === "doorway")
    .map((o) => {
      const mid = (o.a + o.b) / 2,
        half = (o.b - o.a) / 2 - 0.12;
      return line.along === "x"
        ? { x: mid, z: line.at, hx: half, hz: 0.45 }
        : { x: line.at, z: mid, hx: 0.45, hz: half };
    }),
);

export const PLAN_WINDOWS: WindowPane[] = LINES.flatMap((line) =>
  line.openings
    .filter((o) => o.kind === "window")
    .map((o) => {
      const mid = (o.a + o.b) / 2;
      const at = line.along === "x" ? { x: mid, z: line.at } : { x: line.at, z: mid };
      return { ...at, along: line.along, width: o.b - o.a, outside: line.outside! };
    }),
);

export const PLAN_FURNITURE: LocalRect[] = [
  { kind: "counter", x: -6.85, z: -6.1, hx: 1.05, hz: 0.3 },
  { kind: "counter", x: -7.6, z: -3.8, hx: 0.3, hz: 2 },
  { kind: "fridge", x: -2.45, z: -0.55, hx: 0.35, hz: 0.35 },
  { kind: "table", x: -4.6, z: -3.4, hx: 0.6, hz: 0.5 },
  { kind: "desk", x: 0, z: -5.95, hx: 0.9, hz: 0.35 },
  { kind: "cabinet", x: 1.55, z: -3, hx: 0.3, hz: 0.35 },
  { kind: "bed", x: 4.8, z: -3.8, hx: 0.9, hz: 1.2 },
  { kind: "nightstand", x: 3.3, z: -5.95, hx: 0.3, hz: 0.3 },
  { kind: "dresser", x: 7.6, z: -1.2, hx: 0.3, hz: 0.6 },
  // Wardrobe: only its side panel blocks; the inside is for hiding in.
  { kind: "wardrobe", x: 6.25, z: -5.9, hx: 0.05, hz: 0.5 },
  { kind: "sofa", x: -2.3, z: 3.2, hx: 1.4, hz: 0.45 },
  { kind: "tv", x: -2.3, z: 0.35, hx: 0.8, hz: 0.2 },
  { kind: "shelf", x: 7.65, z: 0.9, hx: 0.25, hz: 0.8 },
  { kind: "chair", x: 4.5, z: 4.2, hx: 0.45, hz: 0.45 },
];

export interface LocalDoor {
  x: number;
  z: number;
  width: number;
}
export const PLAN_DOORS: LocalDoor[] = [
  { x: -0.2, z: HD, width: 1.2 },
  { x: -5, z: -HD, width: 1.2 },
];

/** Every container worth searching in a house; each night only a few are. */
/** Every container worth searching in a house; each night only a few are.
 * Each spot is where you stand, a step in front of the furniture. */
export const PLAN_SEARCH = [
  { x: -6.85, z: -5.2, label: "kitchen drawers" },
  { x: -6.6, z: -3.8, label: "kitchen cupboard" },
  { x: -2.9, z: -1.8, label: "fridge" },
  { x: -2.3, z: 1.3, label: "TV cabinet" },
  { x: 6.7, z: 0.9, label: "bookshelf" },
  { x: 0, z: -4.9, label: "desk" },
  { x: 0.35, z: -3, label: "filing cabinet" },
  { x: 6.7, z: -1.2, label: "dresser" },
  { x: 3.1, z: -4.9, label: "nightstand" },
];
export const PLAN_WARDROBE = { x: 7.1, z: -5.9 };

function sideways(h: House) {
  return Math.abs(Math.sin(h.yaw)) > 0.5;
}

/** A house-local rectangle in world space (houses only face the four axes). */
export function rectToWorld(h: House, r: Rect): Rect {
  const c = houseToWorld(h, r.x, r.z);
  return sideways(h)
    ? { x: c.x, z: c.z, hx: r.hz, hz: r.hx }
    : { x: c.x, z: c.z, hx: r.hx, hz: r.hz };
}

export interface Door extends Point {
  house: number;
  /** Whether the door spans along world x (else along z). */
  alongX: boolean;
  width: number;
  /** Yaw of the house, for the renderer. */
  yaw: number;
  /** Back door (needs a step up from the yard). */
  back: boolean;
}

export const DOORS: Door[] = HOUSES.flatMap((h, house) =>
  PLAN_DOORS.map((d, i) => ({
    ...houseToWorld(h, d.x, d.z),
    house,
    alongX: !sideways(h),
    width: d.width,
    yaw: h.yaw,
    back: i === 1,
  })),
);

/** The house whose walls contain this point, or -1. */
export function insideHouse(p: Point) {
  return HOUSES.findIndex((h) => {
    const r = rectToWorld(h, { x: 0, z: 0, hx: h.hw, hz: h.hd });
    return Math.abs(p.x - r.x) < r.hx && Math.abs(p.z - r.z) < r.hz;
  });
}

export interface SearchSpot extends Point {
  label: string;
  /** House index, or -1 outdoors. */
  house: number;
}

/** Garbage cans beside these houses count as outdoor search spots. */
export const BIN_HOUSES = [0, 5, 10, 13];

/** Every place worth rummaging through. Each night only some are live. */
export const SEARCH_SPOTS: SearchSpot[] = [
  ...HOUSES.flatMap((h, house) =>
    PLAN_SEARCH.map((spot) => ({ ...houseToWorld(h, spot.x, spot.z), label: spot.label, house })),
  ),
  ...BIN_HOUSES.map((house) => ({
    ...houseToWorld(HOUSES[house], -HOUSES[house].hw - 1.2, HOUSES[house].hd - 0.5),
    label: "garbage cans",
    house: -1,
  })),
  { x: GRAVEYARD.x + 6, z: GRAVEYARD.z + 4, label: "groundskeeper's toolbox", house: -1 },
  { x: PARK.x - 4, z: PARK.z + 2, label: "park shed crate", house: -1 },
];

export interface HideSpot extends Circle {
  kind: "wardrobe" | "hedge";
}

/** A wardrobe in every bedroom, hedges either side of every house, a few in the park. */
export const HIDE_SPOTS: HideSpot[] = [
  ...HOUSES.map((h) => ({
    ...houseToWorld(h, PLAN_WARDROBE.x, PLAN_WARDROBE.z),
    r: 0.55,
    kind: "wardrobe" as const,
  })),
  ...HOUSES.flatMap((h) =>
    [houseToWorld(h, h.hw + 2.4, h.hd - 1), houseToWorld(h, -h.hw - 2.4, -h.hd + 1)].map((p) => ({
      ...p,
      r: 1.3,
      kind: "hedge" as const,
    })),
  ),
  { x: PARK.x + 7, z: PARK.z - 7, r: 1.4, kind: "hedge" },
  { x: PARK.x - 9, z: PARK.z + 8, r: 1.4, kind: "hedge" },
  { x: GRAVEYARD.x - 7, z: GRAVEYARD.z - 14, r: 1.3, kind: "hedge" },
];

/** Radius of a streetlamp's pool of light. */
export const LAMP_GLOW = 7;
export const STREET_LAMPS: Point[] = [
  { x: -8, z: 86 },
  { x: 8, z: 62 },
  { x: -8, z: 36 },
  { x: 8, z: -2 },
  { x: -8, z: -26 },
  { x: 8, z: -50 },
  { x: -8, z: -64 },
  { x: -30, z: 18 },
  { x: 30, z: 2 },
  { x: -60, z: 2 },
  { x: 60, z: 18 },
  { x: -92, z: 18 },
  { x: 92, z: 2 },
];

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function inRect(p: Point, r: Rect, pad = 0) {
  return Math.abs(p.x - r.x) < r.hx + pad && Math.abs(p.z - r.z) < r.hz + pad;
}

/** Keep yard trees off streets, houses, hedges and the landmarks. */
function treeBlocked(p: Point) {
  if (STREETS.some((s) => inRect(p, s, 5))) return true;
  if (Math.hypot(p.x - CUL_DE_SAC.x, p.z - CUL_DE_SAC.z) < CUL_DE_SAC.r + 5) return true;
  if (HOUSES.some((h) => inRect(p, houseFootprint(h), 4))) return true;
  if (inRect(p, houseFootprint(MONSTER_HOUSE), 4)) return true;
  if (inRect(p, GRAVEYARD, 3)) return true;
  if (Math.hypot(p.x - PARK.x, p.z - PARK.z) < 14) return true;
  if ([...SEARCH_SPOTS, ...HIDE_SPOTS].some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 4))
    return true;
  return Math.hypot(p.x - LANE_START[0], p.z - LANE_START[2]) < 12;
}

export interface Tree extends Point {
  scale: number;
  rotation: number;
  kind: "dead" | "autumn" | "pine" | "willow";
}

export const TREES: { inside: Tree[]; outside: Tree[] } = (() => {
  const random = seeded(41);
  const kinds: Tree["kind"][] = ["dead", "autumn", "pine", "willow"];
  const inside: Tree[] = [];
  for (let tries = 0; inside.length < 140 && tries < 8000; tries++) {
    const p = { x: (random() * 2 - 1) * 105, z: (random() * 2 - 1) * 105 };
    if (treeBlocked(p) || inside.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 6)) continue;
    // Denser, darker woods in the two northern corners.
    const woods = p.z < -45 && Math.abs(p.x) > 40;
    inside.push({
      ...p,
      scale: 8 + random() * 6,
      rotation: random() * 6.28,
      kind: woods ? (random() < 0.5 ? "pine" : "dead") : kinds[Math.floor(random() * 4)],
    });
  }
  const outside: Tree[] = Array.from({ length: 200 }, (_, i) => {
    // A wall of woods around the neighbourhood's square edge.
    const side = i % 4,
      along = (random() * 2 - 1) * 128,
      depth = 114 + random() * 16;
    const [x, z] = [
      [along, -depth],
      [along, depth],
      [-depth, along],
      [depth, along],
    ][side];
    return {
      x,
      z,
      scale: 11 + random() * 8,
      rotation: random() * 6.28,
      kind: random() < 0.45 ? "pine" : random() < 0.5 ? "dead" : "autumn",
    };
  });
  return { inside, outside };
})();

// --- Navigation grid --------------------------------------------------------

export const CELL = 0.5;
export const GRID = Math.round((LANE_HALF * 2 + 2) / CELL);
const ORIGIN = -(LANE_HALF + 1);
/** Walls stop movement and sight; hedges only stop sight; window sills only
 * stop movement; doors stop both while closed but can be opened (or broken). */
export const FREE = 0,
  WALL = 1,
  HEDGE = 2,
  DOOR = 3,
  WINDOW = 4;
const solid = (cell: number) => cell === WALL || cell === WINDOW;
/** Clearance kept around walls for the killer's body. */
const BODY = 0.25;

export interface NavGrid {
  size: number;
  cells: Uint8Array;
  /** Door index per cell, or -1. */
  doors: Int16Array;
}

/** Whether door `i` currently blocks sight (movement handles doors itself). */
export type DoorsClosed = (door: number) => boolean;
const allOpen: DoorsClosed = () => false;

export function cellOf(x: number, z: number): [number, number] {
  return [Math.floor((x - ORIGIN) / CELL), Math.floor((z - ORIGIN) / CELL)];
}

function centerOf(i: number, j: number): Point {
  return { x: ORIGIN + (i + 0.5) * CELL, z: ORIGIN + (j + 0.5) * CELL };
}

/** Solid obstacles in world space (colliders mirror the same shapes). */
export function obstacleRects(): Rect[] {
  // Wall slabs that reach the floor (not window heads or door lintels).
  const floorWalls = PLAN_WALLS.filter((w) => w.y0 <= FLOOR_Y && !w.window);
  const houses = HOUSES.flatMap((h) =>
    [...floorWalls, ...PLAN_FURNITURE].map((r) => rectToWorld(h, r)),
  );
  return [
    ...houses,
    houseFootprint(MONSTER_HOUSE, 0),
    { x: ESCAPE_CAR.x, z: ESCAPE_CAR.z, hx: 1.4, hz: 1.4 },
    { x: PAYPHONE.x, z: PAYPHONE.z, hx: 0.4, hz: 0.4 },
    // Graveyard walls, with a gate gap on the east side.
    { x: GRAVEYARD.x, z: GRAVEYARD.z - GRAVEYARD.hz, hx: GRAVEYARD.hx, hz: 0.2 },
    { x: GRAVEYARD.x, z: GRAVEYARD.z + GRAVEYARD.hz, hx: GRAVEYARD.hx, hz: 0.2 },
    { x: GRAVEYARD.x - GRAVEYARD.hx, z: GRAVEYARD.z, hx: 0.2, hz: GRAVEYARD.hz },
    ...[-1, 1].map((side) => ({
      x: GRAVEYARD.x + GRAVEYARD.hx,
      z: GRAVEYARD.z + (side * (GRAVEYARD.hz + GRAVEYARD_GATE)) / 2,
      hx: 0.2,
      hz: (GRAVEYARD.hz - GRAVEYARD_GATE) / 2,
    })),
  ];
}

export function buildNavGrid(): NavGrid {
  const cells = new Uint8Array(GRID * GRID);
  const doors = new Int16Array(GRID * GRID).fill(-1);
  const each = (r: Rect, pad: number, visit: (index: number) => void) => {
    const [i0, j0] = cellOf(r.x - r.hx - pad, r.z - r.hz - pad);
    const [i1, j1] = cellOf(r.x + r.hx + pad, r.z + r.hz + pad);
    for (let i = Math.max(0, i0); i <= Math.min(GRID - 1, i1); i++)
      for (let j = Math.max(0, j0); j <= Math.min(GRID - 1, j1); j++) visit(j * GRID + i);
  };
  for (const hedge of HIDE_SPOTS)
    if (hedge.kind === "hedge")
      each({ x: hedge.x, z: hedge.z, hx: hedge.r * 0.7, hz: hedge.r * 0.7 }, 0, (c) => {
        cells[c] = HEDGE;
      });
  for (const h of HOUSES)
    for (const sill of PLAN_WALLS.filter((w) => w.window === "sill"))
      each(rectToWorld(h, sill), BODY, (c) => {
        cells[c] = WINDOW;
      });
  for (const rect of obstacleRects())
    each(rect, BODY, (c) => {
      cells[c] = WALL;
    });
  for (const tree of TREES.inside)
    each({ x: tree.x, z: tree.z, hx: 0.35, hz: 0.35 }, BODY, (c) => {
      cells[c] = WALL;
    });
  // Open doorways between rooms: carve them back out of the wall padding.
  for (const h of HOUSES)
    for (const doorway of PLAN_DOORWAYS)
      each(rectToWorld(h, doorway), 0, (c) => {
        cells[c] = FREE;
      });
  // Doorways: the gap in the wall, marked with its door.
  DOORS.forEach((door, index) => {
    const half = door.width / 2 - 0.1;
    const rect = door.alongX
      ? { x: door.x, z: door.z, hx: half, hz: 0.45 }
      : { x: door.x, z: door.z, hx: 0.45, hz: half };
    each(rect, 0, (c) => {
      cells[c] = DOOR;
      doors[c] = index;
    });
  });
  // Everything outside the fence line is impassable.
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const c = centerOf(i, j);
      if (Math.abs(c.x) > LANE_HALF || Math.abs(c.z) > LANE_HALF) cells[j * GRID + i] = WALL;
    }
  return { size: GRID, cells, doors };
}

function cellAt(grid: NavGrid, i: number, j: number) {
  if (i < 0 || j < 0 || i >= grid.size || j >= grid.size) return WALL;
  return grid.cells[j * grid.size + i];
}

export function walkable(grid: NavGrid, x: number, z: number) {
  const [i, j] = cellOf(x, z);
  return !solid(cellAt(grid, i, j));
}

/** The door whose doorway contains this point, or -1. */
export function doorAt(grid: NavGrid, x: number, z: number) {
  const [i, j] = cellOf(x, z);
  if (i < 0 || j < 0 || i >= grid.size || j >= grid.size) return -1;
  return grid.doors[j * grid.size + i];
}

/**
 * Sight between two points: walls, closed doors and hedges block it (window
 * glass doesn't: he can see you through one). The
 * hedge right around `b` doesn't count; being inside one is what "hidden" is for.
 */
export function lineOfSight(grid: NavGrid, a: Point, b: Point, closed: DoorsClosed = allOpen) {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(distance / (CELL * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const [i, j] = cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    const cell = cellAt(grid, i, j);
    if (cell === WALL) return false;
    if (cell === HEDGE && distance * (1 - t) > 1.8) return false;
    if (cell === DOOR && closed(grid.doors[j * grid.size + i])) return false;
  }
  return true;
}

/** Straight walk between two points without crossing a wall. */
function clearWalk(grid: NavGrid, a: Point, b: Point) {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.ceil(distance / (CELL * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!walkable(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

function nearestWalkable(grid: NavGrid, i: number, j: number): [number, number] {
  if (!solid(cellAt(grid, i, j))) return [i, j];
  for (let r = 1; r < 12; r++)
    for (let di = -r; di <= r; di++)
      for (let dj = -r; dj <= r; dj++)
        if (!solid(cellAt(grid, i + di, j + dj))) return [i + di, j + dj];
  return [i, j];
}

// Scratch buffers shared by every search (the grid never changes size).
let scratch: {
  g: Float32Array;
  parent: Int32Array;
  closed: Uint8Array;
  stamp: Uint32Array;
} | null = null;
let generation = 0;

/**
 * A* over the grid (8-way, no corner cutting; doorways cost a little extra),
 * then string-pulled so the path is a few straight legs, not a staircase.
 */
export function findPath(grid: NavGrid, from: Point, to: Point): Point[] {
  const size = grid.size;
  const [si, sj] = nearestWalkable(grid, ...cellOf(from.x, from.z));
  const [ti, tj] = nearestWalkable(grid, ...cellOf(to.x, to.z));
  const start = sj * size + si,
    goal = tj * size + ti;
  if (start === goal) return [to];
  if (!scratch || scratch.g.length !== size * size)
    scratch = {
      g: new Float32Array(size * size),
      parent: new Int32Array(size * size),
      closed: new Uint8Array(size * size),
      stamp: new Uint32Array(size * size),
    };
  const { g, parent, closed, stamp } = scratch;
  generation++;
  const touch = (n: number) => {
    if (stamp[n] === generation) return;
    stamp[n] = generation;
    g[n] = Infinity;
    parent[n] = -1;
    closed[n] = 0;
  };
  const heap: number[] = [];
  const keys: number[] = [];
  const push = (f: number, n: number) => {
    heap.push(n);
    keys.push(f);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (keys[p] <= keys[k]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      [keys[p], keys[k]] = [keys[k], keys[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const lastNode = heap.pop()!;
    const lastKey = keys.pop()!;
    if (heap.length) {
      heap[0] = lastNode;
      keys[0] = lastKey;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1,
          r = l + 1;
        let m = k;
        if (l < heap.length && keys[l] < keys[m]) m = l;
        if (r < heap.length && keys[r] < keys[m]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        [keys[m], keys[k]] = [keys[k], keys[m]];
        k = m;
      }
    }
    return top;
  };
  const h = (i: number, j: number) => {
    const dx = Math.abs(i - ti),
      dz = Math.abs(j - tj);
    return dx + dz - 0.586 * Math.min(dx, dz);
  };
  touch(start);
  g[start] = 0;
  push(h(si, sj), start);
  let found = false;
  while (heap.length) {
    const node = pop();
    if (closed[node]) continue;
    closed[node] = 1;
    if (node === goal) {
      found = true;
      break;
    }
    const i = node % size,
      j = (node - i) / size;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di,
          nj = j + dj;
        const cell = cellAt(grid, ni, nj);
        if (solid(cell)) continue;
        if (di && dj && (solid(cellAt(grid, i + di, j)) || solid(cellAt(grid, i, j + dj))))
          continue;
        const next = nj * size + ni;
        touch(next);
        const cost = g[node] + (di && dj ? 1.414 : 1) + (cell === DOOR ? 2 : 0);
        if (cost >= g[next]) continue;
        g[next] = cost;
        parent[next] = node;
        push(cost + h(ni, nj), next);
      }
  }
  if (!found) return [];
  const cells: Point[] = [];
  for (let n = goal; n !== -1; n = parent[n]) cells.push(centerOf(n % size, Math.floor(n / size)));
  cells.reverse();
  cells[cells.length - 1] = to;
  // String pulling: skip every waypoint you can walk straight past.
  const path: Point[] = [];
  let anchor = from;
  for (let k = 1; k < cells.length; k++) {
    if (!clearWalk(grid, anchor, cells[k])) {
      path.push(cells[k - 1]);
      anchor = cells[k - 1];
    }
  }
  path.push(cells[cells.length - 1]);
  return path;
}
