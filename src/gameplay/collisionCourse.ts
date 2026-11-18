// Movement test park: isolated skill zones following the common core of
// kinematic character controller test scenes (Jolt's CharacterVirtual
// obstacle course, Rapier's controller guide, DigitalRune's checklist):
//   slope fan around the climb limit, stairs bracketing auto-step, bumps and
//   curbs, walls/corners/funnels, ceilings, moving platforms (translate,
//   lift, spin, tilt, orbit, sweeping wall), dynamic bodies, thin geometry,
//   spawning inside geometry, and terrain. Extras cover this controller's own
//   features (ledge grab, jump pads, one-way boards).
// Every station is data here; `CollisionCourse.tsx` turns it into bodies.
// Each static piece carries its zone / structure / name, and
// `scripts/syncPlaygroundObstacles.ts` writes them to playgroundObstacles.json.

export type Tuple3 = [number, number, number];

export type ParkStaticShape = "box" | "pyramid" | "sphere" | "cylinder" | "cone";

export interface ParkStatic {
  shape: ParkStaticShape;
  position: Tuple3;
  /** Full extents: box w/h/d, pyramid baseW/h/baseD, sphere diameter, cylinder/cone d/h/d. */
  size: Tuple3;
  rotation?: Tuple3;
  color: string;
  /** Hierarchy placement: course zone, the structure within it, and a name. */
  zone: string;
  part?: string;
  name: string;
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
  /** Slope lane this marker sits at the foot of. */
  degrees: number;
}

export const PARK_EXTENT = 85;

const STATIC = "#8a8f96";
const FUNNEL = "#d63c2f";
const DYNAMIC = "#e09543";
const ONE_WAY = "#e0303e";
const JUMP_PAD = "#d926d9";
const WALKABLE = "#2eff5a";
const STALL = "#ffd23e";
const TOO_STEEP = "#ff2e3e";

// Controller limits (gameplay/controllerTuning.ts, CharacterController.tsx).
/** Steepest climbable slope (slopeMaxAngle). */
export const SLOPE_LIMIT_DEG = 50;
/** Sliding starts 5 deg past the climb limit; between the two the capsule stalls. */
export const SLIDE_LIMIT_DEG = SLOPE_LIMIT_DEG + 5;
/** Auto-step height (stepHeight). */
export const STEP_LIMIT = 0.55;

type Meta = { zone: string; part?: string; name: string };

export const parkStatics: ParkStatic[] = [];
export const parkStrips: ParkStrip[] = [];

function addStatic(
  shape: ParkStaticShape,
  position: Tuple3,
  size: Tuple3,
  meta: Meta,
  rotation?: Tuple3,
  color = STATIC,
) {
  parkStatics.push({ shape, position, size, color, rotation, ...meta });
}

/** Names repeated pieces "Step 1", "Step 2"... within one structure. */
function counter(meta: Omit<Meta, "name">, base: string) {
  let n = 0;
  return () => ({ ...meta, name: `${base} ${++n}` });
}

/**
 * Ramp rising toward -z from `entryZ` to `height`; returns the z where the
 * top edge ends. Extra length is buried past the entry edge so there is no
 * lip to trip on.
 */
function addRamp(
  x: number,
  entryZ: number,
  width: number,
  degrees: number,
  height: number,
  meta: Meta,
) {
  const radians = (degrees * Math.PI) / 180;
  const run = height / Math.tan(radians);
  const slopeLength = height / Math.sin(radians);
  const bury = 0.75;
  addStatic(
    "box",
    [x, height / 2 - 0.1 - bury * Math.sin(radians), entryZ - run / 2 + bury * Math.cos(radians)],
    [width, 0.3, slopeLength + bury * 2],
    meta,
    [radians, 0, 0],
  );
  return entryZ - run;
}

// ===========================================================================
// North field
// ===========================================================================

// --- Slope fan: equal height, angles clustered around the limits. Green
// climbs, yellow stalls (too steep to climb, not steep enough to slide),
// red slides back down.
export const SLOPE_ANGLES = [20, 35, 45, 49, 52, 58, 70];
const SLOPE_ENTRY_Z = 16;
const SLOPE_HEIGHT = 3;
export const SLOPE_LANE = { firstX: -28, spacing: 3.3, width: 2.8 };

for (const [lane, degrees] of SLOPE_ANGLES.entries()) {
  const x = SLOPE_LANE.firstX + lane * SLOPE_LANE.spacing;
  addRamp(x, SLOPE_ENTRY_Z, SLOPE_LANE.width, degrees, SLOPE_HEIGHT, {
    zone: "slopes",
    part: `Lane ${degrees}°`,
    name: "Ramp",
  });
  parkStrips.push({
    position: [x, 0.02, SLOPE_ENTRY_Z + 0.7],
    size: [SLOPE_LANE.width, 0.04, 1.2],
    degrees,
    color: degrees <= SLOPE_LIMIT_DEG ? WALKABLE : degrees <= SLIDE_LIMIT_DEG ? STALL : TOO_STEEP,
  });
}

// --- Stairs: risers either side of auto-step. Up, landing, down: the
// descent checks ground snap instead of hopping off each step.
export const STEP_RISERS = [0.15, 0.3, 0.5, 0.6];
const STEP_ENTRY_Z = 16;
const STEP_TREAD = 0.5;
const STEP_WIDTH = 2.6;
const STAIR_RISE = 2.4;

for (const [lane, riser] of STEP_RISERS.entries()) {
  const x = -4 + lane * 3;
  const meta = { zone: "steps", part: `Staircase ${riser.toFixed(2)} m` };
  const count = Math.min(10, Math.round(STAIR_RISE / riser));
  for (let i = 0; i < count; i++) {
    const h = (i + 1) * riser;
    addStatic(
      "box",
      [x, h / 2, STEP_ENTRY_Z - (i + 0.5) * STEP_TREAD],
      [STEP_WIDTH, h, STEP_TREAD + 0.02],
      { ...meta, name: `Step up ${i + 1}` },
    );
  }
  const topH = count * riser;
  const landingEdge = STEP_ENTRY_Z - count * STEP_TREAD;
  addStatic("box", [x, topH - 0.15, landingEdge - 1.1], [STEP_WIDTH, 0.3, 2.2], {
    ...meta,
    name: "Landing",
  });
  for (let i = 0; i < count - 1; i++) {
    const h = topH - (i + 1) * riser;
    addStatic(
      "box",
      [x, h / 2, landingEdge - 2.2 - (i + 0.5) * STEP_TREAD],
      [STEP_WIDTH, h, STEP_TREAD + 0.02],
      { ...meta, name: `Step down ${i + 1}` },
    );
  }
}

