// Movement test park: a single flat arena of isolated skill zones inspired by
// classic character-controller demo scenes (slopes, steps, rough ground,
// terrain, kinematic/dynamic/animated platforms, one-way boards, jump pads).
// Everything is data here; `CollisionCourse.tsx` turns it into bodies/meshes.

export type Tuple3 = [number, number, number];

export type ParkStaticShape = "box" | "pyramid" | "sphere" | "cylinder" | "cone";

export interface ParkStatic {
  shape: ParkStaticShape;
  position: Tuple3;
  /** Full extents: box w/h/d, pyramid baseW/h/baseD, sphere diameter, cylinder/cone d/h/d. */
  size: Tuple3;
  rotation?: Tuple3;
  color: string;
}

export interface ParkBoard {
  position: Tuple3;
  size: Tuple3;
  color: string;
}

export interface ParkJumpPad {
  position: Tuple3;
  size: Tuple3;
  strength: number;
  color: string;
}

export interface ParkPushable {
  position: Tuple3;
  size: Tuple3;
  mass: number;
  color: string;
}

export interface ParkStrip {
  position: Tuple3;
  size: Tuple3;
  color: string;
}

export const PARK_EXTENT = 85;

export const STATIC = "#8a8f96";
export const FUNNEL = "#d63c2f";
const DYNAMIC = "#e09543";
export const ONE_WAY = "#e0303e";
export const JUMP_PAD = "#d926d9";
const WALKABLE = "#2eff5a";
const TOO_STEEP = "#ff2e3e";

/** Walkable ceiling mirrors the controller's slopeMaxAngle (50 deg). */
export const SLOPE_LIMIT_DEG = 50;

export const parkStatics: ParkStatic[] = [];
export const parkStrips: ParkStrip[] = [];

function addStatic(
  shape: ParkStaticShape,
  position: Tuple3,
  size: Tuple3,
  color = STATIC,
  rotation?: Tuple3,
) {
  parkStatics.push({ shape, position, size, color, rotation });
}

/**
 * Ramp rising toward -z from `entryZ` to `height`; returns the z where the
 * top edge ends. Extra length is buried past the entry edge so there is no
 * lip to trip on.
 */
function addRamp(x: number, entryZ: number, width: number, degrees: number, height: number) {
  const radians = (degrees * Math.PI) / 180;
  const run = height / Math.tan(radians);
  const slopeLength = height / Math.sin(radians);
  const bury = 0.75;
  addStatic(
    "box",
    [x, height / 2 - 0.1 - bury * Math.sin(radians), entryZ - run / 2 + bury * Math.cos(radians)],
    [width, 0.3, slopeLength + bury * 2],
    STATIC,
    [radians, 0, 0],
  );
  return entryZ - run;
}

// --- Slopes: equal height, increasing angle, entry at z=16 rising toward -z.
export const SLOPE_ANGLES = [12, 25, 40, 55];
export const SLOPE_ENTRY_Z = 16;
const SLOPE_HEIGHT = 3;

for (const [lane, degrees] of SLOPE_ANGLES.entries()) {
  const x = -27 + lane * 4;
  addRamp(x, SLOPE_ENTRY_Z, 3, degrees, SLOPE_HEIGHT);
  parkStrips.push({
    position: [x, 0.02, SLOPE_ENTRY_Z + 0.7],
    size: [3, 0.04, 1.2],
    color: degrees <= SLOPE_LIMIT_DEG ? WALKABLE : TOO_STEEP,
  });
}

// --- Steps: three lanes (entry z=16, ascending toward -z), landing, descent.
export const STEP_RISERS = [0.18, 0.3, 0.48];
export const STEP_ENTRY_Z = 16;
const STEP_TREAD = 0.7;
const STEP_COUNT = 8;
const STEP_WIDTH = 2.6;

