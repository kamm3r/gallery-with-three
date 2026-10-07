import {
  parishSupplies,
  parishTreePlantings,
  parishCanopyPosts,
  parishTorches,
} from "./parishDressingPlan.ts";
import { parishArchitectureBlocked } from "./parishArchitecture.ts";
export type ParishPoint = [number, number, number];
export type ParishArea =
  | "refuge"
  | "yard"
  | "crypt"
  | "aqueduct"
  | "belfry"
  | "kiln"
  | "arena"
  | "graveyard"
  | "cloister"
  | "foundry";
export const PARISH_TILE_SIZE = 8;
export const PARISH_ARENA_Y = 12;
export const PARISH_EXIT: ParishPoint = [0, 0, 151];
export const parishAreas: Array<{
  id: ParishArea;
  name: string;
  center: ParishPoint;
  description: string;
}> = [
  {
    id: "refuge",
    name: "Last Ember Refuge",
    center: [0, 0, 136],
    description: "A sheltered fire below the procession stairs.",
  },
  {
    id: "yard",
    name: "Procession Court",
    center: [-4, 6, 80],
    description: "A broad raised plaza beneath the cathedral.",
  },
  {
    id: "crypt",
    name: "Sunken Ossuary",
    center: [-56, -6, 128],
    description: "Blue funeral lamps beneath the west terrace.",
  },
  {
    id: "aqueduct",
    name: "High Aqueduct",
    center: [48, 14, 88],
    description: "The long eastern arcade overlooks the court.",
  },
  {
    id: "belfry",
    name: "Bellkeeper's Walk",
    center: [48, 14, 48],
    description: "The bell stands at the head of the high walk.",
  },
  {
    id: "kiln",
    name: "Cathedral Vestibule",
    center: [0, 12, 32],
    description: "The grand stair ends beneath the Warden's seal.",
  },
  {
    id: "graveyard",
    name: "Widow’s Garden",
    center: [-56, 6, 80],
    description: "Burial gardens share the west terrace with the court.",
  },
  {
    id: "cloister",
    name: "The Broken Cloister",
    center: [-64, 6, 40],
    description: "A ruined arcade behind the burial gardens.",
  },
  {
    id: "foundry",
    name: "Cinder Foundry",
    center: [84, 14, 40],
    description: "Furnaces across the eastern bell landing.",
  },
  {
    id: "arena",
    name: "The Warden's Seal",
    center: [0, 12, 0],
    description: "The keeper above the great stair.",
  },
];
export type ParishTile = {
  x: number;
  z: number;
  y: number;
  slope: number;
  slopeZ: number;
  area: ParishArea;
};
const tiles = new Map<string, ParishTile[]>();
function add(x: number, z: number, y: number, area: ParishArea, slope = 0, slopeZ = 0) {
  const key = `${x},${z}`;
  const stack = tiles.get(key) ?? [];
  if (!stack.some((t) => t.y === y && t.slope === slope && t.slopeZ === slopeZ))
    stack.push({ x, z, y, area, slope, slopeZ });
  tiles.set(key, stack);
}
// New concept plan: a single terraced precinct, rather than rooms joined by strips.
// Refuge occupies the foreground shelf. Broad stairs enter the court directly.
for (let x = -24; x <= 24; x += 8) for (let z = 128; z <= 144; z += 8) add(x, z, 0, "refuge");
for (const x of [-16, -8, 0, 8, 16]) add(x, 120, 0, "refuge");
// The return portal and boundary columns need a landing beyond the houses.
for (const x of [-16, -8, 0, 8, 16]) add(x, 152, 0, "refuge");
for (const x of [-8, 0, 8]) {
  add(x, 112, 1.5, "yard", 0, -0.375);
  add(x, 104, 4.5, "yard", 0, -0.375);
}
// A 64m-wide continuous court, with clipped corners and a central monument.
for (let x = -32; x <= 24; x += 8)
  for (let z = 56; z <= 96; z += 8) {
    if ((x === -32 || x === 24) && (z === 56 || z === 96)) continue;
    add(x, z, 6, "yard");
  }
