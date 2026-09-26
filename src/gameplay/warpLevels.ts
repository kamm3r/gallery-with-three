// The Warp Room's five levels, as data. Every level runs from the spawn
// toward -Z, like a Crash Bandicoot 2 corridor. The renderer and the pure run
// logic (warpRun.ts) both read these tables; tests check that every gap is
// jumpable and every pickup sits on something.

export type Vec3 = [number, number, number];

/** Static ground block. `top` is the walkable surface height. */
export interface Solid {
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
  bottom?: number;
  /** Visual only: walls and trim don't count as floor for the path check. */
  wall?: boolean;
}

/** Kinematic platform. Oscillates `distance` along `axis` (sin), like KinematicPlatform. */
export interface Mover {
  x: number;
  z: number;
  /** Top surface height at rest. */
  top: number;
  w: number;
  d: number;
  axis: "x" | "y" | "z";
  distance: number;
  speed: number;
  phase?: number;
}

export type CrateKind =
  | "basic" // fruit
  | "bonus" // "?" crate: a handful of fruit
  | "bounce" // wooden arrow crate: bounces, breaks after a few hops or a spin
  | "spring" // iron arrow crate: bounces forever, never breaks, not counted
  | "check" // checkpoint
  | "aku" // mask: absorbs one hit
  | "tnt" // stomp lights a 3s fuse, spin blows it at once
  | "nitro"; // touch it and it explodes; not counted

export interface Crate {
  x: number;
  /** Bottom of the crate. */
  y: number;
  z: number;
  kind: CrateKind;
}

export type EnemyKind = "turtle" | "seal" | "rat" | "vulture" | "monkey";

export interface Enemy {
  kind: EnemyKind;
  x: number;
  /** Ground height it walks on. */
  y: number;
  z: number;
  axis: "x" | "z";
  /** Half the patrol length. */
  range: number;
  speed: number;
  /** 0..1 offset into the patrol loop. */
  phase?: number;
  /** Spiked back: stomping hurts, only a spin clears it. */
  spiky?: boolean;
}

export interface Boulder {
  /** Where the boulder waits (its center z). */
  startZ: number;
  /** The chase starts when the player's z drops below this. */
  triggerZ: number;
  speed: number;
  radius: number;
  /** The boulder crashes into the canyon wall here and stops. */
  endZ: number;
}

export interface LevelTheme {
  sky: string;
  fog: [number, number];
  ground: string;
  groundSide: string;
  trim: string;
  deco: "jungle" | "snow" | "sewer" | "canyon" | "ruins";
  enemy: string;
  light: string;
  sun: number;
  hemi: [string, string];
}

export interface WarpLevel {
  id: WarpLevelId;
  index: number;
  name: string;
  blurb: string;
  image: string;
  theme: LevelTheme;
  spawn: Vec3;
  /** Falling below this height is a death. */
  killY: number;
  solids: Solid[];
  movers: Mover[];
  crates: Crate[];
  fruit: Vec3[];
  enemies: Enemy[];
  crystal: Vec3;
  /** Exit portal base (ground under the painting); faces +Z. */
  exit: Vec3;
  boulder?: Boulder;
  /** Centerline the player follows, [x, z] waypoints. Used by tests and bots. */
  path: [number, number][];
}

export const WARP_LEVEL_IDS = ["turtle", "snow", "pits", "boulder", "ruins"] as const;
export type WarpLevelId = (typeof WARP_LEVEL_IDS)[number];

export const CRATE_SIZE = 0.9;
export const PIT_BOTTOM = -16;

/** Ground running from zFrom down to zTo (zFrom > zTo). */
function seg(zFrom: number, zTo: number, top = 0, w = 6, x = 0): Solid {
  return { x, z: (zFrom + zTo) / 2, w, d: zFrom - zTo, top, bottom: PIT_BOTTOM };
}