for (const [lane, riser] of STEP_RISERS.entries()) {
  const x = -7.5 + lane * 3;
  for (let i = 0; i < STEP_COUNT; i++) {
    const h = (i + 1) * riser;
    addStatic(
      "box",
      [x, h / 2, STEP_ENTRY_Z - (i + 0.5) * STEP_TREAD],
      [STEP_WIDTH, h, STEP_TREAD + 0.02],
    );
  }
  const topH = STEP_COUNT * riser;
  const landingEdge = STEP_ENTRY_Z - STEP_COUNT * STEP_TREAD;
  addStatic("box", [x, topH - 0.15, landingEdge - 1.1], [STEP_WIDTH, 0.3, 2.2]);
  for (let i = 0; i < STEP_COUNT - 1; i++) {
    const h = topH - (i + 1) * riser;
    addStatic(
      "box",
      [x, h / 2, landingEdge - 2.2 - (i + 0.5) * STEP_TREAD],
      [STEP_WIDTH, h, STEP_TREAD + 0.02],
    );
  }
}

// --- Funnel squeeze: two long slanted walls narrowing to a dead-end wedge.
// Entry at z=20, exit toward -z. The 0.4m exit gap is narrower than the
// 0.84m capsule, so walking in wedges the body where the gap equals its
// width: a stuck/depenetration test, not a walkthrough.
export const parkFunnel = {
  centerX: -40,
  entryZ: 20,
  exitZ: 4,
  entryHalfWidth: 2.0,
  exitHalfWidth: 0.2,
  wallThickness: 0.4,
  wallHeight: 3.2,
  color: FUNNEL,
};

{
  const dx = parkFunnel.entryHalfWidth - parkFunnel.exitHalfWidth;
  const dz = parkFunnel.entryZ - parkFunnel.exitZ;
  const wallLen = Math.hypot(dx, dz) + parkFunnel.wallThickness;
  const midX = parkFunnel.centerX;
  const midZ = (parkFunnel.entryZ + parkFunnel.exitZ) / 2;
  const offX = parkFunnel.entryHalfWidth - dx / 2 + parkFunnel.wallThickness / 2;
  for (const side of [-1, 1]) {
    addStatic(
      "box",
      [midX + side * offX, parkFunnel.wallHeight / 2, midZ],
      [parkFunnel.wallThickness, parkFunnel.wallHeight, wallLen],
      parkFunnel.color,
      // Left wall runs (+dx,-dz), right wall (-dx,-dz): negate per side.
      [0, -side * Math.atan2(dx, -dz), 0],
    );
  }
}

// --- Rough ground: pyramids, domes, tilted blocks, poles, low blocks.
for (let cx = 0; cx < 4; cx++) {
  for (let rz = 0; rz < 4; rz++) {
    addStatic("pyramid", [8 + cx * 1.5, 0.3, 13.5 - rz * 1.5], [1.3, 0.6, 1.3]);
  }
}
for (const [x, z] of [
  [15.5, 9.5],
  [17.3, 9.5],
  [16.4, 7.7],
] as Array<[number, number]>) {
  addStatic("sphere", [x, 0.35, z], [1.6, 1.6, 1.6]);
}
for (let i = 0; i < 8; i++) {
  const yaw = ((i * 0.7) % 1) - 0.5;
  const tilt = i % 2 === 0 ? 0.12 : -0.12;
  addStatic(
    "box",
    [19.5 + (i % 4) * 1.6, 0.25, 8 + Math.floor(i / 4) * 1.8],
    [1.1, 0.5, 1.1],
    STATIC,
    [tilt, yaw, 0],
  );
}
for (let i = 0; i < 6; i++) {
  addStatic("cylinder", [8 + i * 1.1, 0.55, 5.8], [0.14, 1.1, 0.14]);
}
for (let i = 0; i < 4; i++) {
  addStatic("box", [8.5 + i * 1.2, 0.175, 4.2], [0.9, 0.35, 0.9]);
}

