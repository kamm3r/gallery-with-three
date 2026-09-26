// The collection: a walled museum on a 6 m grid. Rooms own cells, doors join
// neighbouring cells of different rooms, and everything else becomes a wall.
// Pure data so the whole layout can be tested without a renderer.

export const CELL = 6;
export const WALL_HEIGHT = 9;
/** Walls run down into the pits so the shafts read as solid masonry. */
export const WALL_BOTTOM = -14;
export const WALL_THICKNESS = 0.5;
export const DOOR_WIDTH = 2.8;
export const DOOR_HEIGHT = 4.2;

export type GallerySigil = "sun" | "leaf" | "moon" | "star" | "ember";
export const GALLERY_SIGILS: GallerySigil[] = ["star", "sun", "leaf", "ember", "moon"];
/** The keeper's journey. Each step is written on a verse hidden somewhere in the collection. */
export const GALLERY_SEQUENCE: GallerySigil[] = ["star", "sun", "leaf", "ember", "moon", "sun"];

export function advanceGallerySequence(
  progress: number,
  seal: GallerySigil,
  found: readonly GallerySigil[],
) {
  if (found.length < GALLERY_SIGILS.length || progress >= GALLERY_SEQUENCE.length) return progress;
  if (seal === GALLERY_SEQUENCE[progress]) return progress + 1;
  return seal === GALLERY_SEQUENCE[0] ? 1 : 0;
}

export type RoomId =
  | "foyer"
  | "longGallery"
  | "rotunda"
  | "westHall"
  | "archive"
  | "study"
  | "eastHall"
  | "mirrors"
  | "conservatory"
  | "starStair"
  | "observatory"
  | "gardenPassage"
  | "garden"
  | "cryptPassage"
  | "crypt"
  | "ossuary"
  | "closet"
  | "vaultHall"
  | "vault";

type Rect = [x1: number, x2: number, z1: number, z2: number];

export interface GalleryRoom {
  id: RoomId;
  name: string;
  rect: Rect;
  /** No floor: a shaft to cross on platforms. Falling respawns at the last checkpoint. */
  pit?: boolean;
  secret?: boolean;
  floor: [string, string];
  wall: string;
  light: string;
}