/** A square block (stepping stones, stairs). */
function block(x: number, z: number, size: number, top: number): Solid {
  return { x, z, w: size, d: size, top, bottom: PIT_BOTTOM };
}

/** Tall side walls along a stretch, visual and solid. */
function walls(zFrom: number, zTo: number, halfWidth: number, height: number, top = 0): Solid[] {
  return [-1, 1].map((side) => ({
    x: side * (halfWidth + 0.5),
    z: (zFrom + zTo) / 2,
    w: 1,
    d: zFrom - zTo,
    top: top + height,
    bottom: PIT_BOTTOM,
    wall: true,
  }));
}

/** A row of fruit between two points, floating a little over the ground. */
function fruitLine(from: Vec3, to: Vec3, count: number): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ] as Vec3;
  });
}

/** Fruit hanging along a jump arc across a gap. */
function fruitArc(x: number, zFrom: number, zTo: number, ground: number, count = 4): Vec3[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    return [x, ground + 0.8 + Math.sin(t * Math.PI) * 1.1, zFrom + (zTo - zFrom) * t] as Vec3;
  });
}

const c = (x: number, y: number, z: number, kind: CrateKind = "basic"): Crate => ({
  x,
  y,
  z,
  kind,
});

const turtleWoods: WarpLevel = {
  id: "turtle",
  index: 0,
  name: "Turtle Woods",
  blurb: "A mossy jungle trail. Mind the turtles.",
  image: "/assets/tree.jpg",
  theme: {
    sky: "#8fc7c0",
    fog: [30, 95],
    ground: "#8a6a3e",
    groundSide: "#5b4128",
    trim: "#4f8a3a",
    deco: "jungle",
    enemy: "#3f8f48",
    light: "#fff1d0",
    sun: 2.4,
    hemi: ["#e8f6e0", "#3d4f2e"],
  },
  spawn: [0, 0, 3],
  killY: -4,
  solids: [
    seg(7, -18),
    seg(-20.2, -34),
    seg(-34, -44, 0.9),
    seg(-46.2, -58, 0.9, 1.8),
    seg(-58, -72, 0.9, 7),
    seg(-74.2, -94, 0.9, 8),
    // A mossy ledge above the clearing, reached from the bounce crate.
    { x: -3.2, z: -66, w: 2.2, d: 5, top: 3.6, bottom: 0.9 },
  ],
  movers: [],
  crates: [
    c(-1.3, 0, -6),
    c(1.3, 0, -6, "bonus"),
    c(1.9, 0, -10),
    c(1.9, CRATE_SIZE, -10),
    c(2.2, 0, -13.5, "aku"),
    c(0, 0, -24, "bonus"),
    c(1.8, 0, -29, "check"),
    c(-2, 0, -31),
    c(-2, CRATE_SIZE, -31),
    c(1.5, 0.9, -38),
    c(-1.5, 0.9, -61.5, "spring"),
    c(1.8, 0.9, -60),
    c(2.6, 0.9, -63),
    c(2.6, 1.8, -63),
    c(-3.2, 3.6, -65),
    c(-3.2, 3.6, -67, "bonus"),
    c(1.5, 0.9, -70, "check"),
    c(-2.5, 0.9, -78),
    c(2.5, 0.9, -78),
  ],
  fruit: [
    ...fruitLine([0, 1, -1], [0, 1, -4], 3),
    ...fruitLine([0, 1, -14], [0, 1, -17], 3),
    ...fruitArc(0, -17.6, -20.6, 0),
    ...fruitLine([0, 1, -22], [0, 1, -32], 5),
    ...fruitLine([0, 1.9, -47], [0, 1.9, -57], 6),
    ...fruitLine([-1.5, 3.5, -61.5], [-1.5, 6, -61.5], 4),
    ...fruitArc(0, -71.6, -74.6, 0.9),
    ...fruitLine([0, 1.9, -76], [0, 1.9, -82], 4),
  ],
  enemies: [
    { kind: "turtle", x: 0, y: 0, z: -16, axis: "x", range: 2, speed: 1.3 },
    { kind: "turtle", x: 0, y: 0.9, z: -41, axis: "x", range: 2.2, speed: 1.4, phase: 0.5 },
    { kind: "turtle", x: 0, y: 0.9, z: -66, axis: "x", range: 1.8, speed: 1.5, phase: 0.25 },
  ],
  crystal: [0, 2.1, -84],
  exit: [0, 0.9, -90],
  path: [
    [0, 3],
    [0, -90],
  ],
};