// --- Funnel squeeze: two long slanted walls narrowing to a dead-end wedge.
// The 0.4 m exit is narrower than the 0.84 m capsule, so walking in wedges
// the body between two surfaces: a stuck/depenetration test.
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
  const midZ = (parkFunnel.entryZ + parkFunnel.exitZ) / 2;
  const offX = parkFunnel.entryHalfWidth - dx / 2 + parkFunnel.wallThickness / 2;
  for (const side of [-1, 1]) {
    addStatic(
      "box",
      [parkFunnel.centerX + side * offX, parkFunnel.wallHeight / 2, midZ],
      [parkFunnel.wallThickness, parkFunnel.wallHeight, wallLen],
      { zone: "funnel", name: side < 0 ? "Left wall" : "Right wall" },
      // Left wall runs (+dx,-dz), right wall (-dx,-dz): negate per side.
      [0, -side * Math.atan2(dx, -dz), 0],
      parkFunnel.color,
    );
  }
}

// --- Rough ground: pyramids, domes, tilted blocks, poles, low blocks.
{
  const pyramid = counter({ zone: "rough-ground", part: "Pyramid field" }, "Pyramid");
  for (let cx = 0; cx < 4; cx++) {
    for (let rz = 0; rz < 4; rz++) {
      addStatic("pyramid", [8 + cx * 1.5, 0.3, 13.5 - rz * 1.5], [1.3, 0.6, 1.3], pyramid());
    }
  }
  const dome = counter({ zone: "rough-ground", part: "Domes" }, "Dome");
  for (const [x, z] of [
    [15.5, 9.5],
    [17.3, 9.5],
    [16.4, 7.7],
  ] as Array<[number, number]>) {
    addStatic("sphere", [x, 0.35, z], [1.6, 1.6, 1.6], dome());
  }
  const block = counter({ zone: "rough-ground", part: "Tilted blocks" }, "Block");
  for (let i = 0; i < 8; i++) {
    const yaw = ((i * 0.7) % 1) - 0.5;
    const tilt = i % 2 === 0 ? 0.12 : -0.12;
    addStatic(
      "box",
      [19.5 + (i % 4) * 1.6, 0.25, 8 + Math.floor(i / 4) * 1.8],
      [1.1, 0.5, 1.1],
      block(),
      [tilt, yaw, 0],
    );
  }
  const pole = counter({ zone: "rough-ground", part: "Poles" }, "Pole");
  for (let i = 0; i < 6; i++) {
    addStatic("cylinder", [8 + i * 1.1, 0.55, 5.8], [0.14, 1.1, 0.14], pole());
  }
  const low = counter({ zone: "rough-ground", part: "Low blocks" }, "Block");
  for (let i = 0; i < 4; i++) {
    addStatic("box", [8.5 + i * 1.2, 0.175, 4.2], [0.9, 0.35, 0.9], low());
  }
}

// --- Terrain: bumpy checkerboard patch. Height field is pure for testability.
export const parkTerrain = {
  center: [38, 0, 9] as Tuple3,
  size: [22, 22] as [number, number],
  segments: 64,
  edgeFalloff: 3.5,
  /** Raises the patch so most valleys sit above the arena floor instead of under it. */
  baseLift: 0.5,
};

/**
 * Rolling hills: two broad swells, a fine ripple, and one low mound to climb.
 * Peaks reach ~1.7 m and every slope stays under the 50 deg walkable limit.
 */
export function terrainHeight(lx: number, lz: number) {
  return (
    parkTerrain.baseLift +
    0.75 * Math.sin(lx * 0.5) * Math.cos(lz * 0.45) +
    0.3 * Math.sin(lx * 1.2 + lz * 0.75) +
    0.08 * Math.sin(lx * 2.6 - lz * 1.9) +
    0.55 * Math.exp(-((lx + 2) ** 2 + (lz - 1) ** 2) / 30)
  );
}

export function terrainMask(lx: number, lz: number, hx: number, hz: number) {
  const inside = Math.min(hx - Math.abs(lx), hz - Math.abs(lz)) / parkTerrain.edgeFalloff;
  const clamped = Math.min(1, Math.max(0, inside));
  return clamped * clamped * (3 - 2 * clamped);
}

// ===========================================================================
// Middle field: moving platforms, dynamic bodies, one-way boards, pads.
// ===========================================================================

/**
 * Orbiting platform (Jolt's "rotate and orbit"): the deck circles a centre
 * while spinning, so a rider is carried along a curve and turned with it.
 */
export const parkOrbit = {
  center: [-9, 0.8, -15] as Tuple3,
  radius: 2.2,
  speed: 0.6,
  size: [2.6, 0.4, 2.6] as Tuple3,
};

// --- Seesaw fulcrum (the plank itself is a dynamic body in the component).
export const parkSeesaw = {
  fulcrum: { position: [-2, 0.35, -15] as Tuple3, size: [0.8, 0.7, 2.0] as Tuple3 },
  plank: { position: [-2, 0.85, -15] as Tuple3, size: [5.2, 0.25, 1.7] as Tuple3, mass: 5 },
};
addStatic("box", parkSeesaw.fulcrum.position, parkSeesaw.fulcrum.size, {
  zone: "pushables",
  part: "Seesaw",
  name: "Fulcrum",
});

/** A crate resting on a low step: pushing it off tests stepping onto dynamic bodies. */
export const parkCrateStep = {
  step: { position: [6, 0.15, -9] as Tuple3, size: [2, 0.3, 2] as Tuple3 },
  crate: { position: [6, 0.8, -9] as Tuple3, size: [1, 1, 1] as Tuple3, mass: 2 },
};
addStatic("box", parkCrateStep.step.position, parkCrateStep.step.size, {
  zone: "pushables",
  part: "Crate on a step",
  name: "Step",
});

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