export const galleryRooms: GalleryRoom[] = [
  {
    id: "foyer",
    name: "Entrance hall",
    rect: [-1, 1, 2, 4],
    floor: ["#6e6558", "#463f37"],
    wall: "#6a2e35",
    light: "#ffd9a0",
  },
  {
    id: "longGallery",
    name: "Long gallery",
    rect: [0, 0, 0, 1],
    floor: ["#6d6254", "#4b433a"],
    wall: "#2f4a47",
    light: "#ffe2b0",
  },
  {
    id: "rotunda",
    name: "Hall of sigils",
    rect: [-1, 1, -3, -1],
    floor: ["#9a9384", "#58544c"],
    wall: "#3b3552",
    light: "#ffe7c4",
  },
  {
    id: "westHall",
    name: "Hall of busts",
    rect: [-3, -2, -2, -2],
    floor: ["#6b4a30", "#583c27"],
    wall: "#4d3b2c",
    light: "#ffcf8a",
  },
  {
    id: "archive",
    name: "Sun archive",
    rect: [-7, -4, -4, -1],
    floor: ["#5a3e28", "#4a3322"],
    wall: "#3b2a1f",
    light: "#ffc27a",
  },
  {
    id: "study",
    name: "Painter's study",
    rect: [-7, -6, -6, -5],
    secret: true,
    floor: ["#5d4a37", "#4c3c2c"],
    wall: "#2b3b2a",
    light: "#e8d49a",
  },
  {
    id: "eastHall",
    name: "Silver corridor",
    rect: [2, 3, -2, -2],
    floor: ["#4f5a6b", "#3c4554"],
    wall: "#26364f",
    light: "#b8cdf5",
  },
  {
    id: "mirrors",
    name: "Moon chamber",
    rect: [4, 7, -4, -1],
    floor: ["#2c3444", "#1f2532"],
    wall: "#1a2233",
    light: "#9fb8f0",
  },
  {
    id: "conservatory",
    name: "Mirror conservatory",
    rect: [8, 8, -4, -2],
    secret: true,
    floor: ["#7a8d8a", "#5b6c69"],
    wall: "#2d4a55",
    light: "#d0f0ff",
  },
  {
    id: "starStair",
    name: "Star stair",
    rect: [5, 5, -6, -5],
    floor: ["#3a3f5c", "#2c3048"],
    wall: "#1e2340",
    light: "#aab4ff",
  },
  {
    id: "observatory",
    name: "Observatory",
    rect: [4, 6, -9, -7],
    floor: ["#2a2f4d", "#1e2240"],
    wall: "#161c38",
    light: "#c3b8ff",
  },
  {
    id: "gardenPassage",
    name: "Orangery passage",
    rect: [2, 2, 3, 3],
    floor: ["#6d7b5a", "#58654a"],
    wall: "#2f4a33",
    light: "#e6f0b0",
  },
  {
    id: "garden",
    name: "Suspended garden",
    rect: [3, 6, 1, 4],
    pit: true,
    floor: ["#000", "#000"],
    wall: "#2a4430",
    light: "#c8f0a0",
  },
  {
    id: "cryptPassage",
    name: "Ember stair",
    rect: [-2, -2, 3, 3],
    floor: ["#4a3a36", "#3a2d2a"],
    wall: "#3a2522",
    light: "#ff9a5a",
  },
  {
    id: "crypt",
    name: "Ember crypt",
    rect: [-6, -3, 1, 4],
    pit: true,
    floor: ["#000", "#000"],
    wall: "#2e1c1a",
    light: "#ff7a3a",
  },
  {
    id: "ossuary",
    name: "Ossuary",
    rect: [-7, -7, 1, 2],
    secret: true,
    floor: ["#6a5a50", "#4e4038"],
    wall: "#3a2a26",
    light: "#ffb070",
  },
  {
    id: "closet",
    name: "Collector's closet",
    rect: [-2, -2, 4, 4],
    secret: true,
    floor: ["#6b5540", "#574432"],
    wall: "#4a3a2a",
    light: "#ffe0a0",
  },
  {
    id: "vaultHall",
    name: "Vault approach",
    rect: [0, 0, -6, -4],
    floor: ["#8b7a55", "#6a5c40"],
    wall: "#4a3d22",
    light: "#ffe0a0",
  },
  {
    id: "vault",
    name: "The vault",
    rect: [-1, 1, -10, -7],
    floor: ["#b8a67a", "#8a7a55"],
    wall: "#57461f",
    light: "#fff0c8",
  },
];

export type DoorKey = "vault" | "conservatory";
export type Cell = [x: number, z: number];

export interface GalleryDoor {
  a: Cell;
  b: Cell;
  /** open: archway. illusory: looks like wall, walk through. sealed: slab until the key turns. */
  kind?: "open" | "illusory" | "sealed";
  key?: DoorKey;
}

export const galleryDoors: GalleryDoor[] = [
  { a: [0, 2], b: [0, 1] },
  { a: [0, 0], b: [0, -1] },
  { a: [-1, -2], b: [-2, -2] },
  { a: [-3, -2], b: [-4, -2] },
  { a: [-7, -4], b: [-7, -5], kind: "illusory" },
  { a: [1, -2], b: [2, -2] },
  { a: [3, -2], b: [4, -2] },
  { a: [7, -3], b: [8, -3], kind: "sealed", key: "conservatory" },
  { a: [5, -4], b: [5, -5] },
  { a: [5, -6], b: [5, -7] },
  { a: [1, 3], b: [2, 3] },
  { a: [2, 3], b: [3, 3] },
  { a: [-1, 3], b: [-2, 3] },
  { a: [-2, 3], b: [-3, 3] },
  { a: [-6, 1], b: [-7, 1], kind: "illusory" },
  { a: [-1, 4], b: [-2, 4], kind: "illusory" },
  { a: [0, -3], b: [0, -4], kind: "sealed", key: "vault" },
  { a: [0, -6], b: [0, -7] },
];