// --- Seesaw fulcrum (the plank itself is a dynamic body in the component).
export const parkSeesaw = {
  fulcrum: { position: [-2, 0.35, -15] as Tuple3, size: [0.8, 0.7, 2.0] as Tuple3 },
  plank: { position: [-2, 0.85, -15] as Tuple3, size: [5.2, 0.25, 1.7] as Tuple3, mass: 5 },
};
addStatic("box", parkSeesaw.fulcrum.position, parkSeesaw.fulcrum.size);

// --- Terrain: bumpy checkerboard patch. Height field is pure for testability.
export const parkTerrain = {
  center: [38, 0, 9] as Tuple3,
  size: [22, 22] as [number, number],
  segments: 56,
  edgeFalloff: 2.5,
};

export function terrainHeight(lx: number, lz: number) {
  return 0.55 * Math.sin(lx * 0.55) * Math.cos(lz * 0.5) + 0.25 * Math.sin(lx * 1.3 + lz * 0.8);
}

export function terrainMask(lx: number, lz: number, hx: number, hz: number) {
  const inside = Math.min(hx - Math.abs(lx), hz - Math.abs(lz)) / parkTerrain.edgeFalloff;
  const clamped = Math.min(1, Math.max(0, inside));
  return clamped * clamped * (3 - 2 * clamped);
}

// --- Static one-way boards: ascending staircase the player jumps up through.
export const parkOneWay: ParkBoard[] = [1.0, 1.8, 2.6, 3.4].map((h, i) => ({
  position: [12 + i * 2.8, h, -14],
  size: [2.4, 0.18, 2.4],
  color: ONE_WAY,
}));

// --- Jump pads: static visuals + sensor volumes that launch bodies upward.
export const parkJumpPads: ParkJumpPad[] = [
  { position: [28, 0.075, -12], size: [2.2, 0.15, 2.2], strength: 10, color: JUMP_PAD },
  { position: [31.5, 0.075, -12], size: [2.2, 0.15, 2.2], strength: 14, color: JUMP_PAD },
  { position: [35, 0.075, -12], size: [2.2, 0.15, 2.2], strength: 18, color: JUMP_PAD },
];

// --- Character vs rigid bodies: light pushables plus one heavy "not pushable".
export const parkPushables: ParkPushable[] = [
  { position: [-3, 0.5, -10], size: [1, 1, 1], mass: 2, color: DYNAMIC },
  { position: [-1.8, 0.5, -10], size: [1, 1, 1], mass: 2, color: DYNAMIC },
  { position: [-2.4, 0.5, -8.8], size: [1, 1, 1], mass: 2, color: DYNAMIC },
  { position: [-2.4, 1.5, -9.5], size: [1, 1, 1], mass: 2, color: DYNAMIC },
  { position: [3.5, 0.65, -10], size: [1.3, 1.3, 1.3], mass: 120, color: DYNAMIC },
];

// ===========================================================================
// South field: controller stress lanes. Every lane is entered from +z and
// travels toward -z, so zone spawns all face the same way.
// ===========================================================================

/** Slab rising from `z0` toward -z, then (optionally) back down: a ridge along x. */
function addRidge(x: number, z0: number, width: number, slabLength: number, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const t = 0.3;
  const w = slabLength;
  const y = (w / 2) * Math.sin(a) - (t / 2) * Math.cos(a);
  const ridgeZ = z0 - w * Math.cos(a);
  addStatic(
    "box",
    [x, y, z0 - (w / 2) * Math.cos(a) - (t / 2) * Math.sin(a)],
    [width, t, w],
    STATIC,
    [a, 0, 0],
  );
  addStatic(
    "box",
    [x, y, ridgeZ - (w / 2) * Math.cos(a) + (t / 2) * Math.sin(a)],
    [width, t, w],
    STATIC,
    [-a, 0, 0],
  );
}