for (const x of [-32, -24, -16, 16, 24, 32, 40]) for (const z of [104, 112]) add(x, z, 6, "yard");
// West burial terrace is attached directly to the court, with a rear cloister.
for (let x = -80; x <= -40; x += 8) for (let z = 64; z <= 96; z += 8) add(x, z, 6, "graveyard");
for (let x = -72; x <= -40; x += 8) for (const z of [104, 112, 120]) add(x, z, 6, "graveyard");
for (let x = -80; x <= -48; x += 8) for (let z = 32; z <= 56; z += 8) add(x, z, 6, "cloister");
// The lower ossuary is visible in a cutaway below the west side of the refuge.
for (let x = -72; x <= -40; x += 8) for (let z = 112; z <= 144; z += 8) add(x, z, -6, "crypt");
for (const z of [136, 144]) add(-80, z, -6, "crypt");
for (let i = 0; i < 4; i++) add(-80, 104 + i * 8, 4.5 - i * 3, "crypt", 0, -0.375);
// A return stair leads from the burial floor to the refuge's west postern.
add(-32, 128, -4.5, "crypt", 0.375);
add(-24, 128, -1.5, "crypt", 0.375);
// Grand cathedral stair: 24m wide, six metres above the court.
for (const x of [-8, 0, 8]) {
  add(x, 48, 7.5, "kiln", 0, -0.375);
  add(x, 40, 10.5, "kiln", 0, -0.375);
}
for (let x = -16; x <= 16; x += 8) for (const z of [24, 32]) add(x, z, 12, "kiln");
add(0, 16, 12, "arena");
// One long arcade dominates the east edge, reached by a foreground stair.
for (const x of [32, 40, 48]) add(x, 136, 0, "refuge");
for (let i = 0; i < 4; i++) add(48, 128 - i * 8, 1.75 + i * 3.5, "aqueduct", 0, -0.4375);
for (let z = 40; z <= 96; z += 8) add(48, z, 14, "aqueduct");
// Broad bell landing and the foundry sit behind the arcade, not in a square loop.
for (const x of [32, 40, 48, 56]) for (const z of [32, 40, 48, 56]) add(x, z, 14, "belfry");
for (const x of [64]) for (const z of [40, 48]) add(x, z, 14, "foundry");
for (let x = 72; x <= 96; x += 8) for (let z = 24; z <= 56; z += 8) add(x, z, 14, "foundry");
// Mid-court stair and a short cathedral return connect the upper walk twice.
add(32, 64, 8, "aqueduct", 0.5);
add(40, 64, 12, "aqueduct", 0.5);
add(24, 32, 13, "belfry", 0.25);
// Court continues under the high arcade: real overlapping architectural space.
for (const x of [32, 40, 48]) for (const z of [80, 88, 96]) add(x, z, 6, "yard");
export const parishTiles = [...tiles.values()].flat();
export const parishRoutes: Array<{ id: string; points: ParishPoint[] }> = [
  {
    id: "procession",
    points: [
      [0, 0, 136],
      [0, 0, 120],
      [0, 6, 96],
      [0, 6, 80],
      [0, 6, 56],
      [0, 12, 32],
      [0, 12, 16],
    ],
  },
  {
    id: "garden",
    points: [
      [0, 6, 80],
      [-56, 6, 80],
      [-64, 6, 40],
    ],
  },
  {
    id: "funeral",
    points: [
      [-56, 6, 80],
      [-80, 6, 96],
      [-80, -6, 136],
      [-56, -6, 128],
      [-40, -6, 128],
      [0, 0, 128],
    ],
  },
  {
    id: "bell",
    points: [
      [0, 0, 136],
      [48, 0, 136],
      [48, 14, 96],
      [48, 14, 48],
      [24, 13, 32],
      [0, 12, 32],
    ],
  },
  {
    id: "court-ascent",
    points: [
      [24, 6, 64],
      [48, 14, 64],
    ],
  },
  {
    id: "foundry",
    points: [
      [48, 14, 48],
      [84, 14, 48],
      [84, 14, 32],
    ],
  },
  {
    id: "service",
    points: [
      [24, 6, 88],
      [48, 6, 88],
      [48, 6, 96],
    ],
  },
];
export const parishTileHeight = (tile: ParishTile, x: number, z: number) =>
  tile.y + (x - tile.x) * tile.slope + (z - tile.z) * tile.slopeZ;