const key = (x: number, z: number) => `${x},${z}`;
const pairKey = (a: Cell, b: Cell) => [key(...a), key(...b)].sort().join("|");

export const roomById = Object.fromEntries(galleryRooms.map((room) => [room.id, room])) as Record<
  RoomId,
  GalleryRoom
>;

export const cellRoom = new Map<string, GalleryRoom>();
for (const room of galleryRooms) {
  const [x1, x2, z1, z2] = room.rect;
  for (let x = x1; x <= x2; x++)
    for (let z = z1; z <= z2; z++) {
      if (cellRoom.has(key(x, z))) throw new Error(`Rooms overlap at ${key(x, z)}`);
      cellRoom.set(key(x, z), room);
    }
}
const doorByPair = new Map(galleryDoors.map((door) => [pairKey(door.a, door.b), door]));

/** The room whose floor cell contains a world-space point, if any. */
export function roomAt(x: number, z: number): GalleryRoom | undefined {
  return cellRoom.get(key(Math.round(x / CELL), Math.round(z / CELL)));
}

/** World-space centre of a room's floor. */
export function roomCenter(id: RoomId): [number, number] {
  const [x1, x2, z1, z2] = roomById[id].rect;
  return [((x1 + x2) / 2) * CELL, ((z1 + z2) / 2) * CELL];
}

/** World-space bounds [minX, maxX, minZ, maxZ] of a room's interior. */
export function roomBounds(id: RoomId): [number, number, number, number] {
  const [x1, x2, z1, z2] = roomById[id].rect;
  const h = CELL / 2;
  return [x1 * CELL - h, x2 * CELL + h, z1 * CELL - h, z2 * CELL + h];
}

/** World-space centre of the wall a door is cut into. */
export function doorPoint(door: GalleryDoor): [number, number] {
  return [((door.a[0] + door.b[0]) * CELL) / 2, ((door.a[1] + door.b[1]) * CELL) / 2];
}

export interface Box {
  position: [number, number, number];
  size: [number, number, number];
}
export interface WallCore extends Box {
  collide: boolean;
}
export interface WallLining extends Box {
  color: string;
}
export interface DoorFrame {
  position: [number, number, number];
  /** True when the doorway runs along the x axis (wall plane faces z). */
  alongX: boolean;
  kind: NonNullable<GalleryDoor["kind"]>;
}
export interface SealedDoor extends Box {
  key: DoorKey;
}

export const galleryFloors: Array<{ cell: Cell; color: string }> = [];
export const wallCores: WallCore[] = [];
export const wallLinings: WallLining[] = [];
export const doorFrames: DoorFrame[] = [];
export const sealedDoors: SealedDoor[] = [];
export const cornices: Box[] = [];
const corniceCaps = new Map<string, Box>();

const LINING_OFFSET = WALL_THICKNESS / 2 + 0.03;