const snowGo: WarpLevel = {
  id: "snow",
  index: 1,
  name: "Snow Go",
  blurb: "Frozen ridges and drifting ice floes over the void.",
  image: "/assets/plaster.jpg",
  theme: {
    sky: "#c9dcef",
    fog: [26, 90],
    ground: "#eef4fb",
    groundSide: "#9fb4cb",
    trim: "#7fa3c4",
    deco: "snow",
    enemy: "#6d7f96",
    light: "#f4f8ff",
    sun: 2.1,
    hemi: ["#f4f8ff", "#6f8195"],
  },
  spawn: [0, 0, 3],
  killY: -4,
  solids: [
    seg(7, -14),
    seg(-26, -40),
    block(-1.2, -42.2, 2.2, 0.5),
    block(1.2, -45.4, 2.2, 1.0),
    block(-1.2, -48.6, 2.2, 1.5),
    seg(-50.8, -66, 1.5),
    seg(-78, -94, 1.5, 8),
  ],
  movers: [
    // Ice floe shuttling across the first chasm.
    { x: 0, z: -20, top: 0, w: 3, d: 3, axis: "z", distance: 3.6, speed: 0.9 },
    // Two floes sliding side to side, out of step with each other.
    { x: 0, z: -69.2, top: 1.5, w: 3.2, d: 3.5, axis: "x", distance: 2.2, speed: 0.8 },
    {
      x: 0,
      z: -74.8,
      top: 1.5,
      w: 3.2,
      d: 3.5,
      axis: "x",
      distance: 2.2,
      speed: 0.8,
      phase: Math.PI,
    },
  ],
  crates: [
    c(-1.5, 0, -5),
    c(1.5, 0, -5),
    c(1.5, CRATE_SIZE, -5, "bonus"),
    c(-2.2, 0, -12, "aku"),
    c(1.8, 0, -29, "check"),
    c(-1.6, 0, -33),
    c(0, 0, -36, "tnt"),
    c(2, 0, -38.5, "bonus"),
    c(-2, 1.5, -54),
    c(-2, 1.5 + CRATE_SIZE, -54),
    c(2, 1.5, -57, "check"),
    c(0, 1.5, -62, "bounce"),
    c(-2.6, 1.5, -64),
    c(2.5, 1.5, -82),
    c(-2.5, 1.5, -82, "bonus"),
  ],
  fruit: [
    ...fruitLine([0, 1, -1], [0, 1, -10], 5),
    ...fruitLine([0, 1.2, -16], [0, 1.2, -24], 4),
    ...fruitLine([0, 1, -30], [0, 1, -39], 4),
    [-1.2, 1.6, -42.2],
    [1.2, 2.1, -45.4],
    [-1.2, 2.6, -48.6],
    ...fruitLine([0, 4.5, -62], [0, 6.5, -62], 3),
    ...fruitLine([0, 2.7, -68], [0, 2.7, -76], 4),
  ],
  enemies: [
    { kind: "seal", x: 0, y: 0, z: -9, axis: "x", range: 2.2, speed: 1.5 },
    { kind: "seal", x: 0, y: 0, z: -34, axis: "x", range: 1.8, speed: 1.2, phase: 0.5 },
    { kind: "seal", x: 0, y: 1.5, z: -59, axis: "x", range: 2.2, speed: 1.8, phase: 0.3 },
    { kind: "seal", x: 0, y: 1.5, z: -86, axis: "x", range: 2.6, speed: 1.6 },
  ],
  crystal: [0, 2.7, -88],
  exit: [0, 1.5, -92],
  path: [
    [0, 3],
    [0, -40],
    [-1.2, -42.2],
    [1.2, -45.4],
    [-1.2, -48.6],
    [0, -52],
    [0, -92],
  ],
};