/** Two slabs meeting at ground level along z: a valley walked lengthwise. */
function addValley(x: number, centerZ: number, length: number, slabWidth: number, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const t = 0.3;
  const dx = (slabWidth / 2) * Math.cos(a) + (t / 2) * Math.sin(a);
  const y = (slabWidth / 2) * Math.sin(a) - (t / 2) * Math.cos(a);
  for (const side of [-1, 1]) {
    addStatic("box", [x + side * dx, y, centerZ], [slabWidth, t, length], STATIC, [0, 0, side * a]);
  }
}

const SOUTH_ENTRY_Z = -28;

// --- Low ceilings: standing height is ~2.04 m (capsule 1.84 + 0.2 float).
// 2.4 clears, 2.1 scrapes, 1.8 blocks. The fourth lane ramps up under a flat
// roof until the gap closes to 1.6 m: a wedge/depenetration test.
export const CEILING_CLEARANCES = [2.4, 2.1, 1.8];
{
  const length = 6;
  const centerZ = SOUTH_ENTRY_Z - 1 - length / 2;
  for (const [lane, clearance] of CEILING_CLEARANCES.entries()) {
    const x = -70 + lane * 4;
    addStatic("box", [x, clearance + 0.15, centerZ], [2.8, 0.3, length]);
    for (const side of [-1, 1]) {
      addStatic(
        "box",
        [x + side * 1.35, (clearance + 0.3) / 2, centerZ],
        [0.3, clearance + 0.3, length],
      );
    }
  }
  const x = -58;
  const rampEnd = addRamp(x, SOUTH_ENTRY_Z - 1, 2.8, 15, 1.6);
  addStatic("box", [x, 0.8, rampEnd - 1], [2.8, 1.6, 2]);
  const roofLength = SOUTH_ENTRY_Z - 1 - (rampEnd - 2);
  addStatic("box", [x, 3.35, SOUTH_ENTRY_Z - 1 - roofLength / 2], [2.8, 0.3, roofLength]);
}

// --- Ledges: jump-height and ledge-grab ladder, 0.5 m to 3 m.
export const LEDGE_HEIGHTS = [0.5, 1, 1.5, 2, 2.5, 3];
for (const [i, h] of LEDGE_HEIGHTS.entries()) {
  addStatic("box", [-52 + i * 2.6, h / 2, SOUTH_ENTRY_Z - 3], [2, h, 2]);
}

// --- Drop-offs: a 30 deg ramp to a 4 m deck, then drops of .25/.5/1/2/2.25.
export const DROP_TERRACES = [4, 3.75, 3.25, 2.25];
{
  const x = -30;
  let z = addRamp(x, SOUTH_ENTRY_Z, 3, 30, DROP_TERRACES[0]);
  for (const h of DROP_TERRACES) {
    addStatic("box", [x, h / 2, z - 1.25], [3, h, 2.5]);
    z -= 2.5;
  }
}

// --- Gaps: 1.2 m blocks with growing gaps; the second lane also climbs.
export const GAP_LANES = [
  { x: -19, gaps: [1, 2, 3, 4], rise: 0 },
  { x: -14, gaps: [1, 1.5, 2, 2.5], rise: 0.5 },
];
for (const lane of GAP_LANES) {
  let front = addRamp(lane.x, SOUTH_ENTRY_Z, 2.4, 25, 1.2);
  let h = 1.2;
  for (let i = 0; i <= lane.gaps.length; i++) {
    addStatic("box", [lane.x, h / 2, front - 1], [2.4, h, 2]);
    front -= 2 + (lane.gaps[i] ?? 0);
    h += lane.rise;
  }
}