/** Adjacency requires the entire shared edge to meet, not just a 2D overlap. */
export function parishTilesConnected(a: ParishTile, b: ParishTile) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  if (Math.abs(dx) + Math.abs(dz) !== 8) return false;
  return [-4, 4].every((offset) => {
    const x = (a.x + b.x) / 2 + (dx === 0 ? offset : 0);
    const z = (a.z + b.z) / 2 + (dz === 0 ? offset : 0);
    return Math.abs(parishTileHeight(a, x, z) - parishTileHeight(b, x, z)) < 0.001;
  });
}

/** Select the nearby floor plane; an actor below a bridge must stay below it. */
function parishTileAt(x: number, z: number, nearY = 0) {
  const gx = Math.round(x / 8) * 8,
    gz = Math.round(z / 8) * 8;
  let selected: ParishTile | undefined,
    best = Infinity;
  for (const dx of [-8, 0, 8])
    for (const dz of [-8, 0, 8]) {
      for (const tile of tiles.get(`${gx + dx},${gz + dz}`) ?? []) {
        if (Math.abs(tile.x - x) > 4.001 || Math.abs(tile.z - z) > 4.001) continue;
        const distance = Math.abs(parishTileHeight(tile, x, z) - nearY);
        if (distance < best) {
          selected = tile;
          best = distance;
        }
      }
    }
  return selected;
}

export type ParishProp = {
  kind:
    | "tomb"
    | "planter"
    | "pew"
    | "furnace"
    | "column"
    | "support"
    | "brazier"
    | "statue"
    | "rubble"
    | "supplies"
    | "tree";
  position: ParishPoint;
  size: ParishPoint;
};
/** Piers carry the suspended stairs without closing the court beneath the high walk. */
export const parishStairSupports: ParishProp[] = parishTiles
  .filter((t) => t.area === "aqueduct" && (t.slope || t.slopeZ))
  .flatMap((tile) =>
    [-1, 1].flatMap((side) =>
      [-1, 1].map((end) => {
        const x = tile.x + (tile.slope ? end * 3.5 : side * 3.35),
          z = tile.z + (tile.slopeZ ? end * 3.5 : side * 3.35),
          top = parishTileHeight(tile, x, z) - 1.15;
        const floors = parishTiles
          .filter((t) => Math.abs(t.x - x) <= 4 && Math.abs(t.z - z) <= 4)
          .map((t) => parishTileHeight(t, x, z))
          .filter((y) => y < top - 0.1);
        const base = floors.length ? Math.max(...floors) : -26;
        return {
          kind: "support" as const,
          position: [x, base, z] as ParishPoint,
          size: [0.9, top - base, 0.9] as ParishPoint,
        };
      }),
    ),
  );