function buildWall(cell: Cell, dx: number, dz: number, own: GalleryRoom, other?: GalleryRoom) {
  const [cx, cz] = cell;
  const along = dx !== 0 ? "z" : "x";
  const plane = (dx !== 0 ? cx : cz) * CELL + (dx || dz) * (CELL / 2);
  const middle = (dx !== 0 ? cz : cx) * CELL;
  const door = other ? doorByPair.get(pairKey(cell, [cx + dx, cz + dz])) : undefined;
  const kind = door?.kind ?? "open";
  const box = (a0: number, a1: number, y0: number, y1: number, offset: number, thick: number) => {
    const a = middle + (a0 + a1) / 2;
    const length = a1 - a0;
    const p = plane + offset;
    return {
      position: (along === "z" ? [p, (y0 + y1) / 2, a] : [a, (y0 + y1) / 2, p]) as Box["position"],
      size: (along === "z" ? [thick, y1 - y0, length] : [length, y1 - y0, thick]) as Box["size"],
    };
  };
  // Pieces in local (along, height) space. Solid walls overlap the corners.
  const half = CELL / 2 + WALL_THICKNESS / 2;
  const w = DOOR_WIDTH / 2;
  const pieces: Array<[number, number, number, number]> =
    door && kind !== "illusory"
      ? [
          [-half, -w, WALL_BOTTOM, WALL_HEIGHT],
          [w, half, WALL_BOTTOM, WALL_HEIGHT],
          [-w, w, DOOR_HEIGHT, WALL_HEIGHT],
          // Sill stops just under the floor so the two never share a plane.
          [-w, w, WALL_BOTTOM, -0.05],
        ]
      : [[-half, half, WALL_BOTTOM, WALL_HEIGHT]];
  const collide = kind !== "illusory";
  const clamp = (edge: number) => Math.max(-CELL / 2, Math.min(CELL / 2, edge));
  for (const [a0, a1, y0, y1] of pieces) {
    wallCores.push({ ...box(a0, a1, y0, y1, 0, WALL_THICKNESS), collide });
    if (y1 === WALL_HEIGHT) {
      // Cornices tile the cell exactly; caps cover the joints.
      cornices.push(box(clamp(a0), clamp(a1), WALL_HEIGHT, WALL_HEIGHT + 0.28, 0, 0.95));
    }
    // Linings stop at the floor on solid rooms and carry on down the shafts.
    const liningBottom = (room: GalleryRoom) => (room.pit ? y0 : Math.max(y0, 0));
    const sides: Array<[GalleryRoom, number]> = [[own, -(dx || dz)]];
    if (other) sides.push([other, dx || dz]);
    for (const [room, sign] of sides) {
      const bottom = liningBottom(room);
      if (bottom >= y1) continue;
      // Linings tile the cell exactly so straight runs neither gap nor z-fight.
      wallLinings.push({
        ...box(clamp(a0), clamp(a1), bottom, y1, sign * LINING_OFFSET, 0.06),
        color: room.wall,
      });
    }
  }
  for (const end of [-CELL / 2, CELL / 2]) {
    const cap = box(end - 0.55, end + 0.55, WALL_HEIGHT, WALL_HEIGHT + 0.34, 0, 1.1);
    corniceCaps.set(cap.position.join(","), cap);
  }
  if (door) {
    doorFrames.push({
      position: along === "z" ? [plane, 0, middle] : [middle, 0, plane],
      alongX: along === "x",
      kind,
    });
    if (kind === "sealed") {
      sealedDoors.push({ ...box(-w, w, 0, DOOR_HEIGHT, 0, 0.36), key: door.key! });
    }
  }
}

for (const [cellKey, room] of cellRoom) {
  const [x, z] = cellKey.split(",").map(Number) as Cell;
  if (!room.pit) galleryFloors.push({ cell: [x, z], color: room.floor[(x + z) & 1] });
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const neighbour = cellRoom.get(key(x + dx, z + dz));
    if (neighbour === room) continue;
    // Shared walls are built once, from the cell on their negative side.
    if (neighbour && (dx < 0 || dz < 0)) continue;
    buildWall([x, z], dx, dz, room, neighbour);
  }
}

export const corniceCapBoxes = [...corniceCaps.values()];

for (const door of galleryDoors) {
  const a = cellRoom.get(key(...door.a));
  const b = cellRoom.get(key(...door.b));
  if (!a || !b || a === b)
    throw new Error(`Door ${pairKey(door.a, door.b)} does not join two rooms`);
  if (Math.abs(door.a[0] - door.b[0]) + Math.abs(door.a[1] - door.b[1]) !== 1)
    throw new Error(`Door ${pairKey(door.a, door.b)} joins cells that are not adjacent`);
}