// --- Balance beams at 1.2 m between a shared start and end deck.
export const BEAM_WIDTHS = [0.12, 0.25, 0.5, 1.0];
{
  const deckX = 2.5;
  const deckWidth = 12;
  const height = 1.2;
  const beamLength = 12;
  const start = addRamp(deckX, SOUTH_ENTRY_Z, deckWidth, 25, height);
  addStatic("box", [deckX, height / 2, start - 1], [deckWidth, height, 2]);
  const beamStart = start - 2;
  for (const [lane, width] of BEAM_WIDTHS.entries()) {
    addStatic(
      "box",
      [-2 + lane * 3, height - 0.15, beamStart - beamLength / 2],
      [width, 0.3, beamLength],
    );
  }
  addStatic("box", [deckX, height / 2, beamStart - beamLength - 1], [deckWidth, height, 2]);
}

// --- Ridges (walk over) and valleys (walk along). The 60 deg crevice is
// too steep on both sides: the capsule should settle, not jitter or climb.
export const RIDGE_ANGLES = [25, 45];
export const VALLEY_ANGLES = [30, 60];
addRidge(18, SOUTH_ENTRY_Z, 3, 5, RIDGE_ANGLES[0]);
addRidge(24, SOUTH_ENTRY_Z, 3, 3, RIDGE_ANGLES[1]);
addValley(30, SOUTH_ENTRY_Z - 5, 10, 3, VALLEY_ANGLES[0]);
addValley(37, SOUTH_ENTRY_Z - 5, 10, 3, VALLEY_ANGLES[1]);

// --- Spikes (sharp tips under the float ray) and logs (rounded curbs).
for (let i = 0; i < 6; i++) {
  for (let j = 0; j < 6; j++) {
    addStatic("pyramid", [45 + i * 0.6, 0.45, SOUTH_ENTRY_Z - 2 - j * 0.6], [0.5, 0.9, 0.5]);
  }
}
export const LOG_DIAMETERS = [0.3, 0.6, 1.0, 1.4];
{
  let z = SOUTH_ENTRY_Z - 2;
  for (const d of LOG_DIAMETERS) {
    addStatic("cylinder", [55, d / 2 - 0.05, z], [d, 4, d], STATIC, [0, 0, Math.PI / 2]);
    z -= 2.5 + d;
  }
}

// --- Curbs: single step-up heights, one per lane.
export const CURB_HEIGHTS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
for (const [lane, h] of CURB_HEIGHTS.entries()) {
  addStatic("box", [62 + lane * 2.6, h / 2, SOUTH_ENTRY_Z - 4], [2.2, h, 3]);
}

const BACK_ENTRY_Z = -56;

// --- Stair variants: irregular risers, 45 deg steep stairs, open treads
// (nothing under the lip), and a spiral around a column.
export const IRREGULAR_RISERS = [0.15, 0.3, 0.12, 0.4, 0.2, 0.35, 0.1, 0.25];
{
  let h = 0;
  for (const [i, riser] of IRREGULAR_RISERS.entries()) {
    h += riser;
    addStatic("box", [-70, h / 2, BACK_ENTRY_Z - (i + 0.5) * 0.8], [2.6, h, 0.82]);
  }
  for (let i = 0; i < 10; i++) {
    const h2 = (i + 1) * 0.25;
    addStatic("box", [-66, h2 / 2, BACK_ENTRY_Z - (i + 0.5) * 0.25], [2.6, h2, 0.27]);
  }
  for (let i = 0; i < 10; i++) {
    const h3 = (i + 1) * 0.25;
    addStatic("box", [-62, h3 - 0.04, BACK_ENTRY_Z - (i + 0.5) * 0.7], [2.6, 0.08, 0.72]);
  }
}
export const parkSpiral = { center: [-54, 0, BACK_ENTRY_Z - 6] as Tuple3, steps: 20, rise: 0.22 };
{
  const [cx, , cz] = parkSpiral.center;
  const top = parkSpiral.steps * parkSpiral.rise;
  addStatic("cylinder", [cx, top / 2 + 0.1, cz], [1.2, top + 0.2, 1.2]);
  for (let i = 0; i < parkSpiral.steps; i++) {
    const angle = (i * 20 * Math.PI) / 180;
    addStatic(
      "box",
      [cx + 1.8 * Math.cos(angle), (i + 1) * parkSpiral.rise - 0.1, cz - 1.8 * Math.sin(angle)],
      [2.4, 0.2, 0.9],
      STATIC,
      [0, angle, 0],
    );
  }
}