export const parishProps: ParishProp[] = [
  ...parishTorches.map((t) => ({
    kind: "brazier" as const,
    position: t.position,
    size: [1.36 * t.scale, 0.41 * t.scale, 1.36 * t.scale] as ParishPoint,
  })),
  ...parishStairSupports,
  ...parishTreePlantings.map((t) => ({
    kind: "tree" as const,
    position: t.position,
    size: [0.7, t.height * 0.68, 0.7] as ParishPoint,
  })),
  ...parishSupplies.map((p) => ({ kind: "supplies" as const, position: p.position, size: p.size })),
  ...parishCanopyPosts.map((p) => ({ kind: "supplies" as const, ...p })),
  { kind: "statue", position: [0, 6, 80], size: [5, 7, 5] },
  ...[-72, -56, -40].flatMap((x) =>
    [72, 88].map((z) => ({
      kind: "tomb" as const,
      position: [x, 6, z] as ParishPoint,
      size: [2.5, 1.4, 4] as ParishPoint,
    })),
  ),
  ...[-70, -42].flatMap((x) =>
    [116, 128, 140].map((z) => ({
      kind: "tomb" as const,
      position: [x, -6, z] as ParishPoint,
      size: [3, 1.8, 4] as ParishPoint,
    })),
  ),
  ...[116, 128, 140].flatMap((z) =>
    [-68, -44].map((x) => ({
      kind: "column" as const,
      position: [x, -6, z] as ParishPoint,
      size: [1.2, 7, 1.2] as ParishPoint,
    })),
  ),
  { kind: "statue", position: [-56, -6, 112], size: [3, 5, 3] },
  { kind: "statue", position: [-64, 6, 32], size: [3, 5, 3] },
  { kind: "planter", position: [-24, 6, 90], size: [4, 1, 5] },
  // Paired gardens frame the procession rather than filling its fighting lanes.
  ...[-17, 17].flatMap((x) =>
    [62, x < 0 ? 106 : 94].map((z) => ({
      kind: "planter" as const,
      position: [x, 6, z] as ParishPoint,
      size: [6, 0.85, 6] as ParishPoint,
    })),
  ),
  ...[-72, -56].map((x) => ({
    kind: "planter" as const,
    position: [x, 6, 48] as ParishPoint,
    size: [5, 0.85, 7] as ParishPoint,
  })),
  ...[-17, 17].map((x) => ({
    kind: "pew" as const,
    position: [x, 6, 84] as ParishPoint,
    size: [4, 1.15, 1.5] as ParishPoint,
  })),
  { kind: "rubble", position: [18, 6, 70], size: [3, 1.2, 3] },
  { kind: "pew", position: [-12, 12, 32], size: [3, 1.2, 1.5] },
  { kind: "pew", position: [12, 12, 32], size: [3, 1.2, 1.5] },
  { kind: "furnace", position: [76, 14, 28], size: [4, 5, 4] },
  { kind: "furnace", position: [92, 14, 48], size: [4, 5, 4] },
  { kind: "rubble", position: [88, 14, 36], size: [3, 1.5, 3] },
];
export function parishBlocked(x: number, y: number, z: number, radius = 0) {
  return (
    parishArchitectureBlocked(x, y, z, radius) ||
    parishProps.some(
      (p) =>
        y + 1.5 > p.position[1] &&
        y < p.position[1] + p.size[1] &&
        Math.abs(x - p.position[0]) < p.size[0] / 2 + radius &&
        Math.abs(z - p.position[2]) < p.size[2] / 2 + radius,
    )
  );
}
/** Walls follow each floor plane, leaving connected ramp edges open. */
export const parishWalls = parishTiles.flatMap((tile) =>
  (
    [
      [-8, 0],
      [8, 0],
      [0, -8],
      [0, 8],
    ] as const
  )
    .filter(
      ([dx, dz]) =>
        !(tiles.get(`${tile.x + dx},${tile.z + dz}`) ?? []).some((other) =>
          parishTilesConnected(tile, other),
        ),
    )
    .filter(([dx, dz]) => !(tile.z === 16 && dx === 0 && dz === -8))
    .map(([dx, dz]) => ({
      x: tile.x + dx / 2,
      z: tile.z + dz / 2,
      y: parishTileHeight(tile, tile.x + dx / 2, tile.z + dz / 2),
      alongX: dx === 0,
      slope: dx === 0 ? tile.slope : tile.slopeZ,
      area: tile.area,
    })),
);
export function parishFloorHeight(x: number, z: number, nearY = 0): number | null {
  const tile = parishTileAt(x, z, nearY);
  if (tile) return parishTileHeight(tile, x, z);
  return Math.abs(x) <= 23 && Math.abs(z) <= 23 ? PARISH_ARENA_Y : null;
}
export function parishAreaAt(x: number, z: number, nearY = 0): ParishArea {
  const tile = parishTileAt(x, z, nearY);
  return tile?.area ?? (z < 24 ? "arena" : "yard");
}

