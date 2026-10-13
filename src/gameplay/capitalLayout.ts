import { buildCapitalNavigation } from "./capitalNavigation.ts";
import { createCapitalBuilder, type CapitalSurface } from "./capitalKitLevel.ts";
import {
  authorCapitalDistricts,
  CAPITAL_HOMES,
  CAPITAL_SITES,
  TIER_H,
  TIER_R,
  LOWER_STREET_X,
  Y,
  onTier,
  polar,
} from "./capitalDistricts.ts";
import type { EnemyKind, ParishArea, ParishPoint, ParishProgress } from "./ashenParish.ts";

export type { CapitalSurface, CapitalSolid } from "./capitalKitLevel.ts";

/** The whole capital: kit pieces, their walkable surfaces and their colliders. */
export const capitalLevel = createCapitalBuilder();
export const capitalLanterns = authorCapitalDistricts(capitalLevel);
export const capitalSurfaces = capitalLevel.surfaces;
export const capitalSolids = capitalLevel.solids;
/** The forest portal opens in the colosseum after its keeper falls, facing the gate. */
export const CAPITAL_EXIT: ParishPoint = [
  CAPITAL_SITES.colosseum[0] + 6,
  CAPITAL_SITES.colosseum[1],
  CAPITAL_SITES.colosseum[2],
];
export const CAPITAL_EXIT_YAW = -Math.PI / 2;

export const capitalAreas = [
  {
    id: "refuge",
    name: "City Wall",
    center: onTier(0, 1, 30, TIER_R[0] - 2),
    description: "The lowest tier behind the great gate.",
  },
  {
    id: "foundry",
    name: "Middle Level Town",
    center: onTier(1, -1, 24, TIER_R[1] - 2),
    description: "The second and third tiers of houses.",
  },
  {
    id: "tunnel",
    name: "Prow Gate",
    center: [...CAPITAL_SITES.tunnelGate] as ParishPoint,
    description: "A barred gate through the rock prow.",
  },
  {
    id: "toproad",
    name: "Up Town",
    center: onTier(3, -1, 24, TIER_R[3] - 2),
    description: "The fourth and fifth tiers.",
  },
  {
    id: "yard",
    name: "Ultimate Plaza",
    center: onTier(5, 1, 14, TIER_R[5] - 2),
    description: "The sixth tier below the citadel.",
  },
  {
    id: "kiln",
    name: "Oblivion Chapel",
    center: [...CAPITAL_SITES.chapel] as ParishPoint,
    description: "The citadel court, its chapel and white tower.",
  },
  {
    id: "aqueduct",
    name: "Church Outside Path",
    center: [22, 54, -62],
    description: "A narrow ascent beside the nave.",
  },
  {
    id: "cloister",
    name: "Asylum Cathedral",
    center: [0, 48, -60],
    description: "The keeper guards the switch that lifts the fog.",
  },
  {
    id: "graveyard",
    name: "Royal Backyard",
    center: [...CAPITAL_SITES.backyard] as ParishPoint,
    description: "A garden on the mountain shoulder.",
  },
  {
    id: "belfry",
    name: "Beacon Pathway",
    center: [-45, 54, -58],
    description: "The beacon's spiral descends to the plain.",
  },
  {
    id: "crypt",
    name: "Grand Street",
    center: [LOWER_STREET_X, -20, -10],
    description: "The forgotten road beneath the plain.",
  },
  {
    id: "arena",
    name: "Glory Colosseum",
    center: [...CAPITAL_SITES.colosseum] as ParishPoint,
    description: "The last keeper is locked inside the mountain.",
  },
] satisfies Array<{ id: ParishArea; name: string; center: ParishPoint; description: string }>;

const townLift = CAPITAL_SITES.townLift;
export const capitalLifts = [
  {
    id: "beacon" as const,
    yaw: 0,
    center: [...CAPITAL_SITES.beaconLift] as ParishPoint,
    low: Y.plain,
    high: Y.gallery,
    upper: [-57, Y.gallery, -52.5] as ParishPoint,
    lower: [-57, Y.plain, -63.5] as ParishPoint,
  },
  {
    id: "arena" as const,
    yaw: 0,
    center: [...CAPITAL_SITES.arenaLift] as ParishPoint,
    low: Y.plain,
    high: Y.citadel,
    upper: [0, Y.citadel, -24.5] as ParishPoint,
    lower: [0, Y.plain, -24.5] as ParishPoint,
  },
  {
    id: "town" as const,
    yaw: Math.atan2(Math.sin(townLift.a), -Math.cos(townLift.a)),
    center: [...townLift.center] as ParishPoint,
    low: TIER_H[1],
    high: TIER_H[2],
    upper: polar(50, townLift.a).flatMap((v, i) => (i ? [TIER_H[2], v] : [v])) as ParishPoint,
    lower: polar(60.05, townLift.a).flatMap((v, i) => (i ? [TIER_H[1], v] : [v])) as ParishPoint,
  },
];
export type CapitalLiftId = (typeof capitalLifts)[number]["id"];