// --- Grates: bars across the lane with gaps under / near / over the
// 0.84 m capsule diameter. Probes whether the float ray drops through.
export const GRATE_GAPS = [0.3, 0.6, 1.0];
for (const [lane, gap] of GRATE_GAPS.entries()) {
  const x = -42 + lane * 5.5;
  for (let z = BACK_ENTRY_Z - 1; z > BACK_ENTRY_Z - 9; z -= 0.15 + gap) {
    addStatic("box", [x, 0.125, z], [4.5, 0.25, 0.15]);
  }
}

// --- Hills: a buried sphere whose rim meets the ground at 40 deg, and
// cones at 30 deg (walkable) and 60 deg (too steep).
export const parkDome = {
  radius: 8,
  rimDegrees: 40,
  center: [-10, 0, BACK_ENTRY_Z - 10] as Tuple3,
};
addStatic(
  "sphere",
  [
    parkDome.center[0],
    -parkDome.radius * Math.cos((parkDome.rimDegrees * Math.PI) / 180),
    parkDome.center[2],
  ],
  [parkDome.radius * 2, parkDome.radius * 2, parkDome.radius * 2],
);
export const CONE_ANGLES = [30, 60];
for (const [i, degrees] of CONE_ANGLES.entries()) {
  const r = i === 0 ? 4 : 2;
  const h = r * Math.tan((degrees * Math.PI) / 180);
  addStatic("cone", [3 + i * 9, h / 2, BACK_ENTRY_Z - 8], [r * 2, h, r * 2]);
}

// --- Plank bridge: dynamic planks hinged between two decks (component side).
export const parkBridge = {
  x: 54,
  height: 2.5,
  deckA: [54, 1.25, BACK_ENTRY_Z - 3.83] as Tuple3,
  deckB: [54, 1.25, BACK_ENTRY_Z - 14.83] as Tuple3,
  deckSize: [4, 2.5, 3] as Tuple3,
  planks: 12,
  plankSize: [2.4, 0.12, 0.62] as Tuple3,
};
{
  addRamp(parkBridge.x, BACK_ENTRY_Z + 2, 4, 30, parkBridge.height);
  addStatic("box", parkBridge.deckA, parkBridge.deckSize);
  addStatic("box", parkBridge.deckB, parkBridge.deckSize);
}
/** Plank pitch that exactly spans the gap between the decks. */
export const BRIDGE_PITCH =
  (parkBridge.deckA[2] - parkBridge.deckB[2] - parkBridge.deckSize[2]) / parkBridge.planks;

// --- Wall corners (north, behind the portal): acute to obtuse inside
// corners the capsule walks straight into. Probes corner jitter.
export const CORNER_ANGLES = [30, 60, 90, 120];
for (const [i, degrees] of CORNER_ANGLES.entries()) {
  const apexX = -66 + i * 8;
  const apexZ = 38;
  const half = (degrees * Math.PI) / 360;
  const length = 5;
  for (const side of [-1, 1]) {
    addStatic(
      "box",
      [apexX + side * Math.sin(half) * (length / 2), 1.25, apexZ + Math.cos(half) * (length / 2)],
      [0.3, 2.5, length],
      STATIC,
      [0, side * half, 0],
    );
  }
}