export const parishShortcuts = [
  {
    id: "refuge" as const,
    name: "Refuge postern",
    position: [-20, 0, 128] as ParishPoint,
    axis: "x" as const,
    farSide: -22,
  },
  {
    id: "court" as const,
    name: "Cathedral return gate",
    position: [20, 12, 32] as ParishPoint,
    axis: "x" as const,
    farSide: 22,
  },
];
export const parishShrines = [
  {
    id: "refuge" as const,
    name: "Last Ember Refuge",
    position: [0, 0, 136] as ParishPoint,
    spawn: [0, 0, 140] as ParishPoint,
  },
  {
    id: "kiln" as const,
    name: "Cathedral Vestibule",
    position: [-8, 12, 28] as ParishPoint,
    spawn: [-5, 12, 30] as ParishPoint,
  },
];
export const parishCaches = [
  {
    id: "garden",
    position: [-72, 6, 96] as ParishPoint,
    name: "Gravekeeper’s offering",
    embers: 80,
  },
  {
    id: "cloister",
    position: [-72, 6, 32] as ParishPoint,
    name: "Pilgrim’s offering",
    embers: 120,
  },
  {
    id: "foundry",
    position: [88, 14, 24] as ParishPoint,
    name: "Bellfounder’s offering",
    embers: 150,
  },
];
export type ParishProgress = {
  refuge: boolean;
  court: boolean;
  checkpoint: "refuge" | "kiln";
  caches: string[];
};
export const newParishProgress = (): ParishProgress => ({
  refuge: false,
  court: false,
  checkpoint: "refuge",
  caches: [],
});

// Background is outside the entire replacement precinct.
export const parishBackdropSpawns = Array.from({ length: 18 }, (_, i) => ({
  position: [
    Math.sin((i * Math.PI) / 9) * 180,
    -18,
    70 + Math.cos((i * Math.PI) / 9) * 200,
  ] as ParishPoint,
  yaw: (i * Math.PI) / 9,
  height: 20,
  width: 12,
}));
export const arenaBackdropSpawns: Array<{
  x: number;
  z: number;
  yaw: number;
  kind: number;
  height: number;
  lean: number;
}> = [];
export type EnemyKind = "sentinel" | "acolyte" | "hound";
export const enemySpecs = {
  sentinel: {
    name: "Cinder Sentinel",
    health: 120,
    speed: 2.45,
    range: 3.1,
    damage: 32,
    windup: 0.85,
    followupWindup: 0.55,
    strike: 0.34,
    recovery: 0.9,
    decisionDelay: 0.25,
    reward: 65,
    poise: 50,
    stagger: 0.38,
    staggerProtection: 1.9,
    armorStart: 0.55,
    contact: 0.14,
    reach: 3.1,
    strikeSpeed: 2.8,
  },
  acolyte: {
    name: "Lantern Penitent",
    health: 85,
    speed: 1.65,
    range: 14,
    damage: 26,
    windup: 1.1,
    followupWindup: 0.55,
    strike: 0.3,
    recovery: 1.15,
    decisionDelay: 0.4,
    reward: 50,
    poise: 25,
    stagger: 0.48,
    staggerProtection: 1.8,
    armorStart: 1,
    contact: 0.16,
    reach: 14,
    strikeSpeed: 0,
  },
  hound: {
    name: "Ossuary Hound",
    health: 65,
    speed: 4.6,
    range: 3.5,
    damage: 23,
    windup: 0.5,
    followupWindup: 0.5,
    strike: 0.38,
    recovery: 0.65,
    decisionDelay: 0.22,
    reward: 35,
    poise: 25,
    stagger: 0.32,
    staggerProtection: 1.3,
    armorStart: 0.7,
    contact: 0.16,
    reach: 1.8,
    strikeSpeed: 8.5,
  },
} satisfies Record<EnemyKind, object>;
export const parishEnemySpawns: Array<{
  id: string;
  kind: EnemyKind;
  position: ParishPoint;
  area: ParishArea;
}> = [
  { id: "procession-guard", kind: "sentinel", position: [-16, 6, 94], area: "yard" },
  { id: "court-guard", kind: "sentinel", position: [8, 6, 76], area: "yard" },
  { id: "bridge-penitent", kind: "acolyte", position: [48, 14, 84], area: "aqueduct" },
  { id: "bell-guard", kind: "sentinel", position: [42, 14, 46], area: "belfry" },
  { id: "crypt-hound", kind: "hound", position: [-57, -6, 134], area: "crypt" },
  { id: "crypt-penitent", kind: "acolyte", position: [-56, -6, 118], area: "crypt" },
  { id: "garden-hound", kind: "hound", position: [-60, 6, 90], area: "graveyard" },
  { id: "garden-guard", kind: "sentinel", position: [-64, 6, 78], area: "graveyard" },
  { id: "cloister-penitent", kind: "acolyte", position: [-64, 6, 44], area: "cloister" },
  { id: "foundry-guard", kind: "sentinel", position: [80, 14, 44], area: "foundry" },
  { id: "foundry-penitent", kind: "acolyte", position: [90, 14, 30], area: "foundry" },
  { id: "kiln-guard", kind: "sentinel", position: [8, 12, 32], area: "kiln" },
];
export type ParishInteraction =
  | { kind: "shortcut"; id: "refuge" | "court"; prompt: string; available: boolean }
  | { kind: "shrine"; id: "refuge" | "kiln"; prompt: string; available: boolean }
  | { kind: "cache"; id: string; prompt: string; available: boolean }
  | { kind: "boss"; prompt: string; available: boolean };