const thePits: WarpLevel = {
  id: "pits",
  index: 2,
  name: "The Pits",
  blurb: "Down in the sewers, rats and rising lifts.",
  image: "/assets/sweesh.jpg",
  theme: {
    sky: "#1d2622",
    fog: [14, 60],
    ground: "#5f6b5c",
    groundSide: "#39433a",
    trim: "#7a8a52",
    deco: "sewer",
    enemy: "#6b5a55",
    light: "#d7f0c2",
    sun: 1.3,
    hemi: ["#b6d1a8", "#1b231c"],
  },
  spawn: [0, 0, 3],
  killY: -4,
  solids: [
    seg(7, -12),
    seg(-24, -36),
    seg(-36, -50, 3),
    seg(-52.2, -66, 3),
    seg(-66, -86, 0, 7),
    ...walls(7, -86, 3, 6),
  ],
  movers: [
    { x: 0, z: -15.2, top: 0, w: 3, d: 3, axis: "y", distance: 1.1, speed: 1.1 },
    { x: 0, z: -20.8, top: 0, w: 3, d: 3, axis: "y", distance: 1.1, speed: 1.1, phase: Math.PI },
  ],
  crates: [
    c(-1.5, 0, -4),
    c(1.5, 0, -4, "bonus"),
    c(0, 0, -8),
    c(1.8, 0, -27, "check"),
    c(-1.8, 0, -29),
    c(-1.8, CRATE_SIZE, -29),
    // Iron arrow crate: the only way onto the upper walkway.
    c(0, 0, -34.2, "spring"),
    c(-2, 0, -33, "aku"),
    c(-2.3, 3, -39, "nitro"),
    c(2.3, 3, -42, "nitro"),
    c(-2.1, 3, -45),
    c(-2.1, 3 + CRATE_SIZE, -45, "bonus"),
    c(2.3, 3, -48, "nitro"),
    c(-1.6, 3, -56, "check"),
    c(1.4, 3, -59, "tnt"),
    c(-1.8, 3, -62),
    c(2, 0, -72),
    c(-2, 0, -72),
    c(0, 0, -76, "bounce"),
  ],
  fruit: [
    ...fruitLine([0, 1, -1], [0, 1, -10], 4),
    ...fruitLine([0, 1.5, -15.2], [0, 1.5, -20.8], 3),
    ...fruitLine([0, 1, -25], [0, 1, -31], 3),
    ...fruitLine([0, 3.6, -34.2], [0, 5, -34.2], 3),
    ...fruitLine([0, 4, -38], [0, 4, -43], 3),
    ...fruitArc(0, -49.6, -52.6, 3),
    ...fruitLine([0, 1, -68], [0, 1, -74], 3),
    ...fruitLine([0, 3, -76], [0, 5, -76], 3),
  ],
  enemies: [
    { kind: "rat", x: 0, y: 0, z: -6, axis: "x", range: 2.2, speed: 2.4 },
    { kind: "rat", x: 0, y: 0, z: -31.5, axis: "x", range: 2.2, speed: 2.6, phase: 0.4 },
    { kind: "rat", x: 0, y: 3, z: -46.8, axis: "x", range: 1.8, speed: 2.2 },
    { kind: "rat", x: 0, y: 0, z: -69, axis: "x", range: 2.6, speed: 2.8, phase: 0.6 },
  ],
  crystal: [0, 1.2, -80],
  exit: [0, 0, -84],
  path: [
    [0, 3],
    [0, -84],
  ],
};