/** The great gate: the return from Grand Street, unbarred from outside the walls. */
export const capitalShortcut = {
  position: [...CAPITAL_SITES.greatGate] as ParishPoint,
  yaw: Math.PI,
  width: 6,
};
/** The cathedral front door is barred from within the nave. */
export const capitalCathedralShortcut = {
  position: [...CAPITAL_SITES.cathedralDoor] as ParishPoint,
  yaw: Math.PI,
  width: 6,
};
/** The third tier's prow gate needs the passage key from the second tier. */
export const capitalTownGate = {
  position: [...CAPITAL_SITES.tunnelGate] as ParishPoint,
  yaw: Math.PI / 2,
  width: 4.6,
};
/** Fog seals the beacon pathway until the switch is thrown. */
export const capitalBeaconSeal = {
  position: [...CAPITAL_SITES.beaconSeal] as ParishPoint,
  yaw: Math.PI / 2,
  width: 3.4,
};

export const capitalShrines = [
  {
    id: "refuge" as const,
    name: "City Wall Ember",
    position: [...CAPITAL_SITES.start] as ParishPoint,
    spawn: [...CAPITAL_SITES.startSpawn] as ParishPoint,
  },
  {
    id: "kiln" as const,
    name: "Oblivion Chapel",
    position: [...CAPITAL_SITES.chapel] as ParishPoint,
    spawn: [-7, 48, -12] as ParishPoint,
  },
];
const HOME_KEEPSAKES = [
  "Widow’s keepsake",
  "Smith’s tithe",
  "Archivist’s seal",
  "Lamplighter’s wages",
  "Mason’s token",
  "Weaver’s coin",
  "Guardsman’s ration",
  "Child’s charm",
];
export const capitalCaches = [
  {
    id: "wall",
    name: "Broken wall offering",
    position: polar(TIER_R[0] - 3, Math.PI + 0.7).flatMap((v, i) =>
      i ? [0, v] : [v],
    ) as ParishPoint,
    embers: 70,
  },
  {
    id: "town-key",
    name: "Prow gate key",
    position: onTier(1, -1, 34, TIER_R[2] + 3.5),
    embers: 60,
  },
  { id: "town", name: "Townkeeper’s offering", position: onTier(1, 1, 24, 59), embers: 80 },
  { id: "town-roof", name: "Upper town offering", position: onTier(2, 1, 50, 48), embers: 100 },
  {
    id: "uptown",
    name: "Up Town offering",
    position: onTier(3, -1, 30, TIER_R[4] + 2.8),
    embers: 90,
  },
  { id: "sky-sigil", name: "Sigil of the prow", position: [0, 48, 49] as ParishPoint, embers: 220 },
  {
    id: "cathedral",
    name: "Cathedral offering",
    position: [-13, 54, -44] as ParishPoint,
    embers: 150,
  },
  { id: "garden", name: "Royal offering", position: [46, 54, -56.8] as ParishPoint, embers: 120 },
  {
    id: "street",
    name: "Forgotten offering",
    position: [LOWER_STREET_X - 2, -20, -30] as ParishPoint,
    embers: 180,
  },
  // Keepsakes left in every other open home of the row quarters.
  ...CAPITAL_HOMES.filter((_, i) => i % 2 === 0).map((h, i) => ({
    id: h.id,
    name: HOME_KEEPSAKES[i % HOME_KEEPSAKES.length],
    position: h.spot,
    embers: 40 + h.k * 15,
  })),
];
export const capitalBosses = {
  cathedral: {
    name: "Keeper of the Asylum",
    health: 380,
    origin: [...CAPITAL_SITES.apse] as ParishPoint,
    entry: [0, 48, -80] as ParishPoint,
    spawn: [0, 48, -83] as ParishPoint,
    radius: 10,
    yaw: 0,
    entryWidth: 6,
  },
  colosseum: {
    name: "The Ash Warden",
    health: 500,
    origin: [...CAPITAL_SITES.colosseum] as ParishPoint,
    entry: [-21.25, -20, 0] as ParishPoint,
    spawn: [-15, -20, 0] as ParishPoint,
    radius: 16,
    yaw: Math.PI / 2,
    entryWidth: 6,
  },
};
export type CapitalBossId = keyof typeof capitalBosses;
export const capitalNpcs = [
  {
    id: "gatewarden",
    name: "The Gatewarden",
    position: onTier(0, 1, 34, TIER_R[0] - 2.5),
    dialogue:
      "Seven walls, seven gates, and every gate barred since the fog rose. Climb by the stairs at the tier ends and cross through the prow. The third gate wants its key; a household on the second tier kept one. Mind the open doors. Not every home is empty.",
  },
  {
    id: "lamplighter",
    name: "The Lamplighter",
    position: onTier(3, -1, 50, TIER_R[3] - 2),
    dialogue:
      "I still light them, though no one walks here. Above the plaza the keepers' statues watch the court. The keeper of the asylum never left his apse. They say his switch can part the fog, and that the old road below the walls still remembers the gate into the mountain.",
  },
  {
    id: "mourner",
    name: "The Mourner",
    position: onTier(5, 1, 30, TIER_R[5] - 2),
    dialogue:
      "My brother went down to the colosseum to face the Warden. It waits for a step back, then leaps; it gathers embers when it is wounded. Roll through, not away. And drink before it roars, not after.",
  },
  {
    id: "sage",
    name: "The Sage",
    position: [8, 48, -14] as ParishPoint,
    dialogue:
      "The cathedral door is barred from within. Take the outside path along its east side to the galleries. The keeper waits in the apse beyond the transept, and behind him is the switch that lifts the fog.",
  },
  {
    id: "knight",
    name: "The Fearful Knight",
    position: [LOWER_STREET_X + 1.5, -20, -8] as ParishPoint,
    dialogue:
      "The beacon opened this old road beneath the plain. The last keeper is locked inside the mountain, through the gate beside me. Its lift rises to the citadel.",
  },
];
export const capitalBeacon = { position: [0, 48, -104.3] as ParishPoint };
export const capitalEnemySpawns = [
  {
    id: "wall-watch",
    kind: "sentinel",
    position: onTier(0, -1, 60, TIER_R[0] - 2),
    area: "refuge",
  },
  { id: "lower-hound", kind: "hound", position: onTier(0, 1, 70, TIER_R[0] - 2), area: "refuge" },
  {
    id: "town-sentinel",
    kind: "sentinel",
    position: onTier(1, 1, 40, TIER_R[1] - 2),
    area: "foundry",
  },
  {
    id: "town-penitent",
    kind: "acolyte",
    position: onTier(1, -1, 26, TIER_R[1] - 2),
    area: "foundry",
  },
  {
    id: "upper-acolyte",
    kind: "acolyte",
    position: onTier(2, 1, 26, TIER_R[2] - 2),
    area: "foundry",
  },
  { id: "gate-hound", kind: "hound", position: onTier(2, -1, 12, TIER_R[2] - 2), area: "foundry" },
  {
    id: "uptown-sentinel",
    kind: "sentinel",
    position: onTier(3, -1, 22, TIER_R[3] - 2),
    area: "toproad",
  },
  {
    id: "uptown-acolyte",
    kind: "acolyte",
    position: onTier(4, 1, 20, TIER_R[4] - 2),
    area: "toproad",
  },
  {
    id: "plaza-sentinel",
    kind: "sentinel",
    position: onTier(5, -1, 16, TIER_R[5] - 2),
    area: "yard",
  },
  { id: "path-acolyte", kind: "acolyte", position: [22, 54, -62], area: "aqueduct" },
  { id: "gallery-penitent", kind: "acolyte", position: [-13, 54, -50], area: "cloister" },
  { id: "nave-sentinel", kind: "sentinel", position: [0, 48, -74], area: "cloister" },
  { id: "garden-hound", kind: "hound", position: [40, 54, -62], area: "graveyard" },
  { id: "garden-sentinel", kind: "sentinel", position: [52, 54, -56], area: "graveyard" },
  { id: "beacon-sentinel", kind: "sentinel", position: [-64, 54, -55], area: "belfry" },
  { id: "street-watch", kind: "sentinel", position: [LOWER_STREET_X, -20, -20], area: "crypt" },
  { id: "wall-hound", kind: "hound", position: onTier(0, -1, 90, TIER_R[0] - 2), area: "refuge" },
  {
    id: "wall-penitent",
    kind: "acolyte",
    position: onTier(0, 1, 55, TIER_R[0] - 2),
    area: "refuge",
  },
  { id: "town-hound", kind: "hound", position: onTier(1, 1, 58, TIER_R[1] - 2), area: "foundry" },
  {
    id: "town-watch",
    kind: "sentinel",
    position: onTier(1, -1, 48, TIER_R[1] - 2),
    area: "foundry",
  },
  {
    id: "upper-watch",
    kind: "sentinel",
    position: onTier(2, 1, 44, TIER_R[2] - 2),
    area: "foundry",
  },
  {
    id: "upper-penitent",
    kind: "acolyte",
    position: onTier(2, -1, 36, TIER_R[2] - 2),
    area: "foundry",
  },
  { id: "uptown-hound", kind: "hound", position: onTier(3, 1, 40, TIER_R[3] - 2), area: "toproad" },
  {
    id: "uptown-penitent",
    kind: "acolyte",
    position: onTier(3, -1, 44, TIER_R[3] - 2),
    area: "toproad",
  },
  {
    id: "terrace-watch",
    kind: "sentinel",
    position: onTier(4, -1, 30, TIER_R[4] - 2),
    area: "toproad",
  },
  {
    id: "terrace-hound",
    kind: "hound",
    position: onTier(4, 1, 36, TIER_R[4] - 2),
    area: "toproad",
  },
  { id: "court-guard", kind: "sentinel", position: [10, 48, -28], area: "kiln" },
  { id: "transept-hound", kind: "hound", position: [-18, 48, -74], area: "cloister" },
  { id: "gate-penitent", kind: "acolyte", position: [-60, -20, 0], area: "crypt" },
] satisfies Array<{ id: string; kind: EnemyKind; position: ParishPoint; area: ParishArea }>;