// --- Spawn inside geometry (Jolt's "initially intersecting"): the zone spawn
// drops the capsule into a bed of small cubes, and two slabs leaning at
// +-75 deg form a narrow V to walk into. Depenetration must neither launch
// the character nor leave it stuck.
export const parkIntersect = {
  center: [44, 0, -12] as Tuple3,
  cube: 0.2,
  grid: 9,
  spacing: 0.45,
  slabAngle: 75,
};
{
  const [cx, , cz] = parkIntersect.center;
  const cube = counter({ zone: "intersecting", part: "Cube bed" }, "Cube");
  const half = ((parkIntersect.grid - 1) * parkIntersect.spacing) / 2;
  for (let i = 0; i < parkIntersect.grid; i++) {
    for (let j = 0; j < parkIntersect.grid; j++) {
      addStatic(
        "box",
        [
          cx - half + i * parkIntersect.spacing,
          parkIntersect.cube / 2,
          cz - half + j * parkIntersect.spacing,
        ],
        [parkIntersect.cube, parkIntersect.cube, parkIntersect.cube],
        cube(),
      );
    }
  }
  const a = (parkIntersect.slabAngle * Math.PI) / 180;
  const length = 3;
  for (const side of [-1, 1]) {
    addStatic(
      "box",
      [cx + 5 + side * ((length / 2) * Math.cos(a) + 0.15), (length / 2) * Math.sin(a), cz],
      [length, 0.2, 3],
      { zone: "intersecting", part: "Leaning slabs", name: side < 0 ? "Left slab" : "Right slab" },
      // Bottoms nearly touch, tops lean apart: a V the capsule wedges into.
      [0, 0, side * a],
    );
  }
}

// ===========================================================================
// South field: controller stress lanes. Every lane is entered from +z and
// travels toward -z, so zone spawns all face the same way.
// ===========================================================================

/** Slab rising from `z0` toward -z, then back down: a ridge along x. */
function addRidge(x: number, z0: number, width: number, slabLength: number, degrees: number) {
  const a = (degrees * Math.PI) / 180;
  const t = 0.3;
  const w = slabLength;
  const y = (w / 2) * Math.sin(a) - (t / 2) * Math.cos(a);
  const ridgeZ = z0 - w * Math.cos(a);
  const part = `Ridge ${degrees}°`;
  addStatic(
    "box",
    [x, y, z0 - (w / 2) * Math.cos(a) - (t / 2) * Math.sin(a)],
    [width, t, w],
    { zone: "ridges", part, name: "Up slab" },
    [a, 0, 0],
  );
  addStatic(
    "box",
    [x, y, ridgeZ - (w / 2) * Math.cos(a) + (t / 2) * Math.sin(a)],
    [width, t, w],
    { zone: "ridges", part, name: "Down slab" },
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
    addStatic(
      "box",
      [x + side * dx, y, centerZ],
      [slabWidth, t, length],
      { zone: "ridges", part: `Valley ${degrees}°`, name: side < 0 ? "Left slab" : "Right slab" },
      [0, 0, side * a],
    );
  }
}

const SOUTH_ENTRY_Z = -28;

// --- Ceilings: standing height is ~2.04 m (capsule 1.84 + 0.2 float).
// 2.4 clears, 2.1 scrapes, 1.8 blocks. The wedge lane ramps up under a flat
// roof until the gap closes to 1.6 m; the sloped lane lowers its underside
// from 2.6 m to 1.5 m, so a jump under it meets an inclined ceiling.
export const CEILING_CLEARANCES = [2.4, 2.1, 1.8];
export const SLOPED_CEILING = { x: -74, high: 2.6, low: 1.5, length: 6 };
{
  const length = 6;
  const centerZ = SOUTH_ENTRY_Z - 1 - length / 2;
  const walls = (x: number, height: number, part: string) => {
    for (const side of [-1, 1]) {
      addStatic("box", [x + side * 1.35, height / 2, centerZ], [0.3, height, length], {
        zone: "ceilings",
        part,
        name: side < 0 ? "Left wall" : "Right wall",
      });
    }
  };
  for (const [lane, clearance] of CEILING_CLEARANCES.entries()) {
    const x = -70 + lane * 4;
    const part = `Ceiling ${clearance} m`;
    addStatic("box", [x, clearance + 0.15, centerZ], [2.8, 0.3, length], {
      zone: "ceilings",
      part,
      name: "Roof",
    });
    walls(x, clearance + 0.3, part);
  }
  {
    const { x, high, low } = SLOPED_CEILING;
    const tilt = Math.atan2(high - low, length);
    const part = "Sloped ceiling";
    addStatic(
      "box",
      [x, (high + low) / 2 + 0.15, centerZ],
      [2.8, 0.3, Math.hypot(length, high - low)],
      { zone: "ceilings", part, name: "Roof" },
      [-tilt, 0, 0],
    );
    walls(x, high + 0.3, part);
  }
  const x = -58;
  const meta = { zone: "ceilings", part: "Wedge lane" };
  const rampEnd = addRamp(x, SOUTH_ENTRY_Z - 1, 2.8, 15, 1.6, { ...meta, name: "Ramp" });
  addStatic("box", [x, 0.8, rampEnd - 1], [2.8, 1.6, 2], { ...meta, name: "Wedge block" });
  const roofLength = SOUTH_ENTRY_Z - 1 - (rampEnd - 2);
  addStatic("box", [x, 3.35, SOUTH_ENTRY_Z - 1 - roofLength / 2], [2.8, 0.3, roofLength], {
    ...meta,
    name: "Roof",
  });
}

// --- Ledges: jump-height and ledge-grab ladder, 0.5 m to 3 m.
export const LEDGE_HEIGHTS = [0.5, 1, 1.5, 2, 2.5, 3];
for (const [i, h] of LEDGE_HEIGHTS.entries()) {
  addStatic("box", [-52 + i * 2.6, h / 2, SOUTH_ENTRY_Z - 3], [2, h, 2], {
    zone: "ledges",
    name: `Ledge ${h} m`,
  });
}