export const parkLabels: Array<{ text: string; position: Tuple3 }> = [
  { text: "SLOPES  12 / 25 / 40 / 55 DEG", position: [-21, 0.02, 18.6] },
  { text: "STEPS  .18 / .30 / .48 M", position: [-4.5, 0.02, 18.6] },
  { text: "FUNNEL SQUEEZE", position: [-40, 0.02, 22.6] },
  { text: "ROUGH GROUND", position: [14, 0.02, 18.6] },
  { text: "TERRAIN", position: [38, 0.02, 21.6] },
  { text: "KINEMATIC PLATFORMS", position: [-19.5, 0.02, -6] },
  { text: "PUSHABLE / HEAVY RB + SEESAW", position: [-0.5, 0.02, -6] },
  { text: "ONE-WAY PLATFORMS", position: [16.2, 0.02, -10] },
  { text: "JUMP PADS", position: [31.5, 0.02, -8.5] },
  { text: "CEILINGS 2.4 / 2.1 / 1.8 + WEDGE", position: [-64, 0.02, -26] },
  { text: "LEDGES .5 - 3 M", position: [-45.5, 0.02, -26] },
  { text: "DROP-OFFS", position: [-30, 0.02, -26] },
  { text: "GAPS 1-4 M / CLIMBING", position: [-16.5, 0.02, -26] },
  { text: "BEAMS .12 / .25 / .5 / 1 M", position: [2.5, 0.02, -26] },
  { text: "RIDGES 25/45  VALLEYS 30/60", position: [27.5, 0.02, -26] },
  { text: "SPIKES + LOGS", position: [50, 0.02, -26] },
  { text: "CURBS .1 - .6 M", position: [68.5, 0.02, -26] },
  { text: "IRREGULAR / STEEP / OPEN / SPIRAL", position: [-62, 0.02, -54] },
  { text: "GRATES .3 / .6 / 1 M", position: [-36.5, 0.02, -54] },
  { text: "DOME 40  CONES 30 / 60", position: [1, 0.02, -54] },
  { text: "SWEEPER + FAST PLATFORMS", position: [31, 0.02, -54] },
  { text: "PLANK BRIDGE", position: [54, 0.02, -52] },
  { text: "WALL CORNERS 30 / 60 / 90 / 120", position: [-54, 0.02, 46] },
];

/** Teleport targets for the tuning panel; every lane is walked toward -z. */
export const parkZones: Array<{ name: string; spawn: Tuple3 }> = [
  // Far enough in front of the portal (z=30) that the trailing camera
  // (4.8 m back) stays on the painting's front side.
  { name: "Start", spawn: [0, 0, 21] },
  { name: "Slopes", spawn: [-21, 0, 21] },
  { name: "Steps", spawn: [-4.5, 0, 21] },
  { name: "Funnel", spawn: [-40, 0, 25] },
  { name: "Rough ground", spawn: [14, 0, 21] },
  { name: "Terrain", spawn: [38, 0, 24] },
  { name: "Kinematic platforms", spawn: [-19.5, 0, -3] },
  { name: "Pushables + seesaw", spawn: [-0.5, 0, -3] },
  { name: "One-way + jump pads", spawn: [24, 0, -6] },
  { name: "Low ceilings", spawn: [-64, 0, -23] },
  { name: "Ledges", spawn: [-45.5, 0, -23] },
  { name: "Drop-offs", spawn: [-30, 0, -23] },
  { name: "Gaps", spawn: [-16.5, 0, -23] },
  { name: "Balance beams", spawn: [2.5, 0, -23] },
  { name: "Ridges + valleys", spawn: [27.5, 0, -23] },
  { name: "Spikes + logs", spawn: [50, 0, -23] },
  { name: "Curbs", spawn: [68.5, 0, -23] },
  { name: "Stair variants", spawn: [-62, 0, -51] },
  { name: "Grates", spawn: [-36.5, 0, -51] },
  { name: "Hills", spawn: [1, 0, -51] },
  { name: "Sweeper + fast platforms", spawn: [31, 0, -51] },
  { name: "Plank bridge", spawn: [54, 0, -50] },
  { name: "Wall corners", spawn: [-54, 0, 50] },
];
