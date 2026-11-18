import { buildCapitalNavigation } from "./capitalNavigation.ts";
import { createCapitalBuilder, type CapitalSurface } from "./capitalKitLevel.ts";
import {
  authorCapitalDistricts,
  CAPITAL_HOMES,
  CAPITAL_SITES,
  Y,
  polar,
} from "./capitalDistricts.ts";
import type { EnemyKind, ParishArea, ParishPoint, ParishProgress } from "./ashenParish.ts";

export type { CapitalSurface, CapitalSolid } from "./capitalKitLevel.ts";

/** A point on a circle about the plaza at height `y`. */
const ring = (r: number, a: number, y: number): ParishPoint => {
  const [x, z] = polar(r, a);
  return [x, y, z];
};

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
    center: [...CAPITAL_SITES.start] as ParishPoint,
    description: "The curtain where the pilgrim wakes, broken by the Break Wall.",
  },
  {
    id: "foundry",
    name: "Middle Level Town",
    center: ring(42.5, 1.0, Y.f2),
    description: "The street, rooftop and undercroft floors of the eastern town.",
  },
  {
    id: "tunnel",
    name: "Mountain Tunnel",
    center: [0, Y.tunnel, -39.1],
    description: "A passage through the prow from the undercroft to Up Town.",
  },
  {
    id: "toproad",
    name: "Up Town",
    center: ring(65, 5.2, Y.upTown),
    description: "House blocks west of the prow, and the roads up to the plaza.",
  },
  {
    id: "yard",
    name: "Ultimate Plaza",
    center: [...CAPITAL_SITES.plaza] as ParishPoint,
    description: "The round summit court at the root of the blade.",
  },
  {
    id: "kiln",
    name: "Oblivion Chapel",
    center: [...CAPITAL_SITES.chapel] as ParishPoint,
    description: "Where four routes meet behind the plaza.",
  },
  {
    id: "aqueduct",
    name: "Church Outside Path",
    center: [23.5, Y.citadel, 40],
    description: "A ledge round the cathedral's east flank.",
  },
  {
    id: "cloister",
    name: "Asylum Cathedral",
    center: [0, Y.citadel, 80],
    description: "The keeper guards the switch that lifts the fog.",
  },
  {
    id: "graveyard",
    name: "Royal Backyard",
    center: [...CAPITAL_SITES.backyard] as ParishPoint,
    description: "A garden on the rock with a blue pavilion.",
  },
  {
    id: "belfry",
    name: "Beacon Pathway",
    center: [-42.9, 18, 93.8],
    description: "Steps down the island's rim to the beacon tower.",
  },
  {
    id: "crypt",
    name: "Grand Street",
    center: [-50, Y.plain, 24.5],
    description: "The ground city's main street beneath the fog.",
  },
  {
    id: "arena",
    name: "Glory Colosseum",
    center: [...CAPITAL_SITES.colosseum] as ParishPoint,
    description: "The last keeper is locked inside the mountain.",
  },
] satisfies Array<{ id: ParishArea; name: string; center: ParishPoint; description: string }>;

const townLift = CAPITAL_SITES.townLift;
const [beaconX, , beaconZ] = CAPITAL_SITES.beaconLift;
export const capitalLifts = [
  {
    id: "beacon" as const,
    yaw: Math.PI / 2,
    center: [...CAPITAL_SITES.beaconLift] as ParishPoint,
    low: Y.plain,
    high: Y.upTown,
    upper: [beaconX + 3.8, Y.upTown, beaconZ] as ParishPoint,
    lower: [beaconX + 3.8, Y.plain, beaconZ] as ParishPoint,
  },
  {
    id: "arena" as const,
    yaw: Math.PI / 2,
    center: [...CAPITAL_SITES.arenaLift] as ParishPoint,
    low: Y.arena,
    high: Y.plaza,
    upper: [-2.6, Y.plaza, -24] as ParishPoint,
    lower: [-2.6, Y.arena, -24] as ParishPoint,
  },
  {
    id: "town" as const,
    yaw: Math.PI - townLift.a,
    center: [...townLift.center] as ParishPoint,
    low: Y.f2,
    high: Y.f3,
    upper: ring(31.2, townLift.a, Y.f3),
    lower: ring(39.6, townLift.a, Y.f2),
  },
];
export type CapitalLiftId = (typeof capitalLifts)[number]["id"];

/** The great gate: the return from Grand Street and Up Town, unbarred from the stair. */
export const capitalShortcut = {
  position: [...CAPITAL_SITES.greatGate] as ParishPoint,
  yaw: Math.PI,
  width: 4.6,
};
/** The cathedral front door is barred from within the narthex. */
export const capitalCathedralShortcut = {
  position: [0, Y.citadel, 32] as ParishPoint,
  yaw: 0,
  width: 4.6,
};
/**
 * The garden door at the head of Backyard Below opens only from the garden. Until then
 * the town cannot reach the cathedral without first climbing to the plaza and chapel.
 */