export function parishInteraction(
  x: number,
  y: number,
  z: number,
  progress: ParishProgress,
  threatened: boolean,
  bossActive: boolean,
): ParishInteraction | null {
  for (const cache of parishCaches) {
    if (
      !progress.caches.includes(cache.id) &&
      Math.hypot(x - cache.position[0], z - cache.position[2]) < 2.5 &&
      Math.abs(y - cache.position[1]) < 1.5
    )
      return {
        kind: "cache",
        id: cache.id,
        available: !threatened && !bossActive,
        prompt: threatened
          ? "Clear the nearby watch before taking the offering"
          : `E · Take ${cache.name.toLowerCase()} · embers and a flask`,
      };
  }
  for (const gate of parishShortcuts) {
    if (
      !progress[gate.id] &&
      Math.abs(z - gate.position[2]) < 3 &&
      Math.abs(x - gate.position[0]) < 4 &&
      Math.abs(y - gate.position[1]) < 1.5
    ) {
      const available = gate.id === "refuge" ? x <= gate.farSide : x >= gate.farSide;
      return {
        kind: "shortcut",
        id: gate.id,
        available,
        prompt: available
          ? `E · Unbar ${gate.name.toLowerCase()}`
          : "Barred from the other side · find a way around",
      };
    }
  }
  for (const shrine of parishShrines) {
    if (
      Math.hypot(x - shrine.position[0], z - shrine.position[2]) < 3.4 &&
      Math.abs(y - shrine.position[1]) < 1.5
    ) {
      return {
        kind: "shrine",
        id: shrine.id,
        available: !threatened && !bossActive,
        prompt:
          threatened || bossActive
            ? "Cannot rest while danger is near"
            : `E · Rest at ${shrine.name} · enemies return`,
      };
    }
  }
  if (!bossActive && z > 22 && z < 29 && Math.abs(x) < 3 && Math.abs(y - PARISH_ARENA_Y) < 1.5)
    return { kind: "boss", available: true, prompt: "E · Traverse the fog · face the Ash Warden" };
  return null;
}