/** Barycentric height on a real floor triangle, including ramps and stacked galleries. */
export function capitalTriangleHeight(
  a: ParishPoint,
  b: ParishPoint,
  c: ParishPoint,
  x: number,
  z: number,
) {
  const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(denominator) < 1e-8) return null;
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
  const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
  if (u < -0.001 || v < -0.001 || u + v > 1.001) return null;
  return u * a[1] + v * b[1] + (1 - u - v) * c[1];
}
export function capitalSurfaceHeight(s: { vertices: ParishPoint[] }, x: number, z: number) {
  for (let i = 1; i < s.vertices.length - 1; i++) {
    const height = capitalTriangleHeight(s.vertices[0], s.vertices[i], s.vertices[i + 1], x, z);
    if (height !== null) return height;
  }
  return null;
}
// A coarse spatial index keeps per-frame floor queries cheap.
const CELL = 8;
const surfaceCells = new Map<string, CapitalSurface[]>();
for (const s of capitalSurfaces) {
  const xs = s.vertices.map((p) => p[0]),
    zs = s.vertices.map((p) => p[2]);
  for (let x = Math.floor(Math.min(...xs) / CELL); x <= Math.floor(Math.max(...xs) / CELL); x++)
    for (let z = Math.floor(Math.min(...zs) / CELL); z <= Math.floor(Math.max(...zs) / CELL); z++) {
      const key = `${x},${z}`;
      surfaceCells.set(key, [...(surfaceCells.get(key) ?? []), s]);
    }
}
export function capitalSurfaceAt(x: number, z: number, nearY: number) {
  let best: CapitalSurface | undefined,
    distance = Infinity;
  for (const s of surfaceCells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    const y = capitalSurfaceHeight(s, x, z);
    if (y !== null && Math.abs(y - nearY) < distance) {
      best = s;
      distance = Math.abs(y - nearY);
    }
  }
  return best;
}
export function capitalFloorHeight(x: number, z: number, nearY = 0) {
  const s = capitalSurfaceAt(x, z, nearY);
  return s ? capitalSurfaceHeight(s, x, z) : null;
}
export function capitalAreaAt(x: number, z: number, nearY = 0): ParishArea {
  return capitalSurfaceAt(x, z, nearY)?.area ?? "refuge";
}
// Colliders and masses are bucketed by the same grid, padded by the largest query radius.
const BLOCK_PAD = 1;
const solidCells = new Map<string, number[]>(),
  massCells = new Map<string, number[]>();