// --- Drop-offs: a 30 deg ramp to a 4 m deck, then drops of .25/.5/1/2.25.
const DROP_TERRACES = [4, 3.75, 3.25, 2.25];
{
  const x = -30;
  let z = addRamp(x, SOUTH_ENTRY_Z, 3, 30, DROP_TERRACES[0], { zone: "drop-offs", name: "Ramp" });
  for (const h of DROP_TERRACES) {
    addStatic("box", [x, h / 2, z - 1.25], [3, h, 2.5], {
      zone: "drop-offs",
      name: `Terrace ${h} m`,
    });
    z -= 2.5;
  }
}

// --- Gaps: 1.2 m blocks with growing gaps; the second lane also climbs.
const GAP_LANES = [
  { x: -19, gaps: [1, 2, 3, 4], rise: 0, part: "Gap lane 1–4 m" },
  { x: -14, gaps: [1, 1.5, 2, 2.5], rise: 0.5, part: "Climbing lane" },
];
for (const lane of GAP_LANES) {
  let front = addRamp(lane.x, SOUTH_ENTRY_Z, 2.4, 25, 1.2, {
    zone: "gaps",
    part: lane.part,
    name: "Ramp",
  });
  const block = counter({ zone: "gaps", part: lane.part }, "Block");
  let h = 1.2;
  for (let i = 0; i <= lane.gaps.length; i++) {
    addStatic("box", [lane.x, h / 2, front - 1], [2.4, h, 2], block());
    front -= 2 + (lane.gaps[i] ?? 0);
    h += lane.rise;
  }
}

// --- Balance beams at 1.2 m between a shared start and end deck.
const BEAM_WIDTHS = [0.12, 0.25, 0.5, 1.0];
{
  const deckX = 2.5;
  const deckWidth = 12;
  const height = 1.2;
  const beamLength = 12;
  const start = addRamp(deckX, SOUTH_ENTRY_Z, deckWidth, 25, height, {
    zone: "beams",
    name: "Start ramp",
  });
  addStatic("box", [deckX, height / 2, start - 1], [deckWidth, height, 2], {
    zone: "beams",
    name: "Start deck",
  });
  const beamStart = start - 2;
  for (const [lane, width] of BEAM_WIDTHS.entries()) {
    addStatic(
      "box",
      [-2 + lane * 3, height - 0.15, beamStart - beamLength / 2],
      [width, 0.3, beamLength],
      { zone: "beams", part: "Beams", name: `Beam ${width} m` },
    );
  }
  addStatic("box", [deckX, height / 2, beamStart - beamLength - 1], [deckWidth, height, 2], {
    zone: "beams",
    name: "End deck",
  });
}

// --- Ridges (walk over) and valleys (walk along). The 60 deg crevice is
// too steep on both sides: the capsule should settle, not jitter or climb.
const RIDGE_ANGLES = [25, 45];
export const VALLEY_ANGLES = [30, 60];
addRidge(18, SOUTH_ENTRY_Z, 3, 5, RIDGE_ANGLES[0]);
addRidge(24, SOUTH_ENTRY_Z, 3, 3, RIDGE_ANGLES[1]);
addValley(30, SOUTH_ENTRY_Z - 5, 10, 3, VALLEY_ANGLES[0]);
addValley(37, SOUTH_ENTRY_Z - 5, 10, 3, VALLEY_ANGLES[1]);

// --- Spikes (sharp tips under the float ray) and logs (rounded curbs).
{
  const spike = counter({ zone: "spikes-logs", part: "Spike field" }, "Spike");
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      addStatic(
        "pyramid",
        [45 + i * 0.6, 0.45, SOUTH_ENTRY_Z - 2 - j * 0.6],
        [0.5, 0.9, 0.5],
        spike(),
      );
    }
  }
}
const LOG_DIAMETERS = [0.3, 0.6, 1.0, 1.4];
{
  let z = SOUTH_ENTRY_Z - 2;
  for (const d of LOG_DIAMETERS) {
    addStatic(
      "cylinder",
      [55, d / 2 - 0.05, z],
      [d, 4, d],
      { zone: "spikes-logs", part: "Logs", name: `Log ${d} m` },
      [0, 0, Math.PI / 2],
    );
    z -= 2.5 + d;
  }
}

// --- Curbs: single step-ups clustered around the 0.55 m auto-step limit.
export const CURB_HEIGHTS = [0.2, 0.4, 0.5, 0.55, 0.6, 0.7];
for (const [lane, h] of CURB_HEIGHTS.entries()) {
  addStatic("box", [62 + lane * 2.6, h / 2, SOUTH_ENTRY_Z - 4], [2.2, h, 3], {
    zone: "curbs",
    name: `Curb ${h} m`,
  });
}

// ===========================================================================
// Back field
// ===========================================================================

const BACK_ENTRY_Z = -56;

// --- Stair variants: irregular risers, 45 deg steep stairs, open treads
// (nothing under the lip), tight stairs (0.3 m rise on a 0.05 m tread: an
// 80 deg face that must read as a wall, not a ramp) and a spiral.
export const TIGHT_STAIRS = { x: -74, riser: 0.3, tread: 0.05, count: 8 };
const IRREGULAR_RISERS = [0.15, 0.3, 0.12, 0.4, 0.2, 0.35, 0.1, 0.25];
{
  const irregular = counter({ zone: "stairs", part: "Irregular stairs" }, "Step");
  let h = 0;
  for (const [i, riser] of IRREGULAR_RISERS.entries()) {
    h += riser;
    addStatic("box", [-70, h / 2, BACK_ENTRY_Z - (i + 0.5) * 0.8], [2.6, h, 0.82], irregular());
  }
  const steep = counter({ zone: "stairs", part: "Steep stairs" }, "Step");
  for (let i = 0; i < 10; i++) {
    const h2 = (i + 1) * 0.25;
    addStatic("box", [-66, h2 / 2, BACK_ENTRY_Z - (i + 0.5) * 0.25], [2.6, h2, 0.27], steep());
  }
  const open = counter({ zone: "stairs", part: "Open treads" }, "Tread");
  for (let i = 0; i < 10; i++) {
    const h3 = (i + 1) * 0.25;
    addStatic("box", [-62, h3 - 0.04, BACK_ENTRY_Z - (i + 0.5) * 0.7], [2.6, 0.08, 0.72], open());
  }
  const tight = counter({ zone: "stairs", part: "Tight stairs" }, "Step");
  const { x, riser, tread, count } = TIGHT_STAIRS;
  for (let i = 0; i < count; i++) {
    const h4 = (i + 1) * riser;
    addStatic(
      "box",
      [x, h4 / 2, BACK_ENTRY_Z - (i + 0.5) * tread],
      [2.6, h4, tread + 0.01],
      tight(),
    );
  }
}
const parkSpiral = { center: [-54, 0, BACK_ENTRY_Z - 6] as Tuple3, steps: 20, rise: 0.22 };
{
  const [cx, , cz] = parkSpiral.center;
  const top = parkSpiral.steps * parkSpiral.rise;
  addStatic("cylinder", [cx, top / 2 + 0.1, cz], [1.2, top + 0.2, 1.2], {
    zone: "stairs",
    part: "Spiral stair",
    name: "Column",
  });
  const step = counter({ zone: "stairs", part: "Spiral stair" }, "Step");
  for (let i = 0; i < parkSpiral.steps; i++) {
    const angle = (i * 20 * Math.PI) / 180;
    addStatic(
      "box",
      [cx + 1.8 * Math.cos(angle), (i + 1) * parkSpiral.rise - 0.1, cz - 1.8 * Math.sin(angle)],
      [2.4, 0.2, 0.9],
      step(),
      [0, angle, 0],
    );
  }
}