/** Rooms reachable from the foyer through the given door kinds. */
export function reachableRooms(allow: (door: GalleryDoor) => boolean = () => true): Set<RoomId> {
  const seen = new Set<RoomId>(["foyer"]);
  const queue: RoomId[] = ["foyer"];
  while (queue.length) {
    const current = queue.shift()!;
    for (const door of galleryDoors) {
      if (!allow(door)) continue;
      const a = cellRoom.get(key(...door.a))!.id;
      const b = cellRoom.get(key(...door.b))!.id;
      const next = a === current ? b : b === current ? a : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// --- Mazes: seeded recursive backtracker on a sub-grid inside a room. ---

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MazeSegment {
  /** World-space endpoints on the floor plane. */
  from: [number, number];
  to: [number, number];
}

export interface GalleryMaze {
  room: RoomId;
  cellSize: number;
  segments: MazeSegment[];
  /** World-space centre of the cell deepest into the maze from the main door. */
  deepest: [number, number];
  /** Dead ends sorted from deepest to shallowest, excluding the deepest cell. */
  deadEnds: Array<[number, number]>;
  distance: number;
}

export function buildMaze(room: RoomId, seed: number, cells = 6): GalleryMaze {
  const [minX, maxX, minZ] = roomBounds(room);
  const size = (maxX - minX) / cells;
  const random = mulberry32(seed);
  // wallsX[i][j]: wall between (i,j) and (i+1,j). wallsZ[i][j]: between (i,j) and (i,j+1).
  const wallsX = Array.from({ length: cells - 1 }, () => Array<boolean>(cells).fill(true));
  const wallsZ = Array.from({ length: cells }, () => Array<boolean>(cells - 1).fill(true));
  const visited = new Set<string>();
  const stack: Cell[] = [[0, 0]];
  visited.add(key(0, 0));
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const options = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const
    ).filter(([di, dj]) => {
      const ni = i + di;
      const nj = j + dj;
      return ni >= 0 && nj >= 0 && ni < cells && nj < cells && !visited.has(key(ni, nj));
    });
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [di, dj] = options[Math.floor(random() * options.length)];
    if (di) wallsX[Math.min(i, i + di)][j] = false;
    else wallsZ[i][Math.min(j, j + dj)] = false;
    visited.add(key(i + di, j + dj));
    stack.push([i + di, j + dj]);
  }

  // Keep every doorway of the room clear: remove walls that butt into an opening.
  const openings = galleryDoors
    .filter((door) => [door.a, door.b].some((c) => cellRoom.get(key(...c))?.id === room))
    .map(doorPoint);
  const clearance = DOOR_WIDTH / 2 + 0.4;
  const touchesOpening = (x: number, z: number) =>
    openings.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < clearance);
  for (let i = 0; i < cells - 1; i++)
    for (let j = 0; j < cells; j++) {
      const x = minX + (i + 1) * size;
      if (touchesOpening(x, minZ + j * size) || touchesOpening(x, minZ + (j + 1) * size))
        wallsX[i][j] = false;
    }
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells - 1; j++) {
      const z = minZ + (j + 1) * size;
      if (touchesOpening(minX + i * size, z) || touchesOpening(minX + (i + 1) * size, z))
        wallsZ[i][j] = false;
    }

  const segments: MazeSegment[] = [];
  for (let i = 0; i < cells - 1; i++)
    for (let j = 0; j < cells; j++)
      if (wallsX[i][j]) {
        const x = minX + (i + 1) * size;
        segments.push({ from: [x, minZ + j * size], to: [x, minZ + (j + 1) * size] });
      }
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells - 1; j++)
      if (wallsZ[i][j]) {
        const z = minZ + (j + 1) * size;
        segments.push({ from: [minX + i * size, z], to: [minX + (i + 1) * size, z] });
      }

  const centre = (i: number, j: number): [number, number] => [
    minX + (i + 0.5) * size,
    minZ + (j + 0.5) * size,
  ];
  const [ex, ez] = openings[0];
  let start: Cell = [0, 0];
  let best = Infinity;
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const [x, z] = centre(i, j);
      const d = Math.hypot(x - ex, z - ez);
      if (d < best) {
        best = d;
        start = [i, j];
      }
    }
  const neighbours = (i: number, j: number) => {
    const result: Cell[] = [];
    if (i < cells - 1 && !wallsX[i][j]) result.push([i + 1, j]);
    if (i > 0 && !wallsX[i - 1][j]) result.push([i - 1, j]);
    if (j < cells - 1 && !wallsZ[i][j]) result.push([i, j + 1]);
    if (j > 0 && !wallsZ[i][j - 1]) result.push([i, j - 1]);
    return result;
  };
  const distances = new Map<string, number>([[key(...start), 0]]);
  const queue: Cell[] = [start];
  while (queue.length) {
    const [i, j] = queue.shift()!;
    for (const [ni, nj] of neighbours(i, j)) {
      if (distances.has(key(ni, nj))) continue;
      distances.set(key(ni, nj), distances.get(key(i, j))! + 1);
      queue.push([ni, nj]);
    }
  }
  const ranked = [...distances.entries()]
    .map(([k, d]) => ({ cell: k.split(",").map(Number) as Cell, d }))
    .sort((a, b) => b.d - a.d);
  const deepestCell = ranked[0].cell;
  const deadEnds = ranked
    .filter(({ cell }) => cell !== deepestCell && neighbours(...cell).length === 1)
    .map(({ cell }) => centre(...cell));
  return {
    room,
    cellSize: size,
    segments,
    deepest: centre(...deepestCell),
    deadEnds,
    distance: ranked[0].d,
  };
}