const bucket = (cells: Map<string, number[]>, i: number, xs: number[], zs: number[]) => {
  for (
    let x = Math.floor((Math.min(...xs) - BLOCK_PAD) / CELL);
    x <= Math.floor((Math.max(...xs) + BLOCK_PAD) / CELL);
    x++
  )
    for (
      let z = Math.floor((Math.min(...zs) - BLOCK_PAD) / CELL);
      z <= Math.floor((Math.max(...zs) + BLOCK_PAD) / CELL);
      z++
    ) {
      const key = `${x},${z}`,
        list = cells.get(key);
      if (list) list.push(i);
      else cells.set(key, [i]);
    }
};
capitalLevel.masses.forEach((m, i) =>
  bucket(
    massCells,
    i,
    m.vertices.map((p) => p[0]),
    m.vertices.map((p) => p[2]),
  ),
);
capitalSolids.forEach((s, i) => {
  const r = Math.hypot(s.size[0], s.size[2]) / 2;
  bucket(
    solidCells,
    i,
    [s.position[0] - r, s.position[0] + r],
    [s.position[2] - r, s.position[2] + r],
  );
});
export function capitalBlocked(x: number, y: number, z: number, radius = 0) {
  const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const i of massCells.get(key) ?? []) {
    const m = capitalLevel.masses[i],
      top = m.vertices[0][1];
    if (y + 1.8 <= m.bottom || y >= top) continue;
    if (capitalSurfaceHeight(m, x, z) !== null) return true;
  }
  for (const i of solidCells.get(key) ?? []) {
    const s = capitalSolids[i];
    const dx = x - s.position[0],
      dz = z - s.position[2];
    const lx = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw),
      lz = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
    if (
      y + 1.8 > s.position[1] &&
      y < s.position[1] + s.size[1] &&
      Math.abs(lx) < s.size[0] / 2 + radius &&
      Math.abs(lz) < s.size[2] / 2 + radius
    )
      return true;
  }
  return false;
}
/** Whether a horizontal segment crosses a closed gate's opening near its floor. */
function crossesGate(
  gate: { position: ParishPoint; yaw: number; width: number },
  ax: number,
  az: number,
  bx: number,
  bz: number,
  nearY: number,
) {
  if (Math.abs(nearY - gate.position[1]) > 2) return false;
  const [x, , z] = gate.position,
    nx = Math.sin(gate.yaw),
    nz = Math.cos(gate.yaw);
  const a = (ax - x) * nx + (az - z) * nz,
    b = (bx - x) * nx + (bz - z) * nz;
  if (a * b > 0 || a === b) return false;
  const t = a / (a - b),
    hitX = ax + (bx - ax) * t - x,
    hitZ = az + (bz - az) * t - z;
  return Math.abs(hitX * nz - hitZ * nx) < gate.width / 2 + 0.4;
}
export function capitalLineClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  progress: ParishProgress,
  nearY: number,
) {
  for (const [open, gate] of [
    [progress.court, capitalCathedralShortcut],
    [progress.refuge, capitalShortcut],
    [progress.caches.includes("town-key"), capitalTownGate],
    [progress.fogCleared, capitalBeaconSeal],
  ] as const)
    if (!open && crossesGate(gate, ax, az, bx, bz, nearY)) return false;
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 2) + 1;
  let lastY = nearY;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      x = ax + (bx - ax) * t,
      z = az + (bz - az) * t;
    const y = capitalFloorHeight(x, z, lastY);
    if (y === null || Math.abs(y - lastY) > 0.65 || capitalBlocked(x, y, z, 0.2)) return false;
    if (!progress.fogCleared && y < 0) return false;
    lastY = y;
  }
  return Math.abs(lastY - nearY) < 1.8;
}
export const capitalNavigation = buildCapitalNavigation(
  capitalSurfaces,
  capitalSurfaceHeight,
  capitalBlocked,
);
export const capitalWorld = {
  campaign: true,
  spawns: capitalEnemySpawns,
  shrines: capitalShrines,
  floorHeight: capitalFloorHeight,
  blocked: capitalBlocked,
  lineClear: capitalLineClear,
  surfaceId: (x: number, z: number, y: number) => capitalSurfaceAt(x, z, y)?.id ?? null,
  connected: (from: string, to: string) => capitalNavigation.connected(from, to),
};