export const capitalGardenGate = {
  position: [...CAPITAL_SITES.gardenGate] as ParishPoint,
  yaw: Math.PI / 2,
  width: 4.4,
};
/** The Top-Right Road's gate on the town's roof needs the undercroft key. */
export const capitalTownGate = {
  position: [...CAPITAL_SITES.tunnelGate] as ParishPoint,
  yaw: -Math.PI / 2,
  width: 4.6,
};
/** Fog seals the beacon pathway behind the apse until the switch is thrown. */
export const capitalBeaconSeal = {
  position: [...CAPITAL_SITES.beaconSeal] as ParishPoint,
  yaw: 0,
  width: 4.4,
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
    spawn: [CAPITAL_SITES.chapel[0] + 3, Y.citadel, CAPITAL_SITES.chapel[2]] as ParishPoint,
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
    name: "Break Wall offering",
    position: [...CAPITAL_SITES.courtyard] as ParishPoint,
    embers: 70,
  },
  { id: "town-key", name: "Undercroft key", position: ring(49.3, 1.25, Y.f1), embers: 60 },
  { id: "town", name: "Townkeeper’s offering", position: ring(42.5, 1.6, Y.f2), embers: 80 },
  { id: "town-roof", name: "Rooftop offering", position: ring(34, 0.6, Y.f3), embers: 100 },
  { id: "uptown", name: "Up Town offering", position: ring(51, 5.2, Y.upTown), embers: 90 },
  {
    id: "sky-sigil",
    name: "Sigil of the blade",
    position: [4, Y.tip, -66] as ParishPoint,
    embers: 220,
  },
  {
    id: "cathedral",
    name: "Rafter offering",
    position: [0, Y.rafter, 100] as ParishPoint,
    embers: 150,
  },
  {
    id: "garden",
    name: "Blue pavilion relic",
    position: [79, Y.garden, 69] as ParishPoint,
    embers: 120,
  },
  // The dead end under the barred garden door still pays for the climb.
  {
    id: "below",
    name: "Gardener’s offering",
    position: [46, Y.f2 + 12, 25] as ParishPoint,
    embers: 90,
  },
  {
    id: "street",
    name: "Forgotten offering",
    position: [-68, Y.plain, 26] as ParishPoint,
    embers: 180,
  },
  // Keepsakes left in every other open home.
  ...CAPITAL_HOMES.filter((_, i) => i % 2 === 0).map((h, i) => ({
    id: h.id,
    name: HOME_KEEPSAKES[i % HOME_KEEPSAKES.length],
    position: h.spot,
    embers: 50 + i * 10,
  })),
];
export const capitalBosses = {
  cathedral: {
    name: "Keeper of the Asylum",
    health: 380,
    origin: [...CAPITAL_SITES.apse] as ParishPoint,
    entry: [0, Y.citadel, 54.5] as ParishPoint,
    spawn: [0, Y.citadel, 75] as ParishPoint,
    radius: 10,
    yaw: Math.PI,
    entryWidth: 6,
  },
  colosseum: {
    name: "The Ash Warden",
    health: 500,
    origin: [...CAPITAL_SITES.colosseum] as ParishPoint,
    entry: [0, Y.arena, -22.5] as ParishPoint,
    spawn: [0, Y.arena, -13] as ParishPoint,
    radius: 16,
    yaw: Math.PI,
    entryWidth: 4.6,
  },
};
export type CapitalBossId = keyof typeof capitalBosses;
export const capitalNpcs = [
  {
    id: "gatewarden",
    name: "The Fearful Knight",
    position: ring(101, 0.53, Y.wall),
    dialogue:
      "The city is a nightmare. Go back while you can. If you must go on, the bridges cross to the middle town; the church on the summit is the only light left. The breach east of here drops to a yard. Mind the fall.",
  },
  {
    id: "sage",
    name: "The Sage",
    position: ring(37.6, 0.9, Y.f2),
    dialogue:
      "It began with two princes. The younger became the fallen king and trapped his brother at the bottom of the castle; then the great swords fell everywhere. The undercroft beneath this street keeps a key, and the tunnel through the prow leads to Up Town and the road to the summit. The blue pavilion in the royal backyard holds what the brothers fear.",
  },
  {
    id: "lamplighter",
    name: "The Lamplighter",
    position: ring(65, 5.32, Y.upTown),
    dialogue:
      "Up the Top-Left Road to the tip of the blade, then along it to the plaza. Behind the plaza the Oblivion Chapel keeps a fire; every road up here meets there. The keeper of the asylum never left his apse, and his switch can part the fog.",
  },
  {
    id: "mourner",
    name: "The Mourner",
    position: [-7, Y.plaza, 5] as ParishPoint,
    dialogue:
      "My brother went down to the colosseum to face the Warden. It waits for a step back, then leaps; it gathers embers when it is wounded. Roll through, not away. And drink before it roars, not after.",
  },
  {
    id: "knight",
    name: "The Frustrated Brother's Guard",
    position: [-8, Y.plain + 2, -62.5] as ParishPoint,
    dialogue:
      "You really defeated the king's keeper? Then the city has come down to the ground again. The last keeper is locked inside the mountain, through the gate in the keel. Its lift rises to the plaza; the beacon tower's lift climbs to Up Town and the gate to the wall where you woke.",
  },
];
export const capitalBeacon = { position: [...CAPITAL_SITES.switch] as ParishPoint };
export const capitalEnemySpawns = [
  { id: "wall-watch", kind: "sentinel", position: ring(102, 0.64, Y.wall), area: "refuge" },
  { id: "lower-hound", kind: "hound", position: ring(102, 1.15, Y.wall), area: "refuge" },
  { id: "wall-hound", kind: "hound", position: ring(86, 0.82, Y.upTown), area: "refuge" },
  { id: "wall-penitent", kind: "acolyte", position: ring(70, 0.74, Y.bridge), area: "refuge" },
  { id: "bridge-sentinel", kind: "sentinel", position: ring(66, 1.25, Y.bridge), area: "refuge" },
  { id: "foundry-kiln-bound", kind: "kiln", position: ring(42.5, 0.5, Y.f2), area: "foundry" },
  { id: "town-penitent", kind: "acolyte", position: ring(42.5, 1.1, Y.f2), area: "foundry" },
  { id: "upper-acolyte", kind: "acolyte", position: ring(42.5, 1.78, Y.f2), area: "foundry" },
  { id: "gate-hound", kind: "hound", position: ring(42.5, 0.9, Y.f1), area: "foundry" },
  { id: "town-hound", kind: "hound", position: ring(42.5, 1.5, Y.f1), area: "foundry" },
  { id: "town-watch", kind: "sentinel", position: ring(34, 1.0, Y.f3), area: "foundry" },
  { id: "upper-watch", kind: "sentinel", position: ring(34, 1.72, Y.f3), area: "foundry" },
  { id: "tunnel-penitent", kind: "acolyte", position: [2, Y.tunnel, -39.1], area: "tunnel" },
  { id: "tunnel-crypt-clinger", kind: "clinger", position: [-16, Y.tunnel, -39.1], area: "tunnel" },
  { id: "uptown-sentinel", kind: "sentinel", position: ring(51, 5.5, Y.upTown), area: "toproad" },
  { id: "uptown-acolyte", kind: "acolyte", position: ring(65, 4.9, Y.upTown), area: "toproad" },
  { id: "uptown-hound", kind: "hound", position: ring(88, 5.0, Y.upTown), area: "toproad" },
  { id: "uptown-penitent", kind: "acolyte", position: ring(88, 6.3, Y.upTown), area: "toproad" },
  { id: "terrace-watch", kind: "sentinel", position: ring(65, 5.7, Y.upTown), area: "toproad" },
  { id: "terrace-hound", kind: "hound", position: ring(51, 4.97, Y.upTown), area: "toproad" },
  { id: "north-watch", kind: "sentinel", position: ring(55, 6.06, Y.upTown), area: "toproad" },
  { id: "blade-hound", kind: "hound", position: [0, Y.tip + 4, -39], area: "yard" },
  { id: "path-acolyte", kind: "acolyte", position: [23.5, Y.citadel, 35], area: "aqueduct" },
  { id: "path-sentinel", kind: "sentinel", position: [31, Y.citadel, 50], area: "aqueduct" },
  // The cathedral is the level's densest volume: every floor of it is held.
  { id: "gallery-watch", kind: "sentinel", position: [15.5, Y.gallery, 66], area: "cloister" },
  { id: "gallery-penitent", kind: "acolyte", position: [-15.5, Y.gallery, 80], area: "cloister" },
  { id: "rafter-clinger", kind: "clinger", position: [8, Y.rafter, 92], area: "cloister" },
  { id: "procession-bearer", kind: "bearer", position: [-14, Y.citadel, 50], area: "cloister" },
  { id: "transept-hound", kind: "hound", position: [12, Y.citadel, 48], area: "cloister" },
  { id: "garden-hound", kind: "hound", position: [70, Y.garden, 40], area: "graveyard" },
  { id: "garden-sentinel", kind: "sentinel", position: [84, Y.garden, 76], area: "graveyard" },
  { id: "bell-widow", kind: "widow", position: [-42.9, 18, 93.8], area: "belfry" },
  // The lift down to Grand Street has a keeper of its own.
  { id: "tower-watch", kind: "sentinel", position: [-77.5, Y.upTown, 28.3], area: "belfry" },
  { id: "street-watch", kind: "sentinel", position: [-50, Y.plain, 24.5], area: "crypt" },
  { id: "gate-penitent", kind: "acolyte", position: [-16.5, Y.plain, -42], area: "crypt" },
  { id: "street-hound", kind: "hound", position: ring(27, 5.2, Y.plain), area: "crypt" },
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
    [progress.garden, capitalGardenGate],
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