// --- Grates: bars across the lane with gaps under / near / over the
// 0.84 m capsule diameter. Probes whether the float ray drops through.
export const GRATE_GAPS = [0.3, 0.6, 1.0];
for (const [lane, gap] of GRATE_GAPS.entries()) {
  const x = -42 + lane * 5.5;
  const bar = counter({ zone: "grates", part: `Grate ${gap.toFixed(1)} m` }, "Bar");
  for (let z = BACK_ENTRY_Z - 1; z > BACK_ENTRY_Z - 9; z -= 0.15 + gap) {
    addStatic("box", [x, 0.125, z], [4.5, 0.25, 0.15], bar());
  }
}

// --- Hills: a buried sphere whose rim meets the ground at 40 deg, and
// cones at 30 deg (walkable) and 60 deg (too steep).
const parkDome = {
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
  { zone: "hills", name: "Dome 40°" },
);
const CONE_ANGLES = [30, 60];
for (const [i, degrees] of CONE_ANGLES.entries()) {
  const r = i === 0 ? 4 : 2;
  const h = r * Math.tan((degrees * Math.PI) / 180);
  addStatic("cone", [3 + i * 9, h / 2, BACK_ENTRY_Z - 8], [r * 2, h, r * 2], {
    zone: "hills",
    name: `Cone ${degrees}°`,
  });
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
  /** kg; within a few times the player's 10 kg so the hinge chain holds. */
  plankMass: 3,
};
addRamp(parkBridge.x, BACK_ENTRY_Z + 2, 4, 30, parkBridge.height, { zone: "bridge", name: "Ramp" });
addStatic("box", parkBridge.deckA, parkBridge.deckSize, { zone: "bridge", name: "Deck A" });
addStatic("box", parkBridge.deckB, parkBridge.deckSize, { zone: "bridge", name: "Deck B" });
/**
 * The chain is a little longer than the gap, so it hangs in a shallow arc.
 * A chain exactly as long as the gap pulls taut under any load, and the
 * joints stretch: the bridge sinks and lips up at the far end.
 */
export const BRIDGE_SLACK = 1.03;
const bridgeGap = parkBridge.deckA[2] - parkBridge.deckB[2] - parkBridge.deckSize[2];
/** Half-angle of the circular arc whose length is the chain's (sin t / t = gap / length). */
const bridgeArc = (() => {
  const ratio = 1 / BRIDGE_SLACK;
  let lo = 1e-4;
  let hi = Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sin(mid) / mid > ratio) lo = mid;
    else hi = mid;
  }
  return lo;
})();
const bridgeRadius = bridgeGap / (2 * Math.sin(bridgeArc));
/** Hinge-to-hinge length of one plank. */
export const BRIDGE_PITCH = 2 * bridgeRadius * Math.sin(bridgeArc / parkBridge.planks);
/** Hinge points [y, z] from deck A to deck B along the hanging arc (planks + 1). */
export const parkBridgeHinges: Array<[number, number]> = Array.from(
  { length: parkBridge.planks + 1 },
  (_, k) => {
    const phi = -bridgeArc + (2 * bridgeArc * k) / parkBridge.planks;
    const along = bridgeGap / 2 + bridgeRadius * Math.sin(phi);
    const drop = bridgeRadius * (Math.cos(phi) - Math.cos(bridgeArc));
    return [
      parkBridge.height - parkBridge.plankSize[1] / 2 - drop,
      parkBridge.deckA[2] - parkBridge.deckSize[2] / 2 - along,
    ];
  },
);

// ===========================================================================
// West field: walls, corners and clearances.
// ===========================================================================

// --- Wall corners (behind the portal): inside corners the capsule walks
// straight into. Probes corner jitter. (The funnel covers the acute wedge.)
const CORNER_ANGLES = [60, 90, 120];
for (const [i, degrees] of CORNER_ANGLES.entries()) {
  const apexX = -58 + i * 8;
  const apexZ = 38;
  const half = (degrees * Math.PI) / 360;
  const length = 5;
  for (const side of [-1, 1]) {
    addStatic(
      "box",
      [apexX + side * Math.sin(half) * (length / 2), 1.25, apexZ + Math.cos(half) * (length / 2)],
      [0.3, 2.5, length],
      { zone: "corners", part: `Corner ${degrees}°`, name: side < 0 ? "Left wall" : "Right wall" },
      [0, side * half, 0],
    );
  }
}

// --- Wall on a slope: a 30 deg ramp with a wall along one side. Pushing
// diagonally into the wall while climbing must slide along it, no faster
// than walking straight up.
export const WALL_SLOPE = { x: -34, entryZ: 43, degrees: 30, height: 2, width: 3 };
{
  const { x, entryZ, degrees, height, width } = WALL_SLOPE;
  const meta = { zone: "corners", part: "Wall on a slope" };
  const top = addRamp(x, entryZ, width, degrees, height, { ...meta, name: "Ramp" });
  const length = entryZ - top + 1;
  addStatic(
    "box",
    [x + width / 2 + 0.15, (height + 1.5) / 2, entryZ - length / 2],
    [0.3, height + 1.5, length],
    { ...meta, name: "Side wall" },
  );
}