export const archiveMaze = buildMaze("archive", 1871);
export const mirrorMaze = buildMaze("mirrors", 4099);

export interface LightAnchor {
  position: [number, number, number];
  color: string;
  intensity: number;
  room: RoomId;
}

/** Ceiling fixtures: one per room, four in the large halls. */
export const lightAnchors: LightAnchor[] = galleryRooms.flatMap((room) => {
  const [x1, x2, z1, z2] = room.rect;
  const w = x2 - x1 + 1;
  const d = z2 - z1 + 1;
  const cx = ((x1 + x2) / 2) * CELL;
  const cz = ((z1 + z2) / 2) * CELL;
  const y = room.pit ? 5.5 : 6.2;
  const base = { color: room.light, room: room.id };
  if (w >= 3 && d >= 3) {
    const ox = (w * CELL) / 4;
    const oz = (d * CELL) / 4;
    return [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => ({
        ...base,
        position: [cx + sx * ox, y, cz + sz * oz] as [number, number, number],
        intensity: 26,
      })),
    );
  }
  if (w * d >= 2) {
    const alongX = w >= d;
    const o = ((alongX ? w : d) * CELL) / 4;
    return [-1, 1].map((s) => ({
      ...base,
      position: (alongX ? [cx + s * o, y, cz] : [cx, y, cz + s * o]) as [number, number, number],
      intensity: 20,
    }));
  }
  return [{ ...base, position: [cx, y, cz] as [number, number, number], intensity: 18 }];
});

/** Player clamp for the whole building, [|x|, |z|]. */
export const GALLERY_BOUNDS: [number, number] = (() => {
  let x = 0;
  let z = 0;
  for (const room of galleryRooms) {
    const [minX, maxX, minZ, maxZ] = roomBounds(room.id);
    x = Math.max(x, Math.abs(minX), Math.abs(maxX));
    z = Math.max(z, Math.abs(minZ), Math.abs(maxZ));
  }
  return [x + 1, z + 1];
})();