const boulderDash: WarpLevel = {
  id: "boulder",
  index: 3,
  name: "Boulder Dash",
  blurb: "A narrow canyon. Something big rolls behind you.",
  image: "/assets/fieldhouse.jpg",
  theme: {
    sky: "#f0b67f",
    fog: [34, 110],
    ground: "#b8784a",
    groundSide: "#7c4b2c",
    trim: "#d49b62",
    deco: "canyon",
    enemy: "#8b5a2b",
    light: "#ffd9a8",
    sun: 2.6,
    hemi: ["#ffe6c7", "#5a3524"],
  },
  spawn: [0, 0, 6],
  killY: -4,
  solids: [
    seg(20, -20, 0, 5),
    seg(-22, -44, 0, 5),
    seg(-46, -70, 0, 5),
    seg(-72, -104, 0, 5),
    ...walls(20, -104, 2.5, 7),
  ],
  movers: [],
  crates: [
    c(-1.6, 0, -6),
    c(1.6, 0, -12, "bonus"),
    c(-1.6, 0, -28),
    c(1.6, 0, -34),
    c(-1.6, 0, -52, "bonus"),
    c(1.6, 0, -64),
    c(-1.6, 0, -80),
    c(1.6, 0, -88),
  ],
  fruit: [
    ...fruitLine([0, 1, 0], [0, 1, -16], 6),
    ...fruitArc(0, -18.6, -23.4, 0),
    ...fruitLine([0, 1, -26], [0, 1, -40], 5),
    ...fruitArc(0, -42.6, -47.4, 0),
    ...fruitLine([0, 1, -50], [0, 1, -66], 5),
    ...fruitArc(0, -68.6, -73.4, 0),
    ...fruitLine([0, 1, -76], [0, 1, -92], 5),
  ],
  enemies: [],
  crystal: [0, 1.2, -58],
  exit: [0, 0, -99],
  boulder: { startZ: 13, triggerZ: 0, speed: 3.7, radius: 2.3, endZ: -88 },
  path: [
    [0, 6],
    [0, -99],
  ],
};