// --- Doorways: one wall per lane with a gap around the 0.84 m capsule.
export const DOORWAY_WIDTHS = [1.2, 0.9, 0.86, 0.8];
const DOORWAY_Z = 12;
const DOORWAY_SPAN = 5;
const DOORWAY_HEIGHT = 2.6;
const DOORWAY_LINTEL = 2.3;
for (const [lane, gap] of DOORWAY_WIDTHS.entries()) {
  const x = -72 + lane * 6;
  const part = `Doorway ${gap} m`;
  const side = (DOORWAY_SPAN - gap) / 2;
  for (const sign of [-1, 1]) {
    addStatic(
      "box",
      [x + sign * (gap / 2 + side / 2), DOORWAY_HEIGHT / 2, DOORWAY_Z],
      [side, DOORWAY_HEIGHT, 0.3],
      { zone: "doorways", part, name: sign < 0 ? "Left wall" : "Right wall" },
    );
  }
  addStatic(
    "box",
    [x, (DOORWAY_LINTEL + DOORWAY_HEIGHT) / 2, DOORWAY_Z],
    [gap, DOORWAY_HEIGHT - DOORWAY_LINTEL, 0.3],
    { zone: "doorways", part, name: "Lintel" },
  );
}

// --- Bumps (Jolt's small and large bumps): a lane of 5 cm lips that must
// not stutter the capsule, and a lane of 30 cm ribs it must step over.
export const BUMP_LANES = [
  { x: -74, height: 0.05, depth: 0.05, spacing: 0.5, count: 20, part: "Small bumps" },
  { x: -70, height: 0.3, depth: 0.1, spacing: 2, count: 6, part: "Large bumps" },
];
for (const lane of BUMP_LANES) {
  const bump = counter({ zone: "bumps", part: lane.part }, "Bump");
  for (let i = 0; i < lane.count; i++) {
    addStatic(
      "box",
      [lane.x, lane.height / 2, -2 - i * lane.spacing],
      [2.6, lane.height, lane.depth],
      bump(),
    );
  }
}

// --- Zig-zag corridor: 1 m wide with 90 deg turns.
/** Zig-zag path on a 1 m grid; walls fill every neighbour cell off the path. */
export const ZIGZAG = { originX: -64, originZ: -2, cell: 1, height: 2.5 };
export const zigzagPath: Array<[number, number]> = [];
{
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, 4],
    [5, 4],
    [5, 8],
    [0, 8],
    [0, 12],
  ];
  for (let i = 1; i < corners.length; i++) {
    const [ax, az] = corners[i - 1];
    const [bx, bz] = corners[i];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
    for (let t = i === 1 ? 0 : 1; t <= steps; t++) {
      zigzagPath.push([ax + Math.sign(bx - ax) * t, az + Math.sign(bz - az) * t]);
    }
  }
  const onPath = new Set(zigzagPath.map(([cx, cz]) => `${cx},${cz}`));
  const [startX, startZ] = zigzagPath[0];
  const [endX, endZ] = zigzagPath[zigzagPath.length - 1];
  // Leave the cells just outside each end open as the entrance and exit.
  onPath.add(`${startX},${startZ - 1}`);
  onPath.add(`${endX},${endZ + 1}`);
  const walls = new Set<string>();
  for (const [cx, cz] of zigzagPath) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (!onPath.has(key)) walls.add(key);
      }
    }
  }
  // Merge each row of wall cells into runs: far fewer pieces, same shape.
  const rows = new Map<number, number[]>();
  for (const key of walls) {
    const [cx, cz] = key.split(",").map(Number);
    rows.set(cz, [...(rows.get(cz) ?? []), cx]);
  }
  const wall = counter({ zone: "corridors", part: "Zig-zag 1 m" }, "Wall");
  for (const cz of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = rows.get(cz)!.sort((a, b) => a - b);
    let runStart = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === xs[i - 1] + 1) continue;
      const runEnd = xs[i - 1];
      const { originX, originZ, cell, height } = ZIGZAG;
      addStatic(
        "box",
        [originX + ((runStart + runEnd) / 2) * cell, height / 2, originZ - cz * cell],
        [(runEnd - runStart + 1) * cell, height, cell],
        wall(),
      );
      runStart = xs[i];
    }
  }
}

// ===========================================================================
// East field: moving-platform edge cases, physics props, thin geometry.
// ===========================================================================

// --- Crusher: an elevator rising until the gap under a fixed roof is
// shorter than the standing capsule (~2.04 m): depenetration under load.
export const parkCrusher = {
  platform: { position: [58, 1.4, 6] as Tuple3, size: [3, 0.4, 3] as Tuple3, distance: 1 },
  roofHeight: 4.4,
};
{
  const [x, , z] = parkCrusher.platform.position;
  const meta = { zone: "platform-edges", part: "Crusher" };
  addStatic("box", [x, parkCrusher.roofHeight + 0.15, z], [4, 0.3, 4], { ...meta, name: "Roof" });
  const post = counter(meta, "Post");
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    addStatic(
      "box",
      [x + dx * 1.85, parkCrusher.roofHeight / 2, z + dz * 1.85],
      [0.3, parkCrusher.roofHeight, 0.3],
      post(),
    );
  }
}

// --- Wall scraper: a shuttle passes under a wall that a rider cannot.
export const parkScraper = {
  platform: { position: [66, 1, 6] as Tuple3, size: [2.6, 0.4, 2.6] as Tuple3, distance: 3 },
  wallBottom: 1.6,
  wallTop: 3.6,
};
addStatic(
  "box",
  [
    parkScraper.platform.position[0],
    (parkScraper.wallBottom + parkScraper.wallTop) / 2,
    parkScraper.platform.position[2],
  ],
  [0.3, parkScraper.wallTop - parkScraper.wallBottom, 4],
  { zone: "platform-edges", part: "Wall scraper", name: "Scraper wall" },
);

/** Fast reversing lift (Jolt's 3 m/s vertical): ground snap as the floor drops away. */
export const parkFastElevator = {
  position: [72, 2.2, 6] as Tuple3,
  size: [3, 0.4, 3] as Tuple3,
  distance: 2,
  speed: 2.2,
};

// --- Physics props: ball pit and domino run.
export const parkBallPit = {
  center: [59, 0, 23] as Tuple3,
  size: 6,
  wallHeight: 0.7,
  ballDiameter: 0.6,
  balls: 36,
};
{
  const [x, , z] = parkBallPit.center;
  const half = parkBallPit.size / 2;
  const h = parkBallPit.wallHeight;
  const meta = { zone: "physics-props", part: "Ball pit" };
  const long: Tuple3 = [parkBallPit.size + 0.3, h, 0.3];
  const short: Tuple3 = [0.3, h, parkBallPit.size - 0.3];
  addStatic("box", [x, h / 2, z - half], long, { ...meta, name: "Back rail" });
  addStatic("box", [x, h / 2, z + half], long, { ...meta, name: "Front rail" });
  addStatic("box", [x - half, h / 2, z], short, { ...meta, name: "Left rail" });
  addStatic("box", [x + half, h / 2, z], short, { ...meta, name: "Right rail" });
}

export const parkDominoes = Array.from({ length: 12 }, (_, i) => ({
  position: [66, 0.8, 27 - i * 0.75] as Tuple3,
  size: [0.9, 1.6, 0.18] as Tuple3,
  mass: 1.5,
}));

// --- Thin geometry against fast motion (tunnelling).
export const THIN = 0.05;
/** Stronger than any jump pad station pad; the thin ledge is reached by drifting off it. */
export const parkSuperPads: ParkJumpPad[] = [
  { position: [60, 0.075, -11], size: [2.2, 0.15, 2.2], strength: 26, color: JUMP_PAD },
];
addStatic("box", [60, 9, -11], [4, THIN, 4], { zone: "tunnelling", name: "Thin roof" });
addStatic("box", [63.6, 5, -11], [3, THIN, 3], { zone: "tunnelling", name: "Thin ledge" });
addStatic("box", [71, 1.5, -14], [4, 3, THIN], { zone: "tunnelling", name: "Thin wall" });

// ===========================================================================
// Combat field: a fenced ring for melee, lock-on and line-of-sight tests.
// Enemies (gameplay/combatArena.ts) stay inside the fence; the gate faces
// the spawn on the -z side. Pillars break line of sight and lock-on.
// ===========================================================================
export const parkArena = {
  center: [-66, 0, 66] as Tuple3,
  radius: 10,
  /** Fence segments around the ring; the ones over the gate are left out. */
  segments: 20,
  gateHalfAngle: 0.3,
  fenceHeight: 1.1,
  pillarRadius: 0.7,
  pillars: [
    [-71, 64],
    [-61, 64],
    [-68.5, 70],
  ] as Array<[number, number]>,
};
{
  const { center, radius, segments, gateHalfAngle, fenceHeight } = parkArena;
  const fence = counter({ zone: "combat", part: "Fence" }, "Fence");
  const chord = 2 * radius * Math.sin(Math.PI / segments) + 0.15;
  for (let i = 0; i < segments; i++) {
    // Angle 0 points at -z, toward the spawn; the gate sits there.
    const angle = ((i + 0.5) / segments) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < gateHalfAngle) continue;
    addStatic(
      "box",
      [center[0] + Math.sin(angle) * radius, fenceHeight / 2, center[2] - Math.cos(angle) * radius],
      [chord, fenceHeight, 0.3],
      fence(),
      [0, -angle, 0],
    );
  }
  const pillar = counter({ zone: "combat", part: "Pillars" }, "Pillar");
  for (const [x, z] of parkArena.pillars)
    addStatic(
      "cylinder",
      [x, 1.5, z],
      [parkArena.pillarRadius * 2, 3, parkArena.pillarRadius * 2],
      pillar(),
    );
}