const roadToRuin: WarpLevel = {
  id: "ruins",
  index: 4,
  name: "Road to Ruin",
  blurb: "Crumbling temple steps, powder kegs and monkeys.",
  image: "/assets/mankey.jpg",
  theme: {
    sky: "#b9a7c9",
    fog: [28, 100],
    ground: "#a39a86",
    groundSide: "#6c6557",
    trim: "#6f8c4d",
    deco: "ruins",
    enemy: "#8a5a3a",
    light: "#ffe8cc",
    sun: 2.2,
    hemi: ["#f3e6ff", "#4a4238"],
  },
  spawn: [0, 0, 3],
  killY: -4,
  solids: [
    seg(7, -14),
    block(-1.5, -16.2, 2.2, 0.4),
    block(1.5, -19.2, 2.2, 0.4),
    block(-1.5, -22.2, 2.2, 0.4),
    block(1.5, -25.2, 2.2, 0.4),
    seg(-27.4, -40, 0.4),
    seg(-50, -62, 0.4, 7),
    seg(-62, -65, 1.0),
    seg(-65, -68, 1.6),
    seg(-68, -71, 2.2),
    seg(-71, -85, 2.2, 1.6),
    seg(-85, -100, 2.2, 8),
  ],
  movers: [{ x: 0, z: -45, top: 0.4, w: 3, d: 3, axis: "z", distance: 3.4, speed: 0.85 }],
  crates: [
    c(-1.5, 0, -5),
    c(1.5, 0, -5, "bonus"),
    c(0, 0, -11, "tnt"),
    c(-2.2, 0, -12),
    c(1.8, 0.4, -30, "check"),
    c(-2, 0.4, -33, "tnt"),
    c(-2, 0.4, -34.2),
    c(1.8, 0.4, -37, "aku"),
    c(-2.8, 0.4, -52, "nitro"),
    c(2.8, 0.4, -52, "nitro"),
    c(0, 0.4, -54, "check"),
    c(-2.8, 0.4, -57, "nitro"),
    c(2.8, 0.4, -57),
    c(2.8, 0.4 + CRATE_SIZE, -57, "bonus"),
    c(-1.2, 0.4, -60, "bounce"),
    c(0, 2.2, -88, "check"),
    c(-3, 2.2, -92),
    c(3, 2.2, -92, "tnt"),
  ],
  fruit: [
    ...fruitLine([0, 1, -1], [0, 1, -9], 4),
    [-1.5, 1.5, -16.2],
    [1.5, 1.5, -19.2],
    [-1.5, 1.5, -22.2],
    [1.5, 1.5, -25.2],
    ...fruitLine([0, 1.4, -42], [0, 1.4, -48], 3),
    ...fruitLine([-1.2, 4, -60], [-1.2, 6, -60], 3),
    ...fruitLine([0, 3.2, -73], [0, 3.2, -83], 5),
  ],
  enemies: [
    { kind: "monkey", x: 0, y: 0, z: -8, axis: "x", range: 2, speed: 1.8 },
    { kind: "monkey", x: 0, y: 0.4, z: -35.5, axis: "x", range: 2.2, speed: 2, phase: 0.5 },
    {
      kind: "turtle",
      x: 0,
      y: 0.4,
      z: -59,
      axis: "x",
      range: 2,
      speed: 1.4,
      spiky: true,
    },
    { kind: "monkey", x: 0, y: 2.2, z: -78, axis: "z", range: 4, speed: 1.6 },
    { kind: "monkey", x: 0, y: 2.2, z: -94, axis: "x", range: 3, speed: 2.2, phase: 0.2 },
  ],
  crystal: [0, 3.4, -90],
  exit: [0, 2.2, -97],
  path: [
    [0, 3],
    [0, -14],
    [-1.5, -16.2],
    [1.5, -19.2],
    [-1.5, -22.2],
    [1.5, -25.2],
    [0, -28],
    [0, -97],
  ],
};

export const WARP_LEVELS: Record<WarpLevelId, WarpLevel> = {
  turtle: turtleWoods,
  snow: snowGo,
  pits: thePits,
  boulder: boulderDash,
  ruins: roadToRuin,
};

export const isWarpLevelId = (id: unknown): id is WarpLevelId =>
  typeof id === "string" && (WARP_LEVEL_IDS as readonly string[]).includes(id);

/** Crates that count toward the level's gem: everything breakable except nitro. */
export const countsForGem = (kind: CrateKind) => kind !== "spring" && kind !== "nitro";

/** Walkable surface height under (x, z) from static ground, or -Infinity. */
export function solidTop(level: WarpLevel, x: number, z: number) {
  let top = -Infinity;
  for (const s of level.solids) {
    if (s.wall) continue;
    if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) top = Math.max(top, s.top);
  }
  return top;
}

/** Mover top position at simulation time t (matches updatePlatforms). */
export function moverOffset(mover: Mover, t: number) {
  return Math.sin(t * mover.speed + (mover.phase ?? 0)) * mover.distance;
}

/** Walk-speed enemy patrol: a constant-speed triangle wave through `range`. */
export function enemyOffset(enemy: Enemy, t: number) {
  const loop = 4 * enemy.range;
  const travelled = (((t * enemy.speed + (enemy.phase ?? 0) * loop) % loop) + loop) % loop;
  const offset =
    travelled < 2 * enemy.range ? travelled - enemy.range : 3 * enemy.range - travelled;
  const heading = travelled < 2 * enemy.range ? 1 : -1;
  return { offset, heading };
}

export function enemyPosition(enemy: Enemy, t: number) {
  const { offset, heading } = enemyOffset(enemy, t);
  return {
    x: enemy.x + (enemy.axis === "x" ? offset : 0),
    z: enemy.z + (enemy.axis === "z" ? offset : 0),
    heading,
  };
}