/** Floor captions; `zone` places each in its course zone (trees place their own). */
export const parkLabels: Array<{ text: string; position: Tuple3; zone?: string }> = [
  { text: "SLOPES 20 / 35 / 45 / 49 / 52 / 58 / 70", position: [-18, 0.02, 18.6], zone: "slopes" },
  { text: "STAIRS .15 / .30 / .50 / .60 M", position: [0.5, 0.02, 18.6], zone: "steps" },
  { text: "FUNNEL SQUEEZE", position: [-40, 0.02, 22.6], zone: "funnel" },
  { text: "ROUGH GROUND", position: [16, 0.02, 18.6], zone: "rough-ground" },
  { text: "TERRAIN", position: [38, 0.02, 21.6], zone: "terrain" },
  { text: "MOVING PLATFORMS", position: [-17, 0.02, -6], zone: "kinematic" },
  { text: "PUSHABLE / HEAVY / ON A STEP + SEESAW", position: [1.5, 0.02, -6], zone: "pushables" },
  { text: "ONE-WAY PLATFORMS", position: [16.2, 0.02, -10], zone: "one-way" },
  { text: "JUMP PADS", position: [31.5, 0.02, -8.5], zone: "jump-pads" },
  { text: "SPAWN INSIDE GEOMETRY", position: [46, 0.02, -6.5], zone: "intersecting" },
  {
    text: "CEILINGS 2.4 / 2.1 / 1.8 + SLOPED + WEDGE",
    position: [-66, 0.02, -26],
    zone: "ceilings",
  },
  { text: "LEDGES .5 - 3 M", position: [-45.5, 0.02, -26], zone: "ledges" },
  { text: "DROP-OFFS", position: [-30, 0.02, -26], zone: "drop-offs" },
  { text: "GAPS 1-4 M / CLIMBING", position: [-16.5, 0.02, -26], zone: "gaps" },
  { text: "BEAMS .12 / .25 / .5 / 1 M", position: [2.5, 0.02, -26], zone: "beams" },
  { text: "RIDGES 25/45  VALLEYS 30/60", position: [27.5, 0.02, -26], zone: "ridges" },
  { text: "SPIKES + LOGS", position: [50, 0.02, -26], zone: "spikes-logs" },
  { text: "CURBS .2 - .7 M", position: [68.5, 0.02, -26], zone: "curbs" },
  { text: "TIGHT / IRREGULAR / STEEP / OPEN / SPIRAL", position: [-64, 0.02, -54], zone: "stairs" },
  { text: "GRATES .3 / .6 / 1 M", position: [-36.5, 0.02, -54], zone: "grates" },
  { text: "DOME 40  CONES 30 / 60", position: [1, 0.02, -54], zone: "hills" },
  { text: "SWEEPER BAR", position: [27, 0.02, -57], zone: "sweeper" },
  { text: "PLANK BRIDGE", position: [54, 0.02, -52], zone: "bridge" },
  { text: "CORNERS 60 / 90 / 120 + WALL ON SLOPE", position: [-46, 0.02, 46], zone: "corners" },
  { text: "DOORWAYS 1.2 / .9 / .86 / .8 M", position: [-63, 0.02, 16], zone: "doorways" },
  { text: "BUMPS 5 CM / 30 CM", position: [-72, 0.02, 2.4], zone: "bumps" },
  { text: "ZIG-ZAG CORRIDOR 1 M", position: [-60.5, 0.02, 0.5], zone: "corridors" },
  { text: "PHYSICS PROPS", position: [65, 0.02, 30], zone: "physics-props" },
  { text: "CRUSHER / SCRAPER / FAST LIFT", position: [65, 0.02, 11], zone: "platform-edges" },
  { text: "THIN ROOF / LEDGE / WALL", position: [65, 0.02, -6], zone: "tunnelling" },
  { text: "COMBAT ARENA", position: [-66, 0.02, 54.5], zone: "combat" },
  { text: "LIVE TREE  /  LEVA", position: [-5, 0.02, 48] },
  { text: "BROAD CANOPY", position: [12, 0.02, 48] },
  { text: "SPREADING CANOPY", position: [27, 0.02, 48] },
  { text: "DARK EVERGREEN", position: [42, 0.02, 48] },
  { text: "YOUNG CANOPY", position: [57, 0.02, 48] },
  { text: "LIVE HALLOWEEN", position: [-5, 0.02, 76] },
  { text: "HALLOWEEN BROAD", position: [12, 0.02, 76] },
  { text: "HALLOWEEN SPREADING", position: [27, 0.02, 76] },
  { text: "HALLOWEEN EVERGREEN", position: [42, 0.02, 76] },
  { text: "HALLOWEEN YOUNG", position: [57, 0.02, 76] },
];

/** Teleport targets for the tuning panel; every lane is walked toward -z. */
export type ParkField =
  | "North"
  | "Middle"
  | "South"
  | "Back"
  | "West"
  | "East"
  | "Combat"
  | "Showcase";

export const parkZones: Array<{
  name: string;
  field: ParkField;
  spawn: Tuple3;
  /** The spawn deliberately overlaps geometry (depenetration test). */
  insideGeometry?: boolean;
}> = [
  // Far enough in front of the portal (z=30) that the trailing camera
  // (4.8 m back) stays on the painting's front side.
  { name: "Start", field: "North", spawn: [0, 0, 23] },
  { name: "Slopes", field: "North", spawn: [-18, 0, 21] },
  { name: "Stairs", field: "North", spawn: [0.5, 0, 21] },
  { name: "Funnel", field: "North", spawn: [-40, 0, 25] },
  { name: "Rough ground", field: "North", spawn: [16, 0, 21] },
  { name: "Terrain", field: "North", spawn: [38, 0, 24] },
  { name: "Moving platforms", field: "Middle", spawn: [-17, 0, -3] },
  { name: "Pushables + seesaw", field: "Middle", spawn: [1.5, 0, -3] },
  { name: "One-way + jump pads", field: "Middle", spawn: [24, 0, -6] },
  {
    name: "Spawn inside geometry",
    field: "Middle",
    spawn: [parkIntersect.center[0], 0, parkIntersect.center[2]],
    insideGeometry: true,
  },
  { name: "Ceilings", field: "South", spawn: [-66, 0, -23] },
  { name: "Ledges", field: "South", spawn: [-45.5, 0, -23] },
  { name: "Drop-offs", field: "South", spawn: [-30, 0, -23] },
  { name: "Gaps", field: "South", spawn: [-16.5, 0, -23] },
  { name: "Balance beams", field: "South", spawn: [2.5, 0, -23] },
  { name: "Ridges + valleys", field: "South", spawn: [27.5, 0, -23] },
  { name: "Spikes + logs", field: "South", spawn: [50, 0, -23] },
  { name: "Curbs", field: "South", spawn: [68.5, 0, -23] },
  { name: "Stair variants", field: "Back", spawn: [-64, 0, -51] },
  { name: "Grates", field: "Back", spawn: [-36.5, 0, -51] },
  { name: "Hills", field: "Back", spawn: [1, 0, -51] },
  { name: "Sweeper", field: "Back", spawn: [27, 0, -54] },
  { name: "Plank bridge", field: "Back", spawn: [54, 0, -50] },
  { name: "Walls + corners", field: "West", spawn: [-46, 0, 50] },
  { name: "Doorways", field: "West", spawn: [-63, 0, 19] },
  { name: "Bumps", field: "West", spawn: [-72, 0, 4.5] },
  { name: "Zig-zag corridor", field: "West", spawn: [-64, 0, 2.5] },
  { name: "Physics props", field: "East", spawn: [65, 0, 32] },
  { name: "Platform edge cases", field: "East", spawn: [65, 0, 13.5] },
  { name: "Thin geometry", field: "East", spawn: [65, 0, -3.5] },
  // Outside the gate, so the foes are seen before they notice you.
  { name: "Combat arena", field: "Combat", spawn: [-66, 0, 52] },
  { name: "Tree lab", field: "Showcase", spawn: [-5, 0, 57] },
  { name: "Custom trees", field: "Showcase", spawn: [34, 0, 57] },
  { name: "Halloween trees", field: "Showcase", spawn: [34, 0, 77] },
];

/** Index of the zone whose spawn is nearest on the ground plane. */
export function nearestZone(x: number, z: number) {
  let best = 0;
  let bestDistance = Infinity;
  for (const [i, zone] of parkZones.entries()) {
    const distance = (zone.spawn[0] - x) ** 2 + (zone.spawn[2] - z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
