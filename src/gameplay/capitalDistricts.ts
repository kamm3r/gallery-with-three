import { capitalMountedPlacement } from "./generated/capitalStatuePlacement.ts";
import type { ParishArea, ParishPoint } from "./ashenParish.ts";
import type { CapitalKitModel } from "./capitalBuildingKit.ts";
import {
  octagon,
  type CapitalBuilder,
  type CapitalMaterial,
  type CapitalOpening,
  type XZ,
} from "./capitalKitLevel.ts";

/**
 * The Fading Sacred Capital, rebuilt to Bramasole's "Minas Tirith" level: a round sky
 * city split from its ground half by fog. The plan follows the article's area map
 * (north is −Z, the Ultimate Plaza is the origin, one plan pixel of the 1000 px map is
 * half a metre):
 *
 * - City Wall (north-east): two arcs of curtain wall with the Break Wall between them,
 *   each sending a long radial bridge in to the Middle Level Town.
 * - Middle Level Town (east ring): the street floor (F2) where the bridges land, the
 *   rooftop floor (F3) over its houses, and the undercroft (F1) beneath the street.
 * - Mountain Tunnel: from F1 through the prow to Up Town.
 * - Up Town (north-west): a broad quarter of house blocks; its Top-Left Road climbs to
 *   the tip of the prow, whose blade walk rises to the round Ultimate Plaza.
 * - Oblivion Chapel south of the plaza: the checkpoint where four routes converge.
 * - Asylum Cathedral behind it (narthex, transept, nave with galleries and rafters),
 *   the Church Outside Path along its east flank and the Royal Backyard beyond.
 * - Beacon Pathway (west arc) from the apse down to the beacon tower.
 * - Below the fog: Grand Street around the foot of the central mountain, and the Glory
 *   Colosseum beneath the plaza.
 *
 * Every piece is placed through the kit builder, which also records its walkable
 * surfaces and colliders.
 */
export const Y = {
  wall: 12,
  bridge: 9,
  f3: 15,
  f2: 9,
  f1: 3,
  tunnel: 3,
  upTown: 6,
  tip: 16,
  plaza: 24,
  /** The chapel, plaza and cathedral floor. */
  citadel: 24,
  /** Cathedral galleries. */
  gallery: 31,
  rafter: 38,
  garden: 28,
  /** Grand Street and the ground beneath the fog. */
  plain: -8,
  arena: -18,
} as const;
/** The ground plain lies just under Grand Street; walls and piers stand on it. */
export const GROUND = Y.plain - 0.5;
/** The raised court before the colosseum gate, up broad steps from Grand Street. */
const COURT_Y = Y.plain + 2;

/** Polar point: angle from −Z towards +X (clockwise seen from above), so π/2 is east. */
export const polar = (r: number, a: number): XZ => [Math.sin(a) * r, -Math.cos(a) * r];
const radial = (a: number): XZ => [Math.sin(a), -Math.cos(a)];
/** The yaw that turns a local +Z towards `d`. */
const facing = (d: XZ) => Math.atan2(d[0], d[1]);
const at3 = ([x, z]: XZ, y: number): ParishPoint => [x, y, z];
const add = (p: XZ, d: XZ, s: number): XZ => [p[0] + d[0] * s, p[1] + d[1] * s];

/** Plan rings and sectors, in metres and radians. */
export const CAPITAL_RINGS = {
  wall: { r0: 95, r1: 108, a: [0.22, 0.88] as const, b: [1.0, 1.4] as const },
  bridges: [0.74, 1.25] as const,
  mid: { a0: 0.3, a1: 1.95, f3: [30, 38.5] as const, street: [39, 46] as const },
  f1: { a0: 0.4, a1: 1.85, r0: 39.5, r1: 45.5 },
  upTown: { a0: 4.5, a1: 5.8, r0: 48, r1: 92 },
  band: { a0: 5.8, a1: 6.55, r0: 68, r1: 92 },
  street: { a0: 4.1, a1: 5.6, r0: 23, r1: 33 },
  plaza: 16,
  arena: 20,
} as const;
const W = CAPITAL_RINGS.wall,
  MID = CAPITAL_RINGS.mid,
  F1 = CAPITAL_RINGS.f1,
  UP = CAPITAL_RINGS.upTown,
  BAND = CAPITAL_RINGS.band,
  GS = CAPITAL_RINGS.street;

/** Half-width of the blade walk on the prow at `z` (it narrows to its tip at −64). */
export const bladeHalfWidth = (z: number) => {
  const table: Array<[number, number]> = [
    [-64, 1.2],
    [-58, 5],
    [-50, 6.5],
    [-44, 7.5],
    [-34, 9],
    [-28, 11],
    [-12, 11],
  ];
  if (z <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++)
    if (z <= table[i][0]) {
      const [z0, h0] = table[i - 1],
        [z1, h1] = table[i];
      return h0 + ((h1 - h0) * (z - z0)) / (z1 - z0);
    }
  return 11;
};
export const CAPITAL_PROW = { tip: -64, gate: -58, halfWidth: 11 } as const;

/** The town lift stands in a bay of the Middle Level Town's house row. */
const TOWN_LIFT_A = 1.4,
  TOWN_LIFT_R = 35.5;
/** The tunnel runs due west at this depth, from F1 through the prow to Up Town. */
const TUNNEL_Z = -39.1;
const TUNNEL_EAST = polar(42.5, F1.a0)[0];
const TUNNEL_WEST = -24;
/** Grand Street's junction circle, where its bar from the beacon tower meets its ring. */
const JUNCTION: XZ = [-31, 24.5];
const BEACON_TOWER: XZ = [-77.5, 24.5];
/** The cathedral plan. */
export const CAPITAL_CATHEDRAL = {
  chapel: { x0: -12, x1: 12, z0: 15.5, z1: 30 },
  narthex: { x0: -9, x1: 9, z0: 32, z1: 38 },
  transept: { x0: -28, x1: 28, z0: 40.5, z1: 56 },
  hall: { x0: -18, x1: 18, z0: 56, z1: 104 },
  apseTip: 116,
};

export const CAPITAL_SITES = {
  start: at3(polar(102, 0.42), Y.wall),
  startSpawn: at3(polar(102, 0.47), Y.wall),
  /** The Break Wall's courtyard below the curtain. */
  courtyard: at3(polar(84.2, 0.955), Y.upTown),
  greatGate: [24, Y.wall, -90.6] as ParishPoint,
  townLift: {
    a: TOWN_LIFT_A,
    center: at3(polar(TOWN_LIFT_R, TOWN_LIFT_A), Y.f2),
  },
  /** The barred gate at the foot of the Top-Right Road. */
  tunnelGate: [30.8, Y.f3, 0] as ParishPoint,
  fountain: at3(polar(35, 0.95), Y.f2),
  plaza: [0, Y.plaza, 0] as ParishPoint,
  chapel: [0, Y.citadel, 24] as ParishPoint,
  cathedralDoor: [0, Y.citadel, 31] as ParishPoint,
  apse: [0, Y.citadel, 84] as ParishPoint,
  switch: [0, Y.citadel, 109] as ParishPoint,
  beaconSeal: [0, Y.citadel, 118.4] as ParishPoint,
  arenaLift: [-6.5, Y.arena, -24] as ParishPoint,
  beaconTower: at3(BEACON_TOWER, Y.plain),
  beaconLift: at3(BEACON_TOWER, Y.plain),
  backyard: [76, Y.garden, 62] as ParishPoint,
  pavilion: [80, Y.garden, 70] as ParishPoint,
  /** The door in the garden wall at the head of Backyard Below's last flight. */
  gardenGate: [58.5, Y.garden, 30.5] as ParishPoint,
  junction: at3(JUNCTION, Y.plain),
  colosseumGate: [0, Y.plain + 2, -61] as ParishPoint,
  colosseum: [0, Y.arena, 0] as ParishPoint,
  tipPlatform: [0, Y.tip, -67] as ParishPoint,
};

/**
 * Interior volumes, as oriented boxes: the undercroft, key room, tunnel, homes, chapel,
 * cathedral and colosseum. The surface shader keeps them dark, lit by braziers, as in the
 * reference's interiors. `yaw` turns the box's local +Z as a three.js yaw does.
 */
export const CAPITAL_INTERIORS: Array<{ center: ParishPoint; half: ParishPoint; yaw: number }> = [];
const interior = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
  CAPITAL_INTERIORS.push({
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    half: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
    yaw: 0,
  });

/** Enterable homes, each with a clear spot inside its door. */
export const CAPITAL_HOMES: Array<{
  id: string;
  area: ParishArea;
  spot: ParishPoint;
  /** Just outside the door, on the street, and just inside it. */
  approach: [ParishPoint, ParishPoint];
}> = [];

type Frame = ReturnType<typeof frame>;

/** Builder calls in a local frame: origin `o`, local +Z turned to `yaw` (three.js). */
function frame(b: CapitalBuilder, ox: number, oz: number, yaw: number) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const P = ([x, z]: XZ): XZ => [ox + x * c + z * s, oz - x * s + z * c];
  const D = ([x, z]: XZ): XZ => [x * c + z * s, -x * s + z * c];
  const local = ([x, z]: XZ): XZ => {
    const dx = x - ox,
      dz = z - oz;
    return [dx * c - dz * s, dx * s + dz * c];
  };
  return {
    P,
    yaw,
    piece: (
      model: CapitalKitModel,
      size: ParishPoint,
      [x, z]: XZ,
      bottom: number,
      material: CapitalMaterial,
      o: { turn?: number; thickness?: number; leaves?: boolean } = {},
    ) => {
      const [px, pz] = P([x, z]);
      b.piece(model, size, [px, bottom, pz], yaw + (o.turn ?? 0), material, o.thickness, o.leaves);
    },
    prop: (
      model: CapitalKitModel,
      size: ParishPoint,
      [x, z]: XZ,
      bottom: number,
      material: CapitalMaterial,
      o: { turn?: number; thickness?: number; collide?: boolean } = {},
    ) => {
      const [px, pz] = P([x, z]);
      b.prop(model, size, [px, bottom, pz], yaw + (o.turn ?? 0), {
        material,
        thickness: o.thickness,
        collide: o.collide,
      });
    },
    box: (
      [x, z]: XZ,
      bottom: number,
      size: ParishPoint,
      material: CapitalMaterial,
      collide = true,
      turn = 0,
    ) => {
      const [px, pz] = P([x, z]);
      b.box(px, pz, bottom, size, yaw + turn, material, collide);
    },
    world: ([x, z]: XZ, y: number): ParishPoint => {
      const [px, pz] = P([x, z]);
      return [px, y, pz];
    },
    rect: (...[id, area, x0, z0, x1, z1, y, o]: Parameters<CapitalBuilder["rect"]>) =>
      b.floor(id, area, [P([x0, z0]), P([x0, z1]), P([x1, z1]), P([x1, z0])], y, o),
    enclosure: (...[corners, bottom, top, o]: Parameters<CapitalBuilder["enclosure"]>) =>
      b.enclosure(corners.map(P), bottom, top, o),
    mass: (...[outline, bottom, top, material]: Parameters<CapitalBuilder["mass"]>) =>
      b.mass(outline.map(P), bottom, top, material),
    flight: (...[id, area, low, dir, rise, width, o]: Parameters<CapitalBuilder["flight"]>) => {
      const [x, z] = P([low[0], low[2]]);
      const high = b.flight(id, area, [x, low[1], z], D(dir), rise, width, o);
      const [hx, hz] = local([high[0], high[2]]);
      return [hx, high[1], hz] as ParishPoint;
    },
    rooms: b.rooms,
  };
}

/** The convex hull of a point set, wound consistently (Andrew's monotone chain). */
function convexHull(points: XZ[]): XZ[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: XZ, a: XZ, b: XZ) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XZ[] = [],
    upper: XZ[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function scatter(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

type Side = "n" | "e" | "s" | "w";
type HouseDoor = { side: Side; c: number; width?: number; height?: number };

/**
 * A furnished single-storey home in a local frame; local +Z (its "s" side) faces the
 * street. Hearth and fire, logs, a table with benches, barrels, a shelf and a bed.
 */
function house(
  t: Frame,
  o: {
    id: string;
    area: ParishArea;
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    base: number;
    height?: number;
    doors: HouseDoor[];
    roof?: boolean;
  },
) {
  const height = o.height ?? 5,
    top = o.base + height,
    th = 0.6;
  const corners: XZ[] = [
    [o.x0, o.z0],
    [o.x1, o.z0],
    [o.x1, o.z1],
    [o.x0, o.z1],
  ];
  const sides: Side[] = ["n", "e", "s", "w"];
  const openings: Record<number, CapitalOpening[]> = {};
  for (const d of o.doors) {
    const along =
      d.side === "n"
        ? d.c - o.x0
        : d.side === "e"
          ? d.c - o.z0
          : d.side === "s"
            ? o.x1 - d.c
            : o.z1 - d.c;
    (openings[sides.indexOf(d.side)] ??= []).push({
      at: along,
      width: d.width ?? 2.4,
      height: d.height ?? 3.6,
      bottom: o.base,
      id: `${o.id}:${d.side}`,
      area: o.area,
    });
  }
  t.enclosure(corners, o.base, top - 0.6, { openings, material: "house", thickness: th });
  const inner = { x0: o.x0 + th / 2, x1: o.x1 - th / 2, z0: o.z0 + th / 2, z1: o.z1 - th / 2 };
  t.rect(`${o.id}:floor`, o.area, inner.x0, inner.z0, inner.x1, inner.z1, o.base, {
    thickness: 0.3,
  });
  furnish(t, inner, o.base);
  CAPITAL_INTERIORS.push({
    center: t.world(
      [(inner.x0 + inner.x1) / 2, (inner.z0 + inner.z1) / 2],
      o.base + (height - 0.6) / 2,
    ),
    half: [(inner.x1 - inner.x0) / 2, (height - 0.6) / 2, (inner.z1 - inner.z0) / 2],
    yaw: t.yaw,
  });
  t.rooms.push({
    id: o.id,
    width: inner.x1 - inner.x0,
    depth: inner.z1 - inner.z0,
    height: height - 0.6,
  });
  t.mass(corners, top - 0.6, top, "trim");
  if (o.roof ?? true)
    t.piece(
      "roof",
      [o.x1 - o.x0, Math.min(3, (o.z1 - o.z0) * 0.55), o.z1 - o.z0],
      [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2],
      top,
      "roof",
      { thickness: 0.35 },
    );
  for (const x of [o.x0 + (o.x1 - o.x0) * 0.2, o.x1 - (o.x1 - o.x0) * 0.2]) {
    if (o.doors.some((d) => d.side === "s" && Math.abs(d.c - x) < 2.4)) continue;
    t.piece("window", [1.1, 1.8, 0.2], [x, o.z1 + 0.38], o.base + 1.4, "trim", {
      thickness: 0.16,
    });
    t.box([x, o.z1 + 0.31], o.base + 1.45, [0.85, 1.7, 0.04], "shadow", false);
  }
}

/** Hearth and logs on one side, a table with benches, barrels and a bed. */
function furnish(t: Frame, inner: { x0: number; x1: number; z0: number; z1: number }, y: number) {
  const w = inner.x1 - inner.x0,
    d = inner.z1 - inner.z0,
    mid = inner.z0 + d * 0.45;
  t.box([inner.x0 + 0.45, mid], y, [0.9, 1.2, 1.6], "wall");
  t.box([inner.x0 + 0.62, mid], y + 0.15, [0.5, 0.45, 1], "glow", false);
  t.box([inner.x0 + 0.45, mid], y + 1.2, [0.7, 2.6, 0.9], "wall");
  t.prop("log-pile", [1, 0.45, 1], [inner.x0 + 0.65, mid + 1.5], y, "timber");
  // Kept at least 1.7 m off the door's centre line, so the way in stays open.
  const tx = Math.max(1.7, inner.x1 - w * 0.32);
  t.prop("crate", [1.6, 0.8, 0.9], [tx, mid], y, "timber");
  for (const s of [-1, 1]) t.prop("crate", [1.4, 0.45, 0.35], [tx, mid + s * 0.8], y, "timber");
  t.prop("drum", [0.6, 0.9, 0.6], [inner.x1 - 0.5, inner.z0 + 0.5], y, "timber");
  t.prop("drum", [0.6, 0.9, 0.6], [inner.x1 - 1.2, inner.z0 + 0.45], y, "timber");
  t.prop("wall", [2.2, 2.2, 0.4], [inner.x0 + w * 0.42, inner.z0 + 0.25], y, "timber");
  if (d >= 3.4) {
    t.prop("crate", [0.95, 0.5, 1.9], [inner.x1 - 0.55, inner.z1 - 1.05], y, "timber");
    t.box([inner.x1 - 0.55, inner.z1 - 0.35], y + 0.5, [0.8, 0.18, 0.45], "cloth", false);
  }
}

/**
 * A closed house block in a local frame (+Z is its street front): plinth, cornices,
 * bays of windows and a door, then a flat crenellated roof, a gable, a spire or a dome.
 * `roofed: false` leaves the top flat, for rows under a deck.
 */
function block(
  t: Frame,
  o: {
    x: number;
    z: number;
    w: number;
    depth: number;
    y: number;
    storeys: number;
    storey?: number;
    tower?: boolean;
    roofed?: boolean;
    rand: () => number;
  },
) {
  const storey = o.storey ?? 4.5,
    height = o.storeys * storey,
    { w, depth, y, rand } = o,
    cz = o.z + depth / 2,
    front = o.z + depth;
  t.box([o.x, cz], y, [w, height, depth], "house", true);
  t.box([o.x, cz], y, [w + 0.2, 0.6, depth + 0.2], "trim", false);
  for (let i = 1; i <= o.storeys; i++)
    t.box([o.x, cz], y + i * storey - 0.3, [w + 0.3, 0.3, depth + 0.3], "trim", false);
  // Heavy corner quoins give the plaster houses a framed silhouette at low resolution.
  for (const side of [-1, 1])
    t.box(
      [o.x + side * (w / 2 - 0.14), front + 0.08],
      y + 0.6,
      [0.28, height - 0.6, 0.28],
      "trim",
      false,
    );
  const bays = Math.max(1, Math.floor(w / 2.4)),
    pitch = w / bays,
    door = Math.floor(rand() * bays);
  for (let i = 0; i < o.storeys; i++)
    for (let j = 0; j < bays; j++) {
      const x = o.x - w / 2 + pitch * (j + 0.5),
        bottom = y + i * storey;
      if (i === 0 && j === door) {
        t.piece("door", [1.9, 3, 0.2], [x, front + 0.05], bottom + 0.6, "timber", {
          thickness: 0.3,
          leaves: true,
        });
        continue;
      }
      const wh = i === 0 ? 1.8 : 2.3;
      t.box([x, front + 0.2], bottom + 1.17, [1.4, 0.18, 0.42], "trim", false);
      t.box([x, front + 0.16], bottom + 1.38, [0.09, wh - 0.25, 0.13], "timber", false);
      if ((j + i + Math.floor(Math.abs(o.x))) % 3 === 0)
        for (const side of [-1, 1]) {
          t.box(
            [x + side * 0.74, front + 0.17],
            bottom + 1.4,
            [0.34, wh * 0.85, 0.13],
            "timber",
            false,
          );
          t.box([x + side * 0.74, front + 0.26], bottom + 1.75, [0.4, 0.12, 0.08], "iron", false);
        }
      t.piece("arch-panel", [0.85, wh - 0.1, 0.06], [x, front + 0.04], bottom + 1.35, "shadow");
      t.piece("arch-window", [1.1, wh, 0.2], [x, front + 0.12], bottom + 1.3, "trim", {
        thickness: 0.16,
      });
    }
  // Side elevations are exposed on stepped streets; repeat two recessed bays there.
  for (const side of [-1, 1]) {
    const x = o.x + side * (w / 2 + 0.09),
      turn = (side * Math.PI) / 2;
    t.box([x, cz], y + 0.6, [0.26, height - 0.6, 0.3], "trim", false);
    for (let i = 0; i < o.storeys; i++)
      for (const fraction of [0.24, 0.76]) {
        const z = o.z + depth * fraction,
          bottom = y + i * storey + 1.35;
        t.piece("arch-panel", [0.85, 2.1, 0.06], [x, z], bottom, "shadow", { turn });
        t.piece("arch-window", [1.1, 2.2, 0.2], [x + side * 0.05, z], bottom - 0.05, "trim", {
          turn,
          thickness: 0.16,
        });
        t.box([x + side * 0.1, z], bottom - 0.18, [0.42, 0.18, 1.4], "trim", false);
      }
  }
  if (o.roofed === false) return;
  const top = y + height;
  if (o.tower) {
    if (rand() < 0.6) {
      t.box([o.x, cz], top, [w + 0.5, 0.4, depth + 0.5], "trim", false);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          t.piece(
            "pillar",
            [0.45, 3.2, 0.45],
            [o.x + sx * w * 0.32, cz + sz * depth * 0.32],
            top + 0.4,
            "trim",
          );
      t.box([o.x, cz], top + 3.6, [w + 0.4, 0.4, depth + 0.4], "trim", false);
      t.piece("dome", [w + 0.4, w * 0.4, depth + 0.4], [o.x, cz], top + 4, "roof");
    } else t.piece("spire", [w + 0.6, 6, depth + 0.6], [o.x, cz], top, "roof");
    return;
  }
  if (rand() < 0.45) {
    t.box([o.x, front - 0.2], top, [w, 0.6, 0.4], "trim", false);
    t.box([o.x, o.z + 0.2], top, [w, 0.6, 0.4], "trim", false);
    for (const sx of [-1, 1])
      t.box([o.x + (sx * (w - 0.4)) / 2, cz], top, [0.4, 0.6, depth], "trim", false);
    for (let x = o.x - w / 2 + 0.6; x < o.x + w / 2 - 0.3; x += 1.4)
      t.box([x, front - 0.2], top + 0.6, [0.6, 0.6, 0.4], "trim", false);
  } else
    t.piece("roof", [w, Math.min(3, depth * 0.6), depth], [o.x, cz], top, "roof", {
      thickness: 0.3,
    });
  if (rand() < 0.5) t.box([o.x + w / 2 - 1.2, o.z + depth * 0.35], top, [0.8, 2.4, 0.8], "trim");
}

export function authorCapitalDistricts(b: CapitalBuilder) {
  /** Where the outside path's last flight lands in the garden's tail. */
  let gardenTailZ = 95;
  const lanterns: ParishPoint[] = [];
  const lantern = (p: XZ, y: number) => lanterns.push([p[0], y, p[1]]);
  const rand = scatter(5023);

  // ---------------------------------------------------------------- ring helpers
  const segments = (a0: number, a1: number, r: number, size = 4) =>
    Math.max(1, Math.ceil((Math.abs(a1 - a0) * r) / size));
  const ringFloor = (
    id: string,
    area: ParishArea,
    r0: number,
    r1: number,
    a0: number,
    a1: number,
    y: number,
    material: CapitalMaterial = "floor",
    cx = 0,
    cz = 0,
  ) => b.arc(id, area, cx, cz, r0, r1, a0, a1, y, segments(a0, a1, r1), material);
  /** Solid angular spans of [a0, a1] once gaps (centre angle, width in metres) are cut. */
  const spans = (r: number, a0: number, a1: number, gaps: Array<[number, number]> = []) => {
    let out: Array<[number, number]> = [[a0, a1]];
    for (const [g, width] of gaps) {
      const h = width / 2 / r;
      out = out.flatMap(([s0, s1]): Array<[number, number]> => {
        if (g + h <= s0 || g - h >= s1) return [[s0, s1]];
        return [
          [s0, g - h],
          [g + h, s1],
        ].filter(([p, q]) => q - p > 1e-4) as Array<[number, number]>;
      });
    }
    return out;
  };
  /** Chord walls along a circle, broken by gaps. */
  const ringWall = (
    r: number,
    a0: number,
    a1: number,
    bottom: number,
    top: number,
    o: {
      thickness?: number;
      material?: CapitalMaterial;
      gaps?: Array<[number, number]>;
      cx?: number;
      cz?: number;
    } = {},
  ) => {
    const cx = o.cx ?? 0,
      cz = o.cz ?? 0;
    for (const [s0, s1] of spans(r, a0, a1, o.gaps)) {
      const n = segments(s0, s1, r, 5);
      for (let i = 0; i < n; i++) {
        const p = polar(r, s0 + ((s1 - s0) * i) / n),
          q = polar(r, s0 + ((s1 - s0) * (i + 1)) / n);
        b.wall([cx + p[0], cz + p[1]], [cx + q[0], cz + q[1]], bottom, top, {
          thickness: o.thickness,
          material: o.material,
        });
      }
    }
  };
  const parapet = (r: number, a0: number, a1: number, y: number, gaps?: Array<[number, number]>) =>
    ringWall(r, a0, a1, y, y + 1.1, { thickness: 0.4, material: "trim", gaps });
  /** Closed masonry under a ring sector. */
  const ringMass = (
    r0: number,
    r1: number,
    a0: number,
    a1: number,
    bottom: number,
    top: number,
    material: CapitalMaterial = "wall",
  ) => {
    const n = segments(a0, a1, r1, 6);
    for (let i = 0; i < n; i++) {
      const s0 = a0 + ((a1 - a0) * i) / n,
        s1 = a0 + ((a1 - a0) * (i + 1)) / n;
      b.mass([polar(r0, s0), polar(r1, s0), polar(r1, s1), polar(r0, s1)], bottom, top, material);
    }
  };
  const merlons = (
    r: number,
    a0: number,
    a1: number,
    y: number,
    gaps?: Array<[number, number]>,
  ) => {
    for (const [s0, s1] of spans(r, a0, a1, gaps))
      for (let s = s0 + 1.2 / r; s < s1 - 0.6 / r; s += 2.4 / r) {
        const [x, z] = polar(r, s);
        b.box(x, z, y + 1.1, [1.2, 0.9, 0.5], -s, "trim", false);
      }
  };
  /** A straight parapet beside a walk from `p` to `q`. */
  const rail = (p: XZ, q: XZ, y: number) =>
    b.wall(p, q, y, y + 1.1, { thickness: 0.4, material: "trim" });
  /** A square pier of masonry standing on the ground. */
  const pier = (p: XZ, top: number, side = 2.2, bottom = GROUND) => {
    const h = side / 2;
    b.mass(
      [
        [p[0] - h, p[1] - h],
        [p[0] + h, p[1] - h],
        [p[0] + h, p[1] + h],
        [p[0] - h, p[1] + h],
      ],
      bottom,
      top,
      "wall",
    );
  };
  /** A straight walkway between two points with masonry piers beneath every `spacing`. */
  const span = (
    id: string,
    area: ParishArea,
    p: XZ,
    q: XZ,
    y: number,
    width: number,
    o: { kind?: "walkway" | "slab"; piers?: number; base?: number } = {},
  ) => {
    b.bridge(id, area, p, q, y, width, { kind: o.kind ?? "slab" });
    if (o.piers) {
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]),
        n = Math.max(1, Math.floor(length / o.piers));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        pier([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], y - 0.9, 2, o.base ?? GROUND);
      }
    }
  };
  /** A straight kit flight from a high point down along `d` to `rise` lower. */
  const descend = (
    id: string,
    area: ParishArea,
    high: ParishPoint,
    d: XZ,
    rise: number,
    width: number,
    fill?: number,
  ) => {
    const run = Math.round(rise / 0.2) * 0.3,
      low: ParishPoint = [high[0] + d[0] * run, high[1] - rise, high[2] + d[1] * run];
    b.flight(id, area, low, [-d[0], -d[1]], rise, width, { fill });
    return low;
  };
  /** A giant sword stuck point-down in the city, as in the reference. */
  const sword = (p: XZ, y: number, yaw: number, scale = 1) => {
    const s = scale;
    b.piece("greatsword", [7 * s, 22.2 * s, 0.6 * s], [p[0], y, p[1]], yaw + Math.PI / 2, "iron");
    b.prop("drum", [0.56 * s, 4 * s, 0.56 * s], [p[0], y + 17 * s, p[1]], 0, {
      material: "timber",
      collide: false,
    });
    b.solid([p[0], y, p[1]], [0.6 * s, 4, 2.4 * s], yaw);
  };
  const statue = (p: XZ, y: number, yaw: number, scale = 1) => {
    b.box(p[0], p[1], y, [1.6 * scale, 0.8, 1.6 * scale], yaw, "trim");
    b.piece(
      "sentinel-statue",
      [2 * scale, 4 * scale, 1.65 * scale],
      [p[0], y + 0.8, p[1]],
      yaw,
      "trim",
    );
    // The body blocks the pedestal; the shield and sword overhang it decoratively.
    b.solid([p[0], y + 0.8, p[1]], [1.2 * scale, 4 * scale, 1 * scale], yaw);
  };
  const brazier = (p: XZ, y: number) => {
    b.piece("cage-brazier", [0.9, 1.5, 0.9], [p[0], y, p[1]], 0, "iron");
    b.piece("flame", [0.55, 0.65, 0.55], [p[0], y + 1.12, p[1]], 0, "glow");
  };

  cityWall();
  bridges();
  midTown();
  mountainTunnel();
  upTown();
  bladeAndPlaza();
  chapel();
  cathedral();
  outsidePath();
  royalBackyard();
  beaconPathway();
  // The ground city: hidden below the fog, it rises to meet the sky city at the switch.
  b.groundLayer(() => {
    grandStreet();
    colosseum();
  });
  return lanterns;

  // ---------------------------------------------------------------- City Wall
  function cityWall() {
    const { r0, r1 } = W,
      mid = (r0 + r1) / 2,
      bridgeGaps: Array<[number, number]> = CAPITAL_RINGS.bridges.map((a) => [a, 5]);
    const returnStair = 0.83,
      gate = Math.asin(24 / r0);
    for (const [id, [a0, a1]] of [
      ["wall-a", W.a],
      ["wall-b", W.b],
    ] as const) {
      ringFloor(`${id}:walk`, "refuge", r0, r1, a0, a1, Y.wall);
      ringMass(r0, r1, a0, a1, GROUND, Y.wall - 1);
      // Merlons on the outer face, a parapet on the inner one with gaps at its stairs.
      merlons(r1 - 0.3, a0, a1, Y.wall);
      ringWall(r1 - 0.3, a0, a1, Y.wall, Y.wall + 1.1, { thickness: 0.6, material: "trim" });
      const gaps: Array<[number, number]> = [...bridgeGaps];
      if (id === "wall-a") gaps.push([returnStair, 5], [gate, 5.4]);
      // The Break Wall: the curtain's inner parapet has fallen at wall A's east end.
      const end = id === "wall-a" ? a1 - 0.05 : a1;
      parapet(r0 + 0.2, a0, end, Y.wall, gaps);
      // Square towers at each end of each arc, and a string course down the outer face.
      if (id === "wall-a")
        // The broken end: rubble instead of a tower.
        for (let i = 0; i < 6; i++) {
          const [dx, dz] = polar(mid + (rand() - 0.5) * 6, a1 - 0.01 - rand() * 0.03);
          b.piece("debris", [2 + rand() * 2, 0.8, 2 + rand() * 2], [dx, Y.wall, dz], rand() * 3);
        }
      for (const a of id === "wall-a" ? [a0 - 0.05] : [a1 + 0.05]) {
        const [x, z] = polar(mid, a),
          yaw = -a;
        const h = 5;
        b.mass(
          [
            [x - Math.cos(yaw) * h - Math.sin(yaw) * h, z + Math.sin(yaw) * h - Math.cos(yaw) * h],
            [x + Math.cos(yaw) * h - Math.sin(yaw) * h, z - Math.sin(yaw) * h - Math.cos(yaw) * h],
            [x + Math.cos(yaw) * h + Math.sin(yaw) * h, z - Math.sin(yaw) * h + Math.cos(yaw) * h],
            [x - Math.cos(yaw) * h + Math.sin(yaw) * h, z + Math.sin(yaw) * h + Math.cos(yaw) * h],
          ],
          GROUND,
          Y.wall + 8.1,
        );
        b.box(x, z, Y.wall + 8.1, [11, 0.6, 11], yaw, "trim", false);
        for (const s of [-1, 1])
          for (const t of [-1, 1])
            b.box(
              x + Math.cos(yaw) * s * 4.6 + Math.sin(yaw) * t * 4.6,
              z - Math.sin(yaw) * s * 4.6 + Math.cos(yaw) * t * 4.6,
              Y.wall + 8.7,
              [1.2, 1.2, 1.2],
              yaw,
              "trim",
              false,
            );
      }
      for (let a = a0 + 0.06; a < a1 - 0.02; a += 0.12) {
        const [x, z] = polar(r1 + 0.05, a);
        b.piece("banner", [1.6, 6, 0.06], [x, Y.wall - 7, z], Math.PI - a, "cloth");
      }
      for (let a = a0 + 0.03; a < a1; a += 0.09) lantern(polar(r0 + 0.9, a), Y.wall);
    }
    // The Break Wall: a fallen beam spans the breach to wall B.
    const p = polar(102, W.a[1] - 0.012),
      q = polar(102, W.b[0] + 0.012);
    b.bridge("break-wall", "refuge", p, q, Y.wall, 2.2, {
      kind: "wooden-bridge",
      base: Y.wall - 4,
    });
    b.piece(
      "fallen-beam",
      [0.9, 0.9, Math.hypot(q[0] - p[0], q[1] - p[1])],
      [(p[0] + q[0]) / 2 + 2, Y.wall - 0.6, (p[1] + q[1]) / 2 - 1],
      facing([q[0] - p[0], q[1] - p[1]]),
      "timber",
    );
    // The courtyard below the breach: a roof to drop on, a chest and the stair back up.
    const c0 = 0.8,
      c1 = 0.97,
      cr0 = 82,
      cr1 = W.r0 - 0.4;
    ringFloor("break-court", "refuge", cr0, cr1, c0, c1, Y.upTown);
    ringMass(cr0, cr1, c0, c1, GROUND, Y.upTown - 1);
    parapet(cr0 + 0.2, c0, c1, Y.upTown);
    for (const a of [c0, c1]) rail(polar(cr0, a), polar(cr1, a), Y.upTown);
    // The roof the breach drops onto, three metres above the court.
    {
      const t = frame(b, ...polar(91.5, 0.9), facing(radial(0.9 + Math.PI)));
      t.box([0, 0], Y.upTown, [9, 3, 5], "house");
      b.floor(
        "break-roof",
        "refuge",
        [polar(89.03, 0.875), polar(94, 0.875), polar(94, 0.925), polar(89.03, 0.925)],
        Y.bridge,
        { material: "roof", thickness: 0.4 },
      );
    }
    b.flight(
      "break-roof-stair",
      "refuge",
      at3(polar(84.5, 0.9), Y.upTown),
      radial(0.9),
      Y.bridge - Y.upTown,
      2.4,
      {
        fill: Y.upTown,
      },
    );
    b.flight(
      "break-court-stair",
      "refuge",
      at3(polar(r0 - 9, returnStair), Y.upTown),
      radial(returnStair),
      Y.wall - Y.upTown,
      4,
      { fill: Y.upTown },
    );
    // The great gate: an arch over the door the stair from Up Town reaches.
    for (const x of [20.6, 27.4]) b.box(x, -90.6, Y.wall, [1.2, 6, 1.2], 0, "trim");
    b.box(24, -90.6, Y.wall + 5, [8, 1.4, 1.4], 0, "trim", false);
    b.piece("banner", [3, 4.4, 0.06], [24, Y.wall + 0.6, -91.4], 0, "cloth");
  }

  // ---------------------------------------------------------------- bridges
  function bridges() {
    CAPITAL_RINGS.bridges.forEach((a, i) => {
      const inner = polar(MID.street[1] - 0.6, a),
        foot = polar(W.r0 - 4.5, a);
      b.bridge(`bridge-${i + 1}`, "refuge", inner, foot, Y.bridge, 4.6, { kind: "walkway" });
      b.flight(`bridge-${i + 1}-stair`, "refuge", at3(foot, Y.bridge), radial(a), 3, 4.6, {
        fill: GROUND,
      });
      // Tall piers carry the long bridges over the void, as in the whitebox.
      for (let r = MID.street[1] + 8; r < W.r0 - 6; r += 10) {
        pier(polar(r, a), Y.bridge - 0.3, 2.4);
        b.box(...polar(r, a), Y.bridge - 1.1, [3.2, 0.5, 4.6], -a, "trim", false);
        if (r + 10 < W.r0 - 6) {
          const [x, z] = polar(r + 5, a);
          b.piece("bridge-arch", [10, 7, 3.8], [x, Y.bridge - 7.3, z], -a, "wall", 0.8);
        }
      }
      for (let r = MID.street[1] + 4; r < W.r0 - 4; r += 10)
        lantern(polar(r, a + 1.6 / r), Y.bridge);
    });
  }

  // ---------------------------------------------------------------- Middle Level Town
  function midTown() {
    const [f30, f31] = MID.f3,
      [s0, s1] = MID.street,
      lift = { a: TOWN_LIFT_A, h: 3.4 / TOWN_LIFT_R },
      fountainA = 0.95,
      f1Stair = 0.56,
      f1Door = 0.66;
    // F2: the street, with the bridges arriving through its outer parapet.
    ringFloor("mid-f2", "foundry", s0, s1, MID.a0, MID.a1, Y.f2);
    // The parapet stops where the street opens onto Backyard Below.
    parapet(s1 - 0.2, MID.a0, MID.a1 - 0.1, Y.f2, [
      ...CAPITAL_RINGS.bridges.map((a): [number, number] => [a, 5]),
      [f1Stair, 4.6],
    ]);
    b.wall(polar(s0 - 8.5, MID.a0), polar(s1, MID.a0), Y.f2, Y.f2 + 4.5);
    // F1: the undercroft beneath the street, enclosed and lamp-lit.
    ringFloor("mid-f1", "foundry", F1.r0, F1.r1, F1.a0, F1.a1, Y.f1);
    ringMass(F1.r0 - 0.3, F1.r1 + 0.3, F1.a0, F1.a1, GROUND, Y.f1 - 1);
    ringWall(F1.r0 - 0.3, F1.a0, F1.a1, Y.f1, Y.f2 - 1, { thickness: 0.6 });
    const keyRoom = CAPITAL_RINGS.bridges[1];
    ringWall(F1.r1 + 0.3, F1.a0, F1.a1, Y.f1, Y.f2 - 1, {
      thickness: 0.6,
      gaps: [
        [f1Door, 3.6],
        [keyRoom, 6.6],
      ],
    });
    b.wall(polar(F1.r0 - 0.3, F1.a1), polar(F1.r1 + 0.3, F1.a1), Y.f1, Y.f2 - 1, {
      thickness: 0.6,
    });
    // The north end opens into the Mountain Tunnel.
    b.wall(polar(F1.r0 - 0.3, F1.a0), polar(F1.r1 + 0.3, F1.a0), Y.f1, Y.f2 - 1, {
      thickness: 0.6,
      openings: [{ at: 3, width: 3.6, bottom: Y.f1, height: 4, frame: "doorway", id: "f1-tunnel" }],
    });
    for (let a = F1.a0 + 0.08; a < F1.a1; a += 0.16) lantern(polar(F1.r0 + 0.6, a), Y.f1);
    // The undercroft as a chain of boxes following its ring.
    for (let a = F1.a0; a < F1.a1 - 1e-3; a += 0.12) {
      const a1 = Math.min(F1.a1, a + 0.12),
        mid = (a + a1) / 2,
        r = (F1.r0 + F1.r1) / 2;
      CAPITAL_INTERIORS.push({
        center: at3(polar(r, mid), Y.f1 + 2.5),
        half: [((a1 - a) * F1.r1) / 2 + 0.05, 2.5, (F1.r1 - F1.r0) / 2],
        yaw: facing(radial(mid)),
      });
    }
    // The undercroft key room beneath the second bridge.
    {
      const t = frame(b, ...polar(F1.r1 + 0.3, keyRoom), facing(radial(keyRoom + Math.PI)));
      t.rect("f1-key-room", "foundry", -3, -6.5, 3, 0.2, Y.f1);
      t.enclosure(
        [
          [-3.3, -6.8],
          [3.3, -6.8],
          [3.3, 0],
          [-3.3, 0],
        ],
        Y.f1,
        Y.f2 - 1,
        {
          thickness: 0.6,
          openings: {
            2: [
              { at: 3.3, width: 3.6, bottom: Y.f1, height: 4, area: "foundry", id: "f1-key-door" },
            ],
          },
        },
      );
      t.mass(
        [
          [-3.6, -7.1],
          [3.6, -7.1],
          [3.6, 0],
          [-3.6, 0],
        ],
        Y.f2 - 1,
        Y.f2 - 0.2,
        "wall",
      );
      t.mass(
        [
          [-3.6, -7.1],
          [3.6, -7.1],
          [3.6, 0],
          [-3.6, 0],
        ],
        GROUND,
        Y.f1 - 0.6,
        "wall",
      );
      t.rooms.push({ id: "f1-key-room", width: 6, depth: 6.4, height: 5 });
      CAPITAL_INTERIORS.push({
        center: t.world([0, -3.4], Y.f1 + 2.5),
        half: [3, 2.5, 3.1],
        yaw: t.yaw,
      });
      t.prop("crate", [1.2, 0.8, 1.2], [2, -5.5], Y.f1, "timber");
      t.prop("drum", [0.7, 0.9, 0.7], [-2.2, -5.8], Y.f1, "timber");
    }
    // The stair tower from F2 down to F1, outside the drum.
    {
      const top = polar(s1 - 0.15, f1Stair),
        low = descend(
          "mid-f1-stair",
          "foundry",
          at3(top, Y.f2),
          radial(f1Stair),
          Y.f2 - Y.f1,
          4,
          GROUND,
        );
      const lowXZ: XZ = [low[0], low[2]];
      const landing = [
        polar(Math.hypot(...lowXZ) - 0.1, f1Stair - 0.045),
        polar(Math.hypot(...lowXZ) + 4, f1Stair - 0.045),
        polar(Math.hypot(...lowXZ) + 4, f1Door + 0.04),
        polar(Math.hypot(...lowXZ) - 0.1, f1Door + 0.04),
      ];
      b.floor("mid-f1-landing", "foundry", landing, Y.f1);
      b.mass(landing, GROUND, Y.f1 - 0.6);
      const r = Math.hypot(...lowXZ);
      b.bridge(
        "mid-f1-passage",
        "foundry",
        polar(F1.r1 + 0.6, f1Door),
        polar(r, f1Door),
        Y.f1,
        3.4,
        {
          kind: "slab",
        },
      );
      b.mass(
        [
          polar(F1.r1 + 0.6, f1Door - 0.04),
          polar(r, f1Door - 0.035),
          polar(r, f1Door + 0.035),
          polar(F1.r1 + 0.6, f1Door + 0.04),
        ],
        GROUND,
        Y.f1 - 0.8,
      );
      b.floor(
        "mid-f1-door",
        "foundry",
        [
          polar(F1.r1 - 0.2, f1Door - 0.04),
          polar(F1.r1 + 0.8, f1Door - 0.04),
          polar(F1.r1 + 0.8, f1Door + 0.04),
          polar(F1.r1 - 0.2, f1Door + 0.04),
        ],
        Y.f1,
        { thickness: 0.1, threshold: true, render: false },
      );
      rail(polar(r + 4, f1Stair - 0.045), polar(r + 4, f1Door + 0.04), Y.f1);
    }
    // F3: the rooftop floor over the house row, with the town lift's bay cut through it.
    ringFloor("mid-f3-north", "foundry", f30, f31, MID.a0 + 0.05, lift.a - lift.h - 0.005, Y.f3);
    ringFloor("mid-f3-south", "foundry", f30, f31, lift.a + lift.h + 0.005, MID.a1 - 0.1, Y.f3);
    ringFloor(
      "mid-f3-bay",
      "foundry",
      f30,
      TOWN_LIFT_R - 3.05,
      lift.a - lift.h - 0.006,
      lift.a + lift.h + 0.006,
      Y.f3,
    );
    parapet(f30 + 0.2, MID.a0 + 0.05, MID.a1 - 0.1, Y.f3, [[Math.PI / 2, 5]]);
    parapet(f31 - 0.2, MID.a0 + 0.05, MID.a1 - 0.1, Y.f3, [[lift.a, 6.4]]);
    for (const a of [MID.a0 + 0.05, MID.a1 - 0.1]) rail(polar(f30, a), polar(f31, a), Y.f3);
    // The inner retaining face of the drum, down to the ground beside Grand Street.
    ringMass(f30, f30 + 1.4, MID.a0 + 0.05, MID.a1 - 0.1, GROUND, Y.f3 - 1);
    ringMass(f30 + 1.4, s0, MID.a0 + 0.05, MID.a1 - 0.1, GROUND, Y.f2 - 1);
    // The Mountain Tunnel leaves the undercroft's north end beneath this stretch.
    ringMass(s0, s1, MID.a0, F1.a0, GROUND, Y.tunnel - 1);
    ringMass(s0, s1, MID.a0, F1.a0, Y.tunnel + 4.8, Y.f2 - 1);
    ringMass(s0, s1, F1.a1, MID.a1, GROUND, Y.f2 - 1);
    // The lift bay: a floor at street level around the shaft.
    b.floor(
      "mid-lift-bay",
      "foundry",
      [
        polar(TOWN_LIFT_R + 3.05, lift.a - lift.h),
        polar(s0 + 0.2, lift.a - lift.h),
        polar(s0 + 0.2, lift.a + lift.h),
        polar(TOWN_LIFT_R + 3.05, lift.a + lift.h),
      ],
      Y.f2,
    );
    for (const s of [-1, 1])
      b.wall(
        polar(f30 + 1.4, lift.a + s * (lift.h + 0.012)),
        polar(s0, lift.a + s * (lift.h + 0.012)),
        Y.f2,
        Y.f3 - 1,
        {
          thickness: 0.4,
        },
      );
    b.piece(
      "elevator",
      [6.6, Y.f3 - Y.f2 + 3.2, 6.6],
      at3(polar(TOWN_LIFT_R, lift.a), Y.f2 - 0.3),
      Math.PI - lift.a,
      "iron",
      0.3,
    );
    // The house row under F3: closed blocks facing the street, with enterable homes
    // and the Sage's fountain court between the bridges.
    const rowBack = f30 + 1.4,
      depth = s0 - 0.4 - rowBack,
      reserved: Array<[number, number]> = [
        [lift.a - lift.h - 0.03, lift.a + lift.h + 0.03],
        [fountainA - 0.09, fountainA + 0.09],
      ];
    let homes = 0;
    for (let a = MID.a0 + 0.08; a < MID.a1 - 0.12;) {
      const w = 5.5 + rand() * 3,
        da = w / (rowBack + depth / 2);
      if (a + da > MID.a1 - 0.12) break;
      const mid = a + da / 2;
      if (reserved.some(([p, q]) => a + da > p && a < q)) {
        a += 0.02;
        continue;
      }
      const t = frame(b, ...polar(rowBack, mid), facing(radial(mid)));
      const homeSpot =
        (mid > 0.45 && mid < 0.72) || (mid > 1.05 && mid < 1.25) || (mid > 1.5 && mid < 1.8);
      if (
        homes < 3 &&
        w > 6.5 &&
        homeSpot &&
        !CAPITAL_HOMES.some(
          (h) =>
            h.id.startsWith("home-mid") && Math.abs(Math.atan2(h.spot[0], -h.spot[2]) - mid) < 0.25,
        )
      ) {
        const id = `home-mid-${homes++}`;
        house(t, {
          id,
          area: "foundry",
          x0: -w / 2,
          z0: 0,
          x1: w / 2,
          z1: depth,
          base: Y.f2,
          height: Y.f3 - 1 - Y.f2,
          doors: [{ side: "s", c: 0 }],
          roof: false,
        });
        t.rect(`${id}:apron`, "foundry", -1.8, depth + 0.1, 1.8, depth + 2.4, Y.f2, {
          render: false,
          thickness: 0.1,
        });
        CAPITAL_HOMES.push({
          id,
          area: "foundry",
          spot: t.world([0, depth * 0.55], Y.f2),
          approach: [t.world([0, depth + 2], Y.f2), t.world([0, depth - 1], Y.f2)],
        });
      } else
        block(t, {
          x: 0,
          z: 0,
          w: w - 0.3,
          depth,
          y: Y.f2,
          storeys: 1,
          storey: Y.f3 - 1 - Y.f2,
          roofed: false,
          rand,
        });
      a += da + 0.004;
    }
    // The Sage's fountain court.
    {
      ringFloor(
        "mid-fountain-court",
        "foundry",
        rowBack,
        s0 + 0.5,
        fountainA - 0.088,
        fountainA + 0.088,
        Y.f2,
      );
      const [x, z] = polar(35, fountainA);
      b.prop("drum", [3.2, 0.8, 3.2], [x, Y.f2, z], 0, { material: "trim" });
      b.piece("drum", [2.7, 0.05, 2.7], [x, Y.f2 + 0.75, z], 0, "water");
      b.box(x, z, Y.f2 + 0.8, [0.5, 1.6, 0.5], 0, "trim", false);
      for (const s of [-1, 1])
        b.wall(
          polar(rowBack, fountainA + s * 0.09),
          polar(s0 - 0.4, fountainA + s * 0.09),
          Y.f2,
          Y.f3 - 1,
          { thickness: 0.5 },
        );
      b.wall(polar(rowBack, fountainA - 0.09), polar(rowBack, fountainA + 0.09), Y.f2, Y.f3 - 1, {
        thickness: 0.5,
      });
    }
    for (let a = MID.a0 + 0.06; a < MID.a1; a += 0.11) lantern(polar(s1 - 0.8, a), Y.f2);
    // An arcade along the street's open edge closes it in, as the reference's town is;
    // statues and an arched gateway mark each bridge's arrival.
    {
      const r = s1 - 0.15,
        step = 4.6 / r,
        open = [...CAPITAL_RINGS.bridges, f1Stair],
        clear = (a: number) => open.every((g) => Math.abs(a - g) * r > 3.6);
      let previous: number | null = null;
      for (let a = MID.a0 + 0.04; a < MID.a1 - 0.12; a += step) {
        if (!clear(a)) {
          previous = null;
          continue;
        }
        b.pillar(...polar(r, a), Y.f2, 5.2, 0.7, "trim");
        if (previous !== null) {
          const m = (a + previous) / 2;
          b.piece(
            "arch-window",
            [4.4, 5, 0.3],
            at3(polar(r, m), Y.f2),
            facing(radial(m)),
            "trim",
            0.35,
          );
          b.box(...polar(r, m), Y.f2 + 5.2, [4.9, 0.5, 0.8], -m, "trim", false);
        }
        previous = a;
      }
      for (const a of CAPITAL_RINGS.bridges) {
        b.piece(
          "doorway",
          [6, 6.4, 0.7],
          at3(polar(s1 + 0.2, a), Y.f2),
          facing(radial(a)),
          "timber",
          0.7,
        );
        for (const t of [-1, 1]) statue(polar(44.2, a + (t * 3.6) / 44.2), Y.f2, Math.PI - a, 1.25);
      }
    }
    for (let a = MID.a0 + 0.12; a < MID.a1 - 0.1; a += 0.14)
      if (Math.abs(a - lift.a) > 0.12 && Math.abs(a - Math.PI / 2) > 0.08)
        lantern(polar(f30 + 0.9, a), Y.f3);
    // The Top-Right Road: from F3 over the moat up to the plaza's east wing.
    b.flight("top-right-road", "toproad", [f30, Y.f3, 0], [-1, 0], Y.plaza - Y.f3, 4.6);
    for (const z of [-2.5, 2.5])
      b.wall([f30, z], [f30 - 13.5, z], Y.f3, Y.plaza + 1.1, { thickness: 0.4, material: "trim" });
    // A tall bell-tower stands at the town's south end, above the stair down to the garden.
    {
      const [x, z] = polar(34.5, MID.a1 - 0.04);
      b.box(x, z, Y.f2, [5, 24, 5], -(MID.a1 - 0.04), "wall", true);
      b.piece("spire", [6, 8, 6], [x, Y.f2 + 24, z], -(MID.a1 - 0.04), "roof");
    }
  }

  // ---------------------------------------------------------------- Mountain Tunnel
  function mountainTunnel() {
    const z = TUNNEL_Z;
    interior(TUNNEL_WEST, Y.tunnel, z - 1.9, TUNNEL_EAST + 1, Y.tunnel + 4.2, z + 1.9);
    b.buried(() => {
      b.hallway("mountain-tunnel", "tunnel", [TUNNEL_EAST + 1, z], [-9.5, z], Y.tunnel, 4.2, 4.6);
    });
    // Beyond the prow it crosses Grand Street's spur as a covered bridge.
    b.hallway("tunnel-bridge", "tunnel", [-9.5, z], [TUNNEL_WEST, z], Y.tunnel, 4.2, 4.6);
    pier([-10.5, z], Y.tunnel - 0.3, 3);
    pier([-22, z], Y.tunnel - 0.3, 3);
    const high = b.flight(
      "tunnel-stair",
      "tunnel",
      [TUNNEL_WEST, Y.tunnel, z],
      [-1, 0],
      Y.upTown - Y.tunnel,
      4,
      {
        fill: GROUND,
      },
    );
    b.rect("tunnel-landing", "toproad", high[0] - 3.5, z - 3, high[0] + 0.05, z + 3, Y.upTown);
    for (let x = TUNNEL_EAST - 4; x > TUNNEL_WEST; x -= 9) lantern([x, z + 1.4], Y.tunnel);
  }

  // ---------------------------------------------------------------- Up Town
  function upTown() {
    const { a0, a1, r0, r1 } = UP,
      y = Y.upTown,
      inner = [r0, 54] as const,
      avenue = [62, 68] as const,
      outer = [84, r1] as const,
      radials = [4.92, 5.25, 5.62],
      // The article's map trims the quarter's south-west end to its outer streets, and
      // bulges its west-north-west arc out to a hundred metres.
      innerStart = 4.82,
      bulge = [5.0, 5.8] as const,
      bulgeR = 100;
    // Streets: the inner street along the retaining wall, the avenue and the outer street.
    ringFloor("up-inner", "toproad", inner[0], inner[1], innerStart, a1, y);
    rail(polar(inner[0], innerStart), polar(avenue[0], innerStart), y);
    parapet(avenue[0] + 0.2, a0, innerStart, y);
    ringFloor("up-avenue", "toproad", avenue[0], avenue[1], a0, a1 + 0.1, y);
    ringFloor("up-outer", "toproad", outer[0], outer[1], a0, BAND.a1, y);
    // Radial streets between the blocks, five metres wide.
    radials.forEach((a, i) => {
      const h = 2.5;
      for (const [p, q, id] of [
        [inner[1] - 0.5, avenue[0] + 0.5, "in"],
        [avenue[1] - 0.5, outer[0] + 0.5, "out"],
      ] as const) {
        const d = radial(a),
          n: XZ = [-d[1], d[0]],
          A = polar(p, a),
          B = polar(q, a);
        b.floor(
          `up-radial-${i}-${id}`,
          "toproad",
          [add(A, n, -h), add(B, n, -h), add(B, n, h), add(A, n, h)],
          y,
        );
        // Covered: each lane runs as a vaulted passage between the blocks.
        const roof = [
          add(A, n, -h - 0.4),
          add(B, n, -h - 0.4),
          add(B, n, h + 0.4),
          add(A, n, h + 0.4),
        ];
        b.mass(roof, y + 5.4, y + 6, "wall");
        for (const end of [A, B])
          b.piece("doorway", [5.6, 5.4, 0.5], at3(end, y), facing(d), "trim", 0.5);
        CAPITAL_INTERIORS.push({
          center: at3(polar((p + q) / 2, a), y + 2.7),
          half: [h, 2.7, (q - p) / 2],
          yaw: facing(d),
        });
      }
    });
    // The north band reaching around behind the prow tip to the great gate.
    ringFloor("up-band", "toproad", BAND.r0, outer[0], BAND.a0, BAND.a1, y);
    // The retaining wall and its parapet over Grand Street, open where the tunnel climbs in.
    const tunnelA = facingAngle(-27.5, TUNNEL_Z),
      th = 2.6 / r0;
    ringMass(r0 - 1.2, r0, innerStart, tunnelA - th, GROUND, y - 0.4);
    ringMass(r0 - 1.2, r0, tunnelA + th, a1, GROUND, y - 0.4);
    ringMass(r0 - 1.2, r0, tunnelA - th, tunnelA + th, GROUND, Y.tunnel - 1.6);
    parapet(r0 + 0.2, innerStart + 0.02, a1, y, [[tunnelA, 5]]);
    // The outer wall, stepping out round the bulge, and the terrace of houses inside it.
    ringMass(r1, r1 + 1.2, a0, bulge[0], GROUND, y + 3);
    ringMass(r1, r1 + 1.2, bulge[1], BAND.a1, GROUND, y + 3);
    ringMass(bulgeR, bulgeR + 1.2, bulge[0], bulge[1], GROUND, y + 3);
    for (const a of bulge)
      b.wall(polar(r1, a), polar(bulgeR + 1.2, a), GROUND, y + 3, { thickness: 1.2 });
    merlons(r1 + 0.6, a0, bulge[0], y + 3);
    merlons(r1 + 0.6, bulge[1], BAND.a1, y + 3);
    merlons(bulgeR + 0.6, bulge[0], bulge[1], y + 3);
    ringFloor("up-outer-terrace", "toproad", outer[1] - 0.5, bulgeR, bulge[0], bulge[1], y);
    // The inner north, as on the article's map: Up Town wraps right round to the prow,
    // decked over Grand Street's spur and court beneath.
    const tipWest = 6.12,
      tipEast = Math.PI * 2 + 0.16;
    ringFloor("up-north-west", "toproad", r0, BAND.r0, a1, tipWest, y);
    ringFloor("up-north-tip", "toproad", 59.8, BAND.r0, tipWest, tipEast, y);
    ringFloor("up-north-east", "toproad", r0, BAND.r0, tipEast, BAND.a1, y);
    parapet(r0 + 0.2, a1, tipWest, y);
    parapet(r0 + 0.2, tipEast, BAND.a1, y);
    parapet(60, tipWest, tipEast, y);
    rail(polar(r0, tipWest), polar(59.8, tipWest), y);
    rail(polar(r0, tipEast), polar(59.8, tipEast), y);
    rail(polar(r0, BAND.a1), polar(BAND.r0, BAND.a1), y);
    for (const p of [
      [-24, -50],
      [-24, -60],
      [-11, -52],
      [10, -52],
    ] as XZ[])
      pier(p, y - 1, 2);
    // Blocks of houses: Leyndell's "houses as blocks", some of them homes.
    let homes = 0,
      slot = 0;
    const fill = (rA: number, rB: number, s0: number, s1: number, tag: string) => {
      const depth = rB - rA - 1.4;
      for (let a = s0 + 0.01; a < s1 - 0.01;) {
        const rm = rA + 0.7,
          w = 6 + rand() * 4,
          da = w / rm;
        if (a + da > s1 - 0.005) break;
        const mid = a + da / 2;
        // Front the street on the outer side for inner rows, the inner side for outer rows.
        const outward = tag === "in";
        const back = outward ? rA + 0.7 : rB - 0.7,
          t = frame(b, ...polar(back, mid), facing(radial(outward ? mid : mid + Math.PI)));
        const tower = rand() < 0.12;
        if (homes < 4 && !tower && w > 6.4 && tag === "in" && slot++ % 2 === 0) {
          const id = `home-up-${homes++}`;
          const hd = avenue[0] + 0.1 - back;
          house(t, {
            id,
            area: "toproad",
            x0: -w / 2,
            z0: 0,
            x1: w / 2,
            z1: hd,
            base: y,
            doors: [{ side: "s", c: 0 }],
          });
          t.rect(`${id}:apron`, "toproad", -1.8, hd + 0.1, 1.8, hd + 2.4, y, {
            render: false,
            thickness: 0.1,
          });
          CAPITAL_HOMES.push({
            id,
            area: "toproad",
            spot: t.world([0, hd * 0.55], y),
            approach: [t.world([0, hd + 2], y), t.world([0, hd - 1], y)],
          });
        } else
          block(t, {
            x: 0,
            z: 0,
            w: w - 0.4,
            depth: Math.min(depth, tower ? 6 : depth),
            y,
            storeys: tower ? 4 : 1 + Math.floor(rand() * 3),
            tower,
            rand,
          });
        a += da + 0.006;
      }
    };
    const cuts = [a0, ...radials.flatMap((a) => [a - 2.6 / 58, a + 2.6 / 58]), a1];
    for (let i = 0; i < cuts.length; i += 2) {
      fill(inner[1], avenue[0], Math.max(cuts[i], innerStart), cuts[i + 1], "in");
      fill(avenue[1], outer[0], cuts[i] + (i === 0 ? 0.07 : 0.01), cuts[i + 1] - 0.01, "out");
    }
    // The band keeps clear of the Top-Left Road and the great gate stair.
    fill(BAND.r0 + 2, outer[0], 6.22, BAND.a1 - 0.08, "out");
    // Houses along the bulge's terrace, backing onto its wall and facing the outer street.
    fill(outer[1] + 1.2, bulgeR - 0.2, bulge[0] + 0.03, bulge[1] - 0.03, "out");
    for (let a = a0 + 0.03; a < BAND.a1; a += 0.1) lantern(polar(outer[0] + 0.8, a), y);
    for (let a = a0 + 0.05; a < a1; a += 0.12) lantern(polar(avenue[0] + 0.8, a), y);
    // A square with the keepers' statue on the avenue, and a giant sword.
    statue(polar(65, 5.0), y, -5.0, 1.6);
    sword(polar(65, 5.45), y, 0.4, 1);
    sword(polar(51, 4.62), y, -0.3, 0.8);
    // The Top-Left Road: from the band up to the prow's tip platform.
    b.floor(
      "top-left-landing",
      "toproad",
      [
        [-26, -71],
        [-21.5, -71],
        [-21.5, -66],
        [-26, -66],
      ],
      y,
    );
    b.flight("top-left-road", "toproad", [-22, y, -68.5], [1, 0], Y.tip - y, 4.6);
    // A covered stair hall, like the reference's enclosed climb between rooms.
    for (const z of [-70.95, -66.05])
      b.wall([-21.5, z], [-6.9, z], y, Y.tip + 4.5, { thickness: 0.4, material: "wall" });
    b.mass(
      [
        [-22.3, -71.3],
        [-6.9, -71.3],
        [-6.9, -65.7],
        [-22.3, -65.7],
      ],
      Y.tip + 4.5,
      Y.tip + 5.1,
      "roof",
    );
    interior(-22, y, -70.75, -6.9, Y.tip + 4.5, -66.25);
    // A pier carries the flight's upper half, its top just under the steps.
    pier([-10, -68.5], Y.upTown + ((Y.tip - Y.upTown) * 11) / 15 - 0.7, 2);
    // The stair from the band up to the great gate.
    const gateLanding: XZ[] = [
      [20.1, -75],
      [28, -75],
      [28, -80],
      [21.5, -80],
    ];
    b.floor("gate-landing", "toproad", gateLanding, y);
    b.mass(gateLanding, GROUND, y - 0.6);
    const top = b.flight("great-gate-stair", "toproad", [24, y, -80], [0, -1], Y.wall - y, 4.6, {
      fill: GROUND,
    });
    // The landing before the great gate reaches the curtain's inner face.
    const gateEnd = -Math.sqrt(W.r0 ** 2 - 21.7 ** 2) - 0.1;
    b.rect("great-gate-landing", "refuge", 21.7, gateEnd, 26.3, top[2] + 0.05, Y.wall);
    b.mass(
      [
        [21.7, gateEnd],
        [26.3, gateEnd],
        [26.3, top[2]],
        [21.7, top[2]],
      ],
      GROUND,
      Y.wall - 0.6,
    );
    b.wall([21.4, -80], [21.4, gateEnd + 0.4], Y.upTown, Y.wall + 1.1, {
      thickness: 0.6,
      material: "wall",
    });
    b.wall([26.6, -75], [26.6, -Math.sqrt(W.r0 ** 2 - 26.6 ** 2) + 0.3], Y.upTown, Y.wall + 1.1, {
      thickness: 0.6,
      material: "wall",
    });
    // The bridge from the beacon tower's top into the quarter's south-west end.
    b.rect("up-beacon-link", "toproad", -86, 15.5, -79.5, 20.5, y);
    b.mass(
      [
        [-86, 15.5],
        [-79.5, 15.5],
        [-79.5, 20.5],
        [-86, 20.5],
      ],
      GROUND,
      y - 0.6,
    );
  }

  // ---------------------------------------------------------------- blade and plaza
  function bladeAndPlaza() {
    const y = Y.plaza,
      outline = (z: number, s: number): XZ => [s * bladeHalfWidth(z), z];
    // The tip platform where the Top-Left Road arrives.
    b.rect("tip-platform", "yard", -7, -72, 7, -63, Y.tip);
    // The Hollow Marshal monument at the end of the blade walk.
    {
      const z = -70,
        t = Y.tip;
      const size: ParishPoint = [3.7, 6.4, 4.4];
      const scale = Math.min(
        size[1],
        size[0] / capitalMountedPlacement.width,
        size[2] / capitalMountedPlacement.depth,
      );
      const { position, size: base } = capitalMountedPlacement.base;
      b.piece("equestrian-statue", size, [0, t, z + 0.3], 0, "gold");
      b.solid(
        [position[0] * scale, t + position[1] * scale, z + 0.3 + position[2] * scale],
        [base[0] * scale, base[1] * scale, base[2] * scale],
        0,
      );
    }
    rail([-7, -72], [7, -72], Y.tip);
    rail([7, -72], [7, -63.2], Y.tip);
    rail([-7, -72], [-7, -71.2], Y.tip);
    for (const [x, z] of [
      [-6, -71],
      [6, -71],
      [6, -64.5],
    ])
      pier([x, z], Y.tip - 0.6, 1.4);
    // The blade walk climbs from the tip to the plaza in two flights of steps.
    const piece = (id: string, z0: number, z1: number, h: number) =>
      b.floor(id, "yard", [outline(z0, -1), outline(z1, -1), outline(z1, 1), outline(z0, 1)], h);
    piece("blade-tip", -63.01, -58, Y.tip);
    piece("blade-neck", -58, -50, Y.tip);
    b.flight("blade-stair-1", "yard", [0, Y.tip, -50], [0, 1], 4, 9);
    piece("blade-mid", -44, -34, Y.tip + 4);
    b.flight("blade-stair-2", "yard", [0, Y.tip + 4, -34], [0, 1], 4, 12);
    // The blade's root is cut around the arena lift shaft.
    // The arena lift rises west of the colosseum corridor, leaving Grand Street's ring
    // free to pass round the prow's foot.
    const shaft = { x0: -9.5, x1: -3.5, z0: -27, z1: -21 };
    b.rect("blade-root-west", "yard", -11, -28, shaft.x0, -12, y);
    b.rect("blade-root-east", "yard", shaft.x1, -28, 11, -12, y);
    b.rect("blade-root-north", "yard", shaft.x0, -28, shaft.x1, shaft.z0, y);
    b.rect("blade-root-south", "yard", shaft.x0, shaft.z1, shaft.x1, -12, y);
    // Solid cheeks beside the flights carry the blade's edge up with them.
    for (const [z0, z1, h0, half] of [
      [-50, -44, Y.tip, 4.5],
      [-34, -28, Y.tip + 4, 6],
    ] as const)
      for (const s of [-1, 1]) {
        const quad: XZ[] = [
          [s * half, z0],
          [s * bladeHalfWidth(z0), z0],
          [s * bladeHalfWidth(z1), z1],
          [s * half, z1],
        ];
        b.mass(quad, h0 - 0.6, h0 + 4, "wall");
      }
    // Parapets along both edges.
    for (const s of [-1, 1])
      for (const [z0, z1, h] of [
        [-63, -58, Y.tip],
        [-58, -50, Y.tip],
        [-50, -44, Y.tip + 4],
        [-44, -34, Y.tip + 4],
        [-34, -28, y],
        [-28, -12, y],
      ] as const)
        rail(outline(z0, s), outline(z1, s), h);
    // Railings around the shaft, open on the boarding (east) side.
    rail([shaft.x0 - 0.2, shaft.z0 - 0.2], [shaft.x1, shaft.z0 - 0.2], y);
    rail([shaft.x0 - 0.2, shaft.z1 + 0.2], [shaft.x1, shaft.z1 + 0.2], y);
    rail([shaft.x0 - 0.2, shaft.z0 - 0.2], [shaft.x0 - 0.2, shaft.z1 + 0.2], y);
    b.piece("elevator", [6.6, 4, 6.6], [-6.5, y - 0.3, -24], Math.PI / 2, "iron", 0.3);
    // The prow beneath: a sheer masonry keel down to the ground, hollow for its passages.
    const flank = (s: 1 | -1) => {
      const zs = [-58, -50, -44, -34, -28, -12];
      for (let i = 0; i + 1 < zs.length; i++) {
        const z0 = zs[i],
          z1 = zs[i + 1],
          h0 = bladeHalfWidth(z0),
          h1 = bladeHalfWidth(z1),
          ceil = (z0 < -50 ? Y.tip : z0 < -34 ? Y.tip + 4 : y) - 0.7;
        const quad = (bottom: number, top: number, za: number, zb: number) => {
          const ha = h0 + ((h1 - h0) * (za - z0)) / (z1 - z0),
            hb = h0 + ((h1 - h0) * (zb - z0)) / (z1 - z0);
          b.mass(
            [
              [s * (ha - 1.2), za],
              [s * ha, za],
              [s * hb, zb],
              [s * (hb - 1.2), zb],
            ],
            bottom,
            top,
          );
        };
        const top = z0 === -50 || z0 === -34 ? (z0 === -50 ? Y.tip : Y.tip + 4) - 0.6 : ceil;
        // Openings through the keel: the Mountain Tunnel, and the arch where Grand
        // Street's ring passes round the foot of the central mountain.
        const holes = [
          { za: TUNNEL_Z - 2.6, zb: TUNNEL_Z + 2.6, bottom: Y.tunnel - 0.4, top: Y.tunnel + 4.8 },
          { za: -33, zb: -19.5, bottom: GROUND, top: Y.plain + 6 },
        ];
        const cuts = [z0, z1, ...holes.flatMap((h) => [h.za, h.zb])]
          .filter((z) => z >= z0 && z <= z1)
          .sort((p, q) => p - q);
        for (let k = 0; k + 1 < cuts.length; k++) {
          const za = cuts[k],
            zb = cuts[k + 1];
          if (zb - za < 1e-3) continue;
          const open = holes.filter((h) => h.za <= za + 1e-6 && h.zb >= zb - 1e-6);
          let y0 = GROUND;
          for (const h of open.sort((p, q) => p.bottom - q.bottom)) {
            if (h.bottom - y0 > 0.05) quad(y0, h.bottom, za, zb);
            y0 = Math.max(y0, h.top);
          }
          if (top - y0 > 0.05) quad(y0, top, za, zb);
        }
      }
    };
    flank(1);
    flank(-1);
    // The keel's bow: the colosseum gate opens into the mountain.
    for (const [x0, x1] of [
      [-5, -2.4],
      [2.4, 5],
    ])
      b.mass(
        [
          [x0, -59.2],
          [x1, -59.2],
          [x1, -58],
          [x0, -58],
        ],
        GROUND,
        Y.tip - 0.7,
      );
    b.mass(
      [
        [-2.4, -59.2],
        [2.4, -59.2],
        [2.4, -58],
        [-2.4, -58],
      ],
      COURT_Y + 5.4,
      Y.tip - 0.7,
    );
    b.piece("doorway", [5.6, 5.4, 0.8], [0, COURT_Y, -59.6], 0, "piece", 0.4);
    // Giant swords stand beside the blade.
    sword([-18, -54], Y.upTown, 0.5, 1.3);
    sword([13, -56], Y.upTown, -0.4, 1.1);
    // The Ultimate Plaza: a round court of statues on the central mountain.
    const R = CAPITAL_RINGS.plaza,
      n = 20,
      step = (Math.PI * 2) / n,
      ring = Array.from({ length: n }, (_, i) => polar(R, i * step + step / 2));
    b.floor("plaza", "yard", ring, y, { thickness: 1 });
    b.rect("plaza-east-wing", "yard", 15, -2.6, 16.6, 2.6, y);
    b.rect("plaza-west-balcony", "yard", -20, -4, -15, 4, y);
    rail([-20, -4], [-20, 4], y);
    rail([-20, -4], [-15.6, -4], y);
    rail([-20, 4], [-15.6, 4], y);
    for (let i = 0; i < n; i++) {
      const a0 = i * step + step / 2,
        a1 = a0 + step,
        am = (a0 + a1) / 2;
      // Open to the blade (north), the chapel (south) and both wings.
      if (am < 0.75 || am > Math.PI * 2 - 0.75) continue;
      if (Math.abs(am - Math.PI) < 0.5) continue;
      if (Math.abs(am - Math.PI / 2) < 0.2 || Math.abs(am - Math.PI * 1.5) < 0.3) continue;
      rail(polar(R - 0.2, a0), polar(R - 0.2, a1), y);
    }
    ringMass(R - 1.4, R, 0.75, Math.PI * 2 - 0.75, 6, y - 1);
    for (const a of [1.0, 1.95, 4.4, 5.3]) statue(polar(12.5, a), y, Math.PI - a, 1.3);
    for (const a of [0.9, 2.2, 4.1, 5.4]) lantern(polar(14.4, a), y);
    lantern([-3.5, -40], Y.tip + 4);
    lantern([3.5, -40], Y.tip + 4);
    lantern([-1.6, -58], Y.tip);
    lantern([1.6, -58], Y.tip);
  }

  // ---------------------------------------------------------------- Oblivion Chapel
  function chapel() {
    const { x0, x1, z0, z1 } = CAPITAL_CATHEDRAL.chapel,
      y = Y.citadel,
      roof = y + 8.4;
    interior(x0 + 0.3, y, z0 + 0.3, x1 - 0.3, roof - 0.6, z1 - 0.3);
    b.rect("chapel", "kiln", x0 + 0.3, z0 + 0.3, x1 - 0.3, z1 - 0.3, y);
    b.enclosure(
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
      y,
      roof - 0.6,
      {
        thickness: 0.6,
        openings: {
          0: [
            {
              at: 12,
              width: 4,
              bottom: y,
              height: 5,
              frame: "double-door",
              id: "chapel-north",
              area: "kiln",
            },
          ],
          1: [
            {
              at: 6.5,
              width: 3,
              bottom: y,
              height: 4,
              id: "chapel-east",
              area: "aqueduct",
              visibleThreshold: true,
            },
          ],
          2: [
            {
              at: 12,
              width: 4,
              bottom: y,
              height: 5,
              frame: "double-door",
              id: "chapel-south",
              area: "kiln",
            },
          ],
        },
      },
    );
    b.rooms.push({
      id: "chapel",
      width: x1 - x0 - 0.6,
      depth: z1 - z0 - 0.6,
      height: 7.8,
      high: true,
    });
    // The walkable roof, reached from the cathedral rafters, with a stair down inside
    // along the west wall.
    b.rect("chapel-roof", "kiln", -8.3, z0, x1, z1, roof, { material: "roof" });
    b.rect("chapel-roof-landing", "kiln", x0 + 0.3, z0 + 0.9 + 12.57, -7.9, z1 - 0.3, roof, {
      material: "roof",
    });
    b.mass(
      [
        [x0, z0],
        [-8.3, z0],
        [-8.3, z0 + 0.3],
        [x0, z0 + 0.3],
      ],
      roof - 0.6,
      roof,
      "roof",
    );
    for (const [p, q] of [
      [
        [x0, z1],
        [x1, z1],
      ],
      [
        [x1, z0],
        [x1, z1],
      ],
      [
        [x0, z0],
        [x1, z0],
      ],
      [
        [-8.3, z0],
        [-8.3, z1 - 3],
      ],
    ] as Array<[XZ, XZ]>)
      rail(p, q, roof);
    b.flight("chapel-roof-stair", "kiln", [-10, y, z0 + 0.9], [0, 1], roof - y, 2.8, { fill: y });
    // A flight on the roof climbs to the narthex roof and the rafters.
    const up = b.flight(
      "chapel-rafter-stair",
      "kiln",
      [0, roof, z0 + 6],
      [0, 1],
      Y.rafter - roof,
      2.4,
    );
    b.bridge(
      "chapel-rafter-bridge",
      "kiln",
      [0, up[2] - 0.05],
      [0, CAPITAL_CATHEDRAL.narthex.z0 + 0.3],
      Y.rafter,
      2.4,
      {
        kind: "slab",
      },
    );
    for (const s of [-1, 1])
      b.wall([s * 1.4, z0 + 6], [s * 1.4, up[2]], roof, Y.rafter + 1.1, {
        thickness: 0.4,
        material: "trim",
      });
    // Altar, candles, benches and a banner; the shrine stands in the aisle.
    b.box(0, z1 - 2.5, y, [4, 1.1, 1.4], 0, "trim");
    for (const x of [-1.5, 0, 1.5]) b.box(x, z1 - 2.5, y + 1.1, [0.2, 0.5, 0.2], 0, "glow", false);
    b.piece("banner", [2.4, 5, 0.06], [0, y + 2.6, z1 - 0.65], 0, "cloth");
    for (const z of [z0 + 4.5, z0 + 7])
      for (const x of [-4.2, 4.2])
        b.prop("crate", [3.2, 0.5, 0.6], [x, y, z], 0, { material: "timber" });
    // Colonnades down both sides make a nave of it, lamps glowing between the columns.
    for (const z of [z0 + 3.3, z0 + 11])
      for (const x of [-7.6, 7.6]) b.pillar(x, z, y, roof - y - 0.6, 1.1, "trim");
    for (const z of [z0 + 7.2]) for (const x of [-6.8, 6.8]) lantern([x, z], y);
    b.piece("spire", [5, 9, 5], [8, roof, z0 + 4], 0, "roof");
    lantern([3.5, z0 - 1.2], y);
    lantern([-3.5, z0 - 1.2], y);
  }

  // ---------------------------------------------------------------- Asylum Cathedral
  function cathedral() {
    const y = Y.citadel,
      g = Y.gallery,
      r = Y.rafter,
      { narthex: N, transept: T, hall: H } = CAPITAL_CATHEDRAL,
      top = y + 22;
    interior(-2.5, y, CAPITAL_CATHEDRAL.chapel.z1, 2.5, y + 5.4, N.z0);
    interior(N.x0 + 0.3, y, N.z0 + 0.3, N.x1 - 0.3, r - 0.6, N.z1 - 0.3);
    interior(-2.4, y, N.z1, 2.4, y + 5.4, T.z0);
    interior(T.x0 + 0.3, y, T.z0 + 0.3, T.x1 - 0.3, top - 1, T.z1 - 0.3);
    interior(H.x0 + 0.3, y, H.z0 - 0.3, H.x1 - 0.3, top - 1, H.z1);
    interior(-12, y, H.z1, 12, top - 1, 112);
    interior(-5, y, 112, 5, top - 1, CAPITAL_CATHEDRAL.apseTip - 0.3);
    const slab = (x0: number, z0: number, x1: number, z1: number, bottom: number, t: number) =>
      b.mass(
        [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ],
        bottom,
        bottom + t,
        "roof",
      );
    // The vestibule between the chapel and the barred front door.
    b.rect(
      "cathedral-vestibule",
      "kiln",
      -2.5,
      CAPITAL_CATHEDRAL.chapel.z1 - 0.3,
      2.5,
      N.z0 + 0.3,
      y,
      {
        threshold: true,
        render: true,
      },
    );
    for (const x of [-2.8, 2.8])
      b.wall([x, CAPITAL_CATHEDRAL.chapel.z1], [x, N.z0], y, y + 5.4, { thickness: 0.6 });
    slab(-3.1, CAPITAL_CATHEDRAL.chapel.z1, 3.1, N.z0, y + 5.4, 0.4);
    // Narthex, with a walkable roof the rafter walk crosses.
    b.rect("narthex", "cloister", N.x0 + 0.3, N.z0 + 0.3, N.x1 - 0.3, N.z1 - 0.3, y);
    b.enclosure(
      [
        [N.x0, N.z0],
        [N.x1, N.z0],
        [N.x1, N.z1],
        [N.x0, N.z1],
      ],
      y,
      r - 0.6,
      {
        thickness: 0.6,
        openings: {
          0: [
            {
              at: 9,
              width: 4.4,
              bottom: y,
              height: 5,
              frame: "double-door",
              id: "cathedral-front",
              area: "cloister",
            },
          ],
          2: [{ at: 9, width: 4, bottom: y, height: 5, id: "narthex-south", area: "cloister" }],
        },
      },
    );
    b.rooms.push({ id: "narthex", width: 17.4, depth: 12.4, height: 13, high: true });
    b.rect("narthex-roof", "cloister", N.x0, N.z0, N.x1, N.z1, r, { material: "roof" });
    rail([N.x0, N.z0], [-1.4, N.z0], r);
    rail([1.4, N.z0], [N.x1, N.z0], r);
    rail([N.x0, N.z1], [-1.4, N.z1], r);
    rail([1.4, N.z1], [N.x1, N.z1], r);
    b.rect("narthex-link", "cloister", -2.4, N.z1 - 0.3, 2.4, T.z0 + 0.3, y);
    for (const x of [-2.7, 2.7]) b.wall([x, N.z1], [x, T.z0], y, y + 5.4, { thickness: 0.6 });
    slab(-3, N.z1, 3, T.z0, y + 5.4, 0.4);
    b.bridge("rafter-narthex-bridge", "cloister", [0, N.z1 - 0.3], [0, T.z0 + 0.6], r, 2.4, {
      kind: "slab",
    });
    // The front towers over the narthex: the landmark seen from the city wall.
    for (const s of [-1, 1]) {
      b.box(s * 6.5, N.z0 + 3, r, [5, 26, 5], 0, "wall");
      b.piece("spire", [6, 14, 6], [s * 6.5, r + 26, N.z0 + 3], 0, "roof");
    }
    b.piece("ring", [6, 6, 0.6], [0, y + 6.4, N.z0 - 0.35], 0, "glow");
    // Transept: the boss door south, the narthex north, and openings for the gallery
    // links and the rafter spine.
    b.rect("transept", "cloister", T.x0 + 0.3, T.z0 + 0.3, T.x1 - 0.3, T.z1 - 0.3, y);
    b.enclosure(
      [
        [T.x0, T.z0],
        [T.x1, T.z0],
        [T.x1, T.z1],
        [T.x0, T.z1],
      ],
      y,
      top,
      {
        thickness: 0.6,
        openings: {
          0: [
            { at: 28, width: 4, bottom: y, height: 5, id: "transept-north", area: "cloister" },
            {
              at: 28,
              width: 2.4,
              bottom: r,
              height: 3.4,
              frame: "none",
              area: "cloister",
              id: "rafter-north",
            },
          ],
          2: [
            {
              at: 28,
              width: 6,
              bottom: y,
              height: 6,
              id: "hall-door",
              area: "cloister",
              frame: "double-door",
            },
            {
              at: 28,
              width: 2.4,
              bottom: r,
              height: 3.4,
              frame: "none",
              area: "cloister",
              id: "rafter-south",
            },
            {
              at: 12.5,
              width: 4.4,
              bottom: g,
              height: 4,
              frame: "none",
              area: "cloister",
              id: "gallery-east-link",
            },
            {
              at: 43.5,
              width: 4.4,
              bottom: g,
              height: 4,
              frame: "none",
              area: "cloister",
              id: "gallery-west-link",
            },
          ],
        },
      },
    );
    b.rooms.push({ id: "transept", width: 55.4, depth: 13.4, height: 21, high: true });
    // The hall: the keeper's nave, its aisles and the apse.
    const apse: XZ[] = [
      [H.x0 + 0.3, H.z0],
      [H.x1 - 0.3, H.z0],
      [H.x1 - 0.3, H.z1],
      [12, 112],
      [5, CAPITAL_CATHEDRAL.apseTip - 0.3],
      [-5, CAPITAL_CATHEDRAL.apseTip - 0.3],
      [-12, 112],
      [H.x0 + 0.3, H.z1],
    ];
    b.floor("hall", "cloister", apse, y);
    const shell: XZ[] = [
      [H.x1, H.z0],
      [H.x1, H.z1],
      [12.3, 112.3],
      [5.2, CAPITAL_CATHEDRAL.apseTip],
      [-5.2, CAPITAL_CATHEDRAL.apseTip],
      [-12.3, 112.3],
      [H.x0, H.z1],
      [H.x0, H.z0],
    ];
    for (let i = 0; i + 1 < shell.length; i++) {
      const openings: CapitalOpening[] = [];
      if (i === 0)
        openings.push({
          at: 26,
          width: 3,
          bottom: g,
          height: 4,
          id: "gallery-east-door",
          area: "aqueduct",
          visibleThreshold: true,
        });
      if (i === 3)
        openings.push({
          at: 5.2,
          width: 3.6,
          bottom: y,
          height: 4.4,
          id: "apse-door",
          area: "belfry",
          frame: "door",
        });
      b.wall(shell[i], shell[i + 1], y, top, { thickness: 0.6, openings });
    }
    b.rooms.push({ id: "hall", width: 35.4, depth: 41, height: 21, high: true });
    // Nave arcade: pillars carry the galleries, clear of the keeper's circle.
    for (let z = H.z0 + 4; z < H.z1 - 2; z += 7)
      for (const s of [-1, 1]) b.pillar(s * 12.6, z, y, g - y - 0.6, 1.4, "trim");
    // Galleries (F2) along both aisles and the transept's north wall, joined over the
    // transept floor; the outside path enters on the east.
    // The gallery's edge meets the top of its stair exactly, so the climb has no lip.
    const gn = T.z1 - 1.4 - Math.round((g - y) / 0.2) * 0.3,
      ge = H.z1 - 0.4;
    b.rect("gallery-east", "cloister", 13.3, H.z0 + 0.6, 17.7, ge, g);
    b.rect("gallery-west", "cloister", -17.7, H.z0 + 0.6, -13.3, ge, g);
    b.rect("gallery-east-link", "cloister", 13.3, gn, 17.7, H.z0 + 0.6, g);
    b.rect("gallery-west-link", "cloister", -17.7, gn, -13.3, H.z0 + 0.6, g);
    b.rect("gallery-north", "cloister", T.x0 + 0.3, T.z0 + 0.3, T.x1 - 0.3, gn, g);
    b.rect("gallery-east-arm", "cloister", 21, gn, T.x1 - 0.3, T.z1 - 0.6, g);
    for (const x of [13.3, -13.3]) rail([x, gn], [x, ge], g);
    for (const [x0, x1] of [
      [T.x0 + 0.3, -23.6],
      [-20.4, -17.7],
      [-13.3, 13.3],
      [17.7, 21],
    ])
      rail([x0, gn], [x1, gn], g);
    rail([21, gn], [21, T.z1 - 0.6], g);
    rail([17.7, T.z1 - 0.6], [21, T.z1 - 0.6], g);
    // The ladder stair from the gallery down to the transept floor (west arm).
    b.flight("gallery-stair", "cloister", [-22, y, T.z1 - 1.4], [0, -1], g - y, 3, { fill: y });
    // The rafters: a stair in the east arm, a beam to the spine running the length of
    // the church, cross beams and a chandelier ring over the keeper's circle.
    const rz = T.z1 - 3;
    const rs = b.flight("rafter-stair", "cloister", [27, g, rz], [-1, 0], r - g, 3);
    b.rect("rafter-link", "cloister", 0.6, rz - 1.5, rs[0] + 0.03, rz + 1.5, r, {
      material: "timber",
      thickness: 0.6,
    });
    b.rect("rafter-spine", "cloister", -1, T.z0 - 0.4, 1, H.z1, r, {
      material: "timber",
      thickness: 0.6,
    });
    const boss = CAPITAL_SITES.apse[2];
    for (const z of [boss - 8, boss + 8, H.z1 - 2]) {
      b.rect(`rafter-cross-${z}`, "cloister", -16, z - 1, -0.6, z + 1, r, {
        material: "timber",
        thickness: 0.6,
      });
      b.rect(`rafter-cross-${z}-e`, "cloister", 0.6, z - 1, 16, z + 1, r, {
        material: "timber",
        thickness: 0.6,
      });
    }
    b.arc(
      "rafter-chandelier",
      "cloister",
      0,
      boss,
      2.4,
      4.4,
      Math.PI / 8,
      Math.PI * 2 + Math.PI / 8,
      r,
      12,
      "timber",
    );
    b.box(0, boss, r - 6, [1.2, 5.4, 1.2], 0, "iron", false);
    b.box(0, boss, r - 7.4, [5, 1.2, 5], 0, "glow", false);
    // Roofs: a steep gable over the transept and the hall, a dome over the apse.
    b.piece(
      "roof",
      [T.z1 - T.z0 + 1, 10, T.x1 - T.x0 + 1],
      [0, top, (T.z0 + T.z1) / 2],
      Math.PI / 2,
      "roof",
      0.4,
    );
    b.piece(
      "roof",
      [H.x1 - H.x0 + 1, 14, H.z1 - H.z0 + 1],
      [0, top, (H.z0 + H.z1) / 2],
      0,
      "roof",
      0.4,
    );
    b.piece("dome", [24, 10, 12], [0, top, 108], 0, "roof");
    for (const [x, z] of [
      [-28, 49],
      [28, 49],
      [-28, 63],
      [28, 63],
      [18, 104],
      [-18, 104],
    ])
      b.piece("spire", [3, 9, 3], [x, top, z], 0, "roof");
    // Tall lancet windows down the nave and across the transept and front, as in the
    // reference's gothic church: a dark glazing panel inside a kit arch frame.
    const lancet = (x: number, z: number, yaw: number, bottom: number, h: number) => {
      const out = facing([Math.sin(yaw), Math.cos(yaw)]);
      b.piece("arch-panel", [1.5, h - 0.2, 0.06], [x, bottom + 0.1, z], out, "shadow");
      b.piece(
        "arch-window",
        [2, h, 0.25],
        [x + Math.sin(yaw) * 0.05, bottom, z + Math.cos(yaw) * 0.05],
        out,
        "trim",
        0.2,
      );
    };
    for (let z = H.z0 + 6; z < H.z1 - 3; z += 7)
      for (const s of [-1, 1]) {
        if (s > 0 && Math.abs(z - (H.z0 + 26)) < 4) continue;
        lancet(s * (H.x1 + 0.32), z, (s * Math.PI) / 2, g + 4.5, 8);
      }
    for (let x = T.x0 + 4; x < T.x1 - 3; x += 7) {
      if (Math.abs(x) < 4) continue;
      lancet(x, T.z0 - 0.32, Math.PI, y + 7, 9);
      if (Math.abs(x) > H.x1 + 2) lancet(x, T.z1 + 0.32, 0, y + 7, 9);
    }
    for (const s of [-1, 1])
      lancet(s * (T.x1 + 0.32), (T.z0 + T.z1) / 2, (s * Math.PI) / 2, y + 7, 9);
    for (const x of [-5, 5]) lancet(x, N.z0 - 0.32, Math.PI, y + 6, 6);
    // Buttresses along the hall's west flank, and a light ceiling of masonry.
    for (let z = H.z0 + 9.5; z < H.z1 - 3; z += 7) {
      b.box(-19.2, z, y + 6, [1.8, top - y - 8, 1.4], 0, "wall", false);
      b.box(-19.2, z, top - 2, [2.2, 0.45, 1.8], 0, "trim", false);
      b.piece("pillar", [1.3, 2.4, 1.3], [-19.2, top - 1.55, z], 0, "trim");
      b.piece("spire", [1.7, 4.2, 1.7], [-19.2, top + 0.85, z], 0, "roof");
    }
    slab(H.x0, H.z0, H.x1, H.z1, top - 1, 1);
    slab(T.x0, T.z0, T.x1, T.z1, top - 1, 1);
    // Dressing: a red runner, banners on the pillars and braziers in the apse.
    b.box(0, (H.z0 + H.z1) / 2, y, [3, 0.04, H.z1 - H.z0 - 2], 0, "cloth", false);
    for (let z = H.z0 + 4; z < H.z1 - 2; z += 14)
      for (const s of [-1, 1])
        b.piece("banner", [1.2, 4.5, 0.06], [s * 12.6, y + 1.5, z - 0.8], 0, "cloth");
    for (const [x, z] of [
      [-7, 110],
      [7, 110],
      [-12, 106],
      [12, 106],
    ])
      brazier([x, z], y);
    for (const [x, z] of [
      [-6, T.z1 - 1.5],
      [6, T.z1 - 1.5],
      [-6, N.z1 - 1.5],
      [6, N.z1 - 1.5],
    ])
      lantern([x, z], y);
    for (const z of [70, 85, 100]) for (const s of [-1, 1]) lantern([s * 16.8, z], g);
    // The keeper's apse holds the switch that lifts the fog.
    b.box(0, 111, y, [3, 1, 2], 0, "trim");
  }

  // ---------------------------------------------------------------- Church Outside Path
  function outsidePath() {
    const y = Y.citadel,
      { transept: T, hall: H } = CAPITAL_CATHEDRAL,
      cx = CAPITAL_CATHEDRAL.chapel.x1,
      turn = H.z0 + 5;
    b.rect("outside-ledge", "aqueduct", cx + 0.3, 19.5, 26, 24.5, y);
    b.rect("outside-north", "aqueduct", 21, 24.5, 26, T.z0 - 4.5, y);
    // Its first stretch is a covered colonnade beside the narthex.
    for (let z = 26; z < T.z0 - 4.5; z += 4)
      for (const x of [21.3, 25.7]) b.pillar(x, z, y, 5.3, 0.8, "timber");
    b.mass(
      [
        [20.8, 24.5],
        [26.2, 24.5],
        [26.2, T.z0 - 4.5],
        [20.8, T.z0 - 4.5],
      ],
      y + 5.3,
      y + 5.9,
      "roof",
    );
    interior(21.2, y, 24.5, 25.8, y + 5.3, T.z0 - 4.5);
    b.rect("outside-corner", "aqueduct", 21, T.z0 - 4.5, 34, T.z0, y);
    b.rect("outside-arm", "aqueduct", T.x1 + 0.3, T.z0, 34, turn, y);
    b.rect("outside-turn", "aqueduct", 19.5, T.z1 + 0.3, T.x1 + 0.3, turn, y);
    const walkZ = (T.z0 + T.z1) / 2 + 1;
    for (const [p, q] of [
      [
        [26, 19.5],
        [26, T.z0 - 4.5],
      ],
      [
        [34, T.z0 - 4.5],
        [34, walkZ - 2.2],
      ],
      [
        [34, walkZ + 2.2],
        [34, turn],
      ],
      [
        [21, 24.5],
        [21, T.z0 - 4.5],
      ],
      [
        [cx + 0.3, 19.5],
        [26, 19.5],
      ],
      [
        [25.5, turn],
        [34, turn],
      ],
    ] as Array<[XZ, XZ]>)
      rail(p, q, y);
    b.mass(
      [
        [cx, 19],
        [34.4, 19],
        [34.4, turn + 0.4],
        [cx, turn + 0.4],
      ],
      GROUND,
      y - 0.6,
      "wall",
    );
    // Stepping platforms climb the hall's flank to the east gallery door.
    b.rect("outside-step-1", "aqueduct", 19.5, turn, 25.5, turn + 4, y);
    const p2 = b.flight("outside-path-stair", "aqueduct", [22.5, y, turn + 4], [0, 1], 3.5, 4.4, {
      fill: y,
    });
    b.rect("outside-step-2", "aqueduct", 19.5, p2[2], 25.5, p2[2] + 4.5, y + 3.5);
    const p3 = b.flight(
      "outside-path-stair-2",
      "aqueduct",
      [22.5, y + 3.5, p2[2] + 4.5],
      [0, 1],
      3.5,
      4.4,
      {
        fill: y,
      },
    );
    const s3 = p3[2] + 5.5;
    b.rect("outside-step-3", "aqueduct", H.x1 + 0.3, p3[2], 25.5, s3, Y.gallery);
    // From the last platform a flight falls to the garden's tail beside the apse.
    const tail = descend(
      "outside-garden-tail-stair",
      "graveyard",
      [22.5, Y.gallery, s3 - 0.05],
      [0, 1],
      Y.gallery - Y.garden,
      4.4,
      GROUND,
    );
    b.mass(
      [
        [19.3, turn],
        [25.7, turn],
        [25.7, s3],
        [19.3, s3],
      ],
      GROUND,
      y - 0.6,
    );
    rail([25.6, p3[2]], [25.6, s3], Y.gallery);
    rail([H.x1 + 0.3, s3], [20.1, s3], Y.gallery);
    rail([25.6, p2[2]], [25.6, p2[2] + 4.5], y + 3.5);
    rail([19.4, p2[2]], [19.4, p2[2] + 4.5], y + 3.5);
    rail([19.4, turn], [19.4, turn + 4], y);
    rail([25.6, turn + 0.2], [25.6, turn + 4], y);
    gardenTailZ = tail[2];
    // The branch east to the Royal Backyard.
    b.bridge("outside-garden-walk", "aqueduct", [34, walkZ], [46, walkZ], y, 4, { kind: "slab" });
    b.flight("outside-garden-stair", "graveyard", [46, y, walkZ], [1, 0], Y.garden - y, 4, {
      fill: GROUND,
    });
    for (const z of [walkZ - 2.2, walkZ + 2.2])
      b.wall([46, z], [52, z], y, Y.garden + 1.1, { thickness: 0.4, material: "trim" });
    pier([40, walkZ], y - 0.9, 2.4);
    lantern([24, 30], y);
    lantern([31, T.z0 + 3], y);
    lantern([24, turn + 2], y);
  }

  // ---------------------------------------------------------------- Royal Backyard
  function royalBackyard() {
    const y = Y.garden;
    const walkZ = (CAPITAL_CATHEDRAL.transept.z0 + CAPITAL_CATHEDRAL.transept.z1) / 2 + 1;
    // The garden's outline is traced from the article's area map: widest across the
    // middle, narrowing to the south, with a tail sweeping west to the apse.
    const tail = convexHull([
      [21, 101],
      [85, 101],
      [83, 107],
      [69, 113],
      [66, 125],
      [55.5, 131],
      [53.5, 137],
      [46, 141],
      [38.5, 141],
      [16, 135],
      [14, 126],
      [15.5, 112],
    ]);
    const parts: XZ[][] = [
      [
        [58.4, 26],
        [82, 20],
        [94, 38],
        [100, 50],
        [58.4, 57],
      ],
      [
        [54, 59],
        [58.4, 57],
        [100, 50],
        [105, 62],
        [105, 70],
        [99, 77],
        [85, 80],
        [54, 80],
      ],
      [
        [54, 80],
        [85, 80],
        [85, 101],
        [54, 101],
      ],
      tail,
      // The landing where the outside path's last flight comes down beside the hall.
      [
        [19.5, gardenTailZ - 0.05],
        [26, gardenTailZ - 0.05],
        [26, 101.05],
        [21, 101.05],
      ],
    ];
    parts.forEach((p, i) =>
      b.floor(`garden-${i}`, "graveyard", p, y, { material: "hedge", thickness: 1 }),
    );
    b.floor(
      "garden-west-landing",
      "graveyard",
      [
        [51.97, walkZ - 2.4],
        [58.9, walkZ - 2.4],
        [58.9, walkZ + 2.4],
        [51.97, walkZ + 2.4],
      ],
      y,
    );
    // Rails round the whole outline, open to the stairs and to Backyard Below.
    const tailEdges: Array<[XZ, XZ]> = tail
      .map((p, i): [XZ, XZ] => [p, tail[(i + 1) % tail.length]])
      .filter(([p, q]) => !(p[1] === 101 && q[1] === 101));
    const outer: Array<[XZ, XZ]> = [
      [
        [64.2, 24.52],
        [82, 20],
      ],
      [
        [82, 20],
        [94, 38],
      ],
      [
        [94, 38],
        [100, 50],
      ],
      [
        [100, 50],
        [105, 62],
      ],
      [
        [105, 62],
        [105, 70],
      ],
      [
        [105, 70],
        [99, 77],
      ],
      [
        [99, 77],
        [85, 80],
      ],
      [
        [85, 80],
        [85, 101],
      ],
      ...tailEdges.filter(([p, q]) => !(p[0] === 85 && q[0] === 85)),
      [
        [26.2, 101],
        [54, 101],
      ],
      [
        [54, 101],
        [54, 59],
      ],
      [
        [58.4, 57],
        [58.4, walkZ + 2.6],
      ],
      [
        [19.5, gardenTailZ],
        [19.5, 101],
      ],
    ];
    for (const [p, q] of outer) rail(p, q, y);
    rail([58.4, walkZ - 2.6], [58.4, 40], y);
    // The garden wall round the head of Backyard Below stands too tall to vault, so its
    // door is the only way through and opens from the garden alone.
    for (const [p, q] of [
      [
        [58.4, 40],
        [58.4, 32.6],
      ],
      [
        [58.4, 28.4],
        [58.4, 26],
      ],
      [
        [58.4, 26],
        [64.2, 24.52],
      ],
    ] as Array<[XZ, XZ]>)
      b.wall(p, q, y, y + 5, { thickness: 0.6 });
    b.mass([...parts[0]], GROUND, y - 1, "rock");
    // Hedges, planters, statues on stepped plinths and the blue pavilion.
    for (const [x, z, w, d] of [
      [66, 34, 6, 1.4],
      [76, 30, 1.4, 7],
      [68, 70, 8, 1.4],
      [92, 62, 1.4, 6],
      [74, 92, 6, 1.4],
      [34, 112, 8, 1.4],
      [52, 124, 1.4, 6],
    ]) {
      b.box(x, z, y, [w + 0.4, 0.5, d + 0.4], 0, "trim");
      b.box(x, z, y + 0.5, [w, 1.2, d], 0, "hedge");
    }
    for (const [x, z] of [
      [72, 48],
      [62, 78],
      [78, 86],
      [60, 116],
    ])
      statue([x, z], y, 0.4, 1.2);
    {
      const [x, , z] = CAPITAL_SITES.pavilion;
      for (const [dx, dz] of [
        [-3, -3],
        [3, -3],
        [3, 3],
        [-3, 3],
      ])
        b.pillar(x + dx, z + dz, y, 9, 0.8, "trim");
      // Tall pointed arches glowing blue on all four sides, as the reference's pavilion.
      for (const [dx, dz, yaw] of [
        [0, -3, 0],
        [0, 3, 0],
        [-3, 0, Math.PI / 2],
        [3, 0, Math.PI / 2],
      ])
        b.piece("arch-window", [5.4, 8.6, 0.35], [x + dx, y, z + dz], yaw, "marker", 0.3);
      b.box(x, z, y + 9, [7.4, 0.6, 7.4], 0, "trim", false);
      b.piece("spire", [6.6, 6, 6.6], [x, y + 9.6, z], 0, "roof");
      b.box(x + 1.8, z + 1.8, y, [1.2, 0.8, 1.2], 0, "trim");
      b.box(x + 1.8, z + 1.8, y + 0.8, [0.6, 0.6, 0.6], 0, "marker", false);
    }
    for (const [x, z] of [
      [62, 30],
      [86, 42],
      [100, 66],
      [80, 96],
      [64, 98],
      [40, 128],
      [24, 122],
    ])
      b.piece("bare-tree", [5, 6, 5], [x, y, z], rand() * 3, "bark");
    sword([96, 58], y, 1.1, 0.9);
    // Ruined walls round the garden, arches broken open, rubble at their feet.
    for (const [p, q, h] of [
      [[85, 29], [90, 39], 6],
      [[102.4, 62], [102.4, 69], 7.5],
      [[64, 112], [58, 124], 5],
      [[24, 132], [36, 138.5], 4.5],
    ] as Array<[XZ, XZ, number]>) {
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      b.wall(p, q, y, y + h, {
        thickness: 0.9,
        openings: [
          {
            at: length / 2,
            width: 2.6,
            bottom: y + 1.2,
            height: Math.min(4, h - 1.6),
            frame: "none",
          },
        ],
      });
      for (let k = 0; k < 3; k++)
        b.piece(
          "debris",
          [1.5, 0.6, 1.5],
          at3(
            [p[0] + (q[0] - p[0]) * (0.2 + k * 0.3) + 1.2, p[1] + (q[1] - p[1]) * (0.2 + k * 0.3)],
            y,
          ),
          rand() * 3,
        );
    }
    // Backyard Below: the stair tower from the garden down to the town's south end.
    const a1 = MID.a1,
      endIn = polar(MID.street[0], a1),
      endOut = polar(MID.street[1], a1);
    b.floor("backyard-below-link", "graveyard", [endIn, [44.05, 13], [44.05, 19], endOut], Y.f2);
    b.rect("backyard-below-l3", "graveyard", 44, 13, 48.05, 19, Y.f2);
    b.flight("backyard-below-c", "graveyard", [48, Y.f2, 16], [1, 0], 6, 4, { fill: GROUND });
    b.rect("backyard-below-l2", "graveyard", 56.95, 13.9, 61, 25.6, Y.f2 + 6);
    b.flight("backyard-below-b", "graveyard", [57, Y.f2 + 6, 23.5], [-1, 0], 6, 4, {
      fill: GROUND,
    });
    b.rect("backyard-below-l1", "graveyard", 44, 21.4, 48.05, 32.6, Y.f2 + 12);
    const high = b.flight(
      "backyard-below-a",
      "graveyard",
      [48, Y.f2 + 12, 30.5],
      [1, 0],
      y - Y.f2 - 12,
      4,
      {
        fill: GROUND,
      },
    );
    b.rect("backyard-below-top", "graveyard", high[0] - 0.05, 28.5, 61, 32.5, y);
    b.mass(
      [
        [44, 13],
        [48, 13],
        [48, 19],
        [44, 19],
      ],
      GROUND,
      Y.f2 - 0.6,
    );
    b.mass(
      [
        [57, 13.9],
        [61, 13.9],
        [61, 25.6],
        [57, 25.6],
      ],
      GROUND,
      Y.f2 + 5.4,
    );
    b.mass(
      [
        [44, 21.4],
        [48, 21.4],
        [48, 32.6],
        [44, 32.6],
      ],
      GROUND,
      Y.f2 + 11.4,
    );
    rail([44, 19.2], [44, 32.6], Y.f2 + 12);
    rail([44, 32.6], [48, 32.6], Y.f2 + 12);
    rail([61, 13.9], [61, 25.6], Y.f2 + 6);
    rail([57, 13.9], [61, 13.9], Y.f2 + 6);
    rail([44, 13], [48, 13], Y.f2);
    lantern([46, 14.2], Y.f2);
    lantern([59.8, 20], Y.f2 + 6);
    lantern([45.2, 27], Y.f2 + 12);
  }

  // ---------------------------------------------------------------- Beacon Pathway
  function beaconPathway() {
    // From the apse door south of the keeper's hall, west and north along the island's
    // rim in three flights of steps down to the beacon tower.
    // Laid on the article's arc: about a hundred metres out, closing in towards the tower.
    const legs: Array<{ from: XZ; to: XZ; y0: number; y1: number }> = [
      { from: [0, 118.4], to: [-9.5, 120.6], y0: 24, y1: 24 },
      { from: [-9.5, 120.6], to: [-32, 101.5], y0: 24, y1: 18 },
      { from: [-32, 101.5], to: [-53.8, 86.1], y0: 18, y1: 18 },
      { from: [-53.8, 86.1], to: [-70.2, 66.9], y0: 18, y1: 12 },
      { from: [-70.2, 66.9], to: [-76.3, 47.7], y0: 12, y1: 12 },
      { from: [-76.3, 47.7], to: [-76.6, 31.3], y0: 12, y1: Y.upTown },
    ];
    b.rect("beacon-door", "belfry", -2.2, CAPITAL_CATHEDRAL.apseTip - 0.3, 2.2, 120.6, Y.citadel);
    legs.forEach((leg, i) => {
      const dx = leg.to[0] - leg.from[0],
        dz = leg.to[1] - leg.from[1],
        length = Math.hypot(dx, dz),
        d: XZ = [dx / length, dz / length],
        width = 4.4,
        last = i === legs.length - 1,
        start = add(leg.from, d, i === 0 ? 2.15 : 2.95),
        end = last ? leg.to : add(leg.to, d, -2.95);
      if (leg.y0 === leg.y1 && (i === 2 || i === 4)) {
        // A broken stretch: the walk has fallen away to a narrow span through rubble.
        const lerp = (t: number): XZ => [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
        ];
        const p1 = lerp(0.33),
          p2 = lerp(0.67),
          n: XZ = [-d[1], d[0]];
        span(`beacon-walk-${i}`, "belfry", start, p1, leg.y0, width);
        b.bridge(`beacon-broken-${i}`, "belfry", add(p1, d, -0.05), add(p2, d, 0.05), leg.y0, 1.8, {
          kind: "slab",
          rails: [false, false],
        });
        span(`beacon-walk-${i}-end`, "belfry", p2, end, leg.y0, width);
        for (let k = 0; k < 6; k++) {
          const t = 0.36 + k * 0.05,
            side = k % 2 ? 1 : -1,
            c = add(lerp(t), n, side * (1.6 + rand() * 0.8));
          b.piece(
            "debris",
            [1.4 + rand(), 0.7, 1.4 + rand()],
            at3(c, leg.y0 - 1.6 - rand()),
            rand() * 3,
          );
        }
      } else if (leg.y0 === leg.y1) span(`beacon-walk-${i}`, "belfry", start, end, leg.y0, width);
      else {
        const low = descend(
          `beacon-stair-${i}`,
          "belfry",
          at3(start, leg.y0),
          d,
          leg.y0 - leg.y1,
          width,
          GROUND,
        );
        const lowXZ: XZ = [low[0], low[2]];
        if (Math.hypot(end[0] - lowXZ[0], end[1] - lowXZ[1]) > 0.5)
          span(`beacon-walk-${i}`, "belfry", add(lowXZ, d, -0.05), end, leg.y1, width);
      }
      // A landing at each turn, exactly spanning the incoming walk's end and the next
      // flight's top, so no slab overhangs the steps.
      if (!last) {
        const next = legs[i + 1],
          nl = Math.hypot(next.to[0] - next.from[0], next.to[1] - next.from[1]),
          nd: XZ = [(next.to[0] - next.from[0]) / nl, (next.to[1] - next.from[1]) / nl],
          nn: XZ = [-nd[1], nd[0]],
          n: XZ = [-d[1], d[0]],
          inEnd = add(leg.to, d, -3),
          outStart = add(leg.to, nd, 2.95);
        const points = [
          add(inEnd, n, width / 2),
          add(inEnd, n, -width / 2),
          add(outStart, nn, width / 2),
          add(outStart, nn, -width / 2),
        ];
        const cx = points.reduce((sum, p) => sum + p[0], 0) / 4,
          cz = points.reduce((sum, p) => sum + p[1], 0) / 4;
        points.sort((p, q) => Math.atan2(p[1] - cz, p[0] - cx) - Math.atan2(q[1] - cz, q[0] - cx));
        b.floor(`beacon-landing-${i}`, "belfry", points, leg.y1);
        b.mass(points, GROUND, leg.y1 - 0.6);
        lantern(leg.to, leg.y1);
      }
    });

    // The beacon tower: a round watchtower whose lift falls to Grand Street.
    const [tx, tz] = BEACON_TOWER,
      top = Y.upTown;
    b.arc("beacon-top", "belfry", tx, tz, 4.35, 7, 0, Math.PI * 2, top, 16);
    b.rect("beacon-top-n", "belfry", tx - 3, tz - 4.5, tx + 3, tz - 3.05, top);
    b.rect("beacon-top-s", "belfry", tx - 3, tz + 3.05, tx + 3, tz + 4.5, top);
    b.rect("beacon-top-e", "belfry", tx + 3.05, tz - 3, tx + 4.5, tz + 3, top);
    b.rect("beacon-top-w", "belfry", tx - 4.5, tz - 3, tx - 3.05, tz + 3, top);
    ringWall(7.3, 0, Math.PI * 2, GROUND, top - 0.6, {
      cx: tx,
      cz: tz,
      thickness: 0.8,
      gaps: [[Math.PI / 2, 4.6]],
    });
    ringWall(7.3, 0, Math.PI * 2, top, top + 1.1, {
      cx: tx,
      cz: tz,
      thickness: 0.4,
      material: "trim",
      gaps: [
        [5.6, 6],
        [Math.PI + 0.06, 6],
      ],
    });
    b.piece(
      "elevator",
      [6.6, top - Y.plain + 3.2, 6.6],
      [tx, Y.plain - 0.3, tz],
      Math.PI / 2,
      "iron",
      0.3,
    );
    // The beacon itself: a lantern on pillars above the landing.
    for (let i = 0; i < 6; i++) {
      const [px, pz] = polar(6.5, (i * Math.PI) / 3 + Math.PI / 6);
      b.pillar(tx + px, tz + pz, top, 10, 0.8, "trim");
    }
    b.mass(octagon(tx, tz, 7.6), top + 10, top + 11, "trim");
    b.box(tx, tz, top + 11, [4, 3, 4], 0, "glow", false);
    b.piece("spire", [6, 7, 6], [tx, top + 14, tz], 0, "roof");
  }

  // ---------------------------------------------------------------- Grand Street
  function grandStreet() {
    const y = Y.plain;
    // The bar from the beacon tower's foot to the junction circle.
    b.rect("grand-bar", "crypt", BEACON_TOWER[0] + 3.05, 21, JUNCTION[0] - 6.2, 28, y);
    b.floor("grand-junction", "crypt", octagon(JUNCTION[0], JUNCTION[1], 7.4), y);
    // The ring round the foot of the central mountain, as on the article's map: west,
    // north through the arch in the prow's keel, and on to the east beneath the town.
    // Past the arena lift's shaft it keeps to its outer half; in the east it stays clear
    // of the town's base.
    const shaftA = [5.82, 6.19] as const,
      eastEnd = 1.85,
      eastR = 29.6;
    ringFloor("grand-ring", "crypt", GS.r0, GS.r1, GS.a0, shaftA[0], y);
    ringFloor("grand-ring-shaft", "crypt", 28.9, GS.r1, shaftA[0], shaftA[1], y);
    ringFloor("grand-ring-north", "crypt", GS.r0, GS.r1, shaftA[1], Math.PI * 2 + 0.1, y);
    ringFloor("grand-ring-east", "crypt", GS.r0, eastR, 0.1, eastEnd, y);
    parapet(29.1, shaftA[0], shaftA[1], y);
    for (const a of shaftA) rail(polar(GS.r0, a), polar(28.9, a), y);
    rail(polar(eastR, 0.1), polar(GS.r1, 0.1), y);
    rail(polar(GS.r0, eastEnd), polar(eastR, eastEnd), y);
    for (let a = 6.3; a < Math.PI * 2 + eastEnd; a += 0.2) lantern(polar(GS.r0 + 0.8, a), y);
    {
      const p0 = polar((GS.r0 + GS.r1) / 2, GS.a0 + 0.05),
        dx = JUNCTION[0] - p0[0],
        dz = JUNCTION[1] - p0[1],
        l = Math.hypot(dx, dz),
        n: XZ = [(-dz / l) * 3.5, (dx / l) * 3.5];
      b.floor(
        "grand-ring-link",
        "crypt",
        [add(p0, n, -1), add(p0, n, 1), add(JUNCTION, n, 1), add(JUNCTION, n, -1)],
        y,
      );
    }
    const spurSouth = polar(GS.r0 + 2, GS.a1 - 0.12);
    b.floor(
      "grand-spur",
      "crypt",
      [spurSouth, [-20, -27], [-20, -51.95], [-13, -51.95], [-13, spurSouth[1]]],
      y,
    );
    // Broad steps rise from the spur to the raised court before the gate, as the
    // reference's approach climbs to its boss room.
    b.flight("grand-steps", "crypt", [-16.5, y, -52], [0, -1], COURT_Y - y, 7, { fill: GROUND });
    b.rect("grand-court-west", "crypt", -20, -59.25, -8, -54.95, COURT_Y);
    b.rect("grand-court", "crypt", -20, -66, 20, -59.2, COURT_Y);
    // Masonry under the court, clear of the colosseum stair's first steps.
    for (const [x0, z0, x1, z1] of [
      [-20, -66, 20, -59.2],
      [-20, -59.25, -8, -54.95],
    ])
      b.mass(
        [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ],
        GROUND,
        COURT_Y - 0.6,
      );
    for (let i = 0; i < 3; i++) {
      // Stepped tiers line the court's far side.
      b.box(0, -64.2 - i * 0.6, COURT_Y, [36 - i * 4, 0.6 * (i + 1), 0.6], 0, "wall");
    }
    // The colosseum gate's threshold into the keel.
    b.rect("colosseum-gate", "crypt", -2.4, -59.4, 2.4, -57.5, COURT_Y, {
      threshold: true,
      render: true,
    });
    // Houses as blocks along the street: Leyndell's main thoroughfare.
    const row = (p: XZ, yaw: number, w: number, depth: number, storeys: number) =>
      block(frame(b, p[0], p[1], yaw), {
        x: 0,
        z: 0,
        w,
        depth,
        y,
        storeys,
        rand,
        tower: rand() < 0.15,
      });
    for (const x of [-64, -55, -46]) {
      row([x, 14.4], 0, 8, 6, 2);
      row([x, 34.6], Math.PI, 8, 6, 2 + Math.floor(rand() * 2));
    }
    for (let a = GS.a0 + 0.3; a < GS.a1 - 0.05; a += 0.22) {
      const t = frame(b, ...polar(GS.r1 + 7.6, a), facing(radial(a + Math.PI)));
      block(t, { x: 0, z: 0, w: 6.5, depth: 6, y, storeys: 2 + Math.floor(rand() * 2), rand });
    }
    // Giant swords stuck in the street.
    sword([-56, 24.5], y, 0.2, 1.4);
    sword(polar(27, 4.9), y, 1.3, 1.2);
    for (let x = -72; x < -38; x += 8) lantern([x, 21.8], y);
    for (let a = GS.a0; a < GS.a1; a += 0.2) lantern(polar(GS.r1 - 0.8, a), y);
    for (const z of [-30, -42, -50]) lantern([-13.8, z], y);
    lantern([-18, -62.5], COURT_Y);
    lantern([16, -62.5], COURT_Y);
  }

  // ---------------------------------------------------------------- Glory Colosseum
  function colosseum() {
    const y = Y.arena,
      R = CAPITAL_RINGS.arena;
    // Takes in the stands and the ceiling ring, but stays beneath the street ring above.
    interior(-R - 5, y, -R - 5, R + 5, y + 9, R + 5);
    interior(-2.2, y, -57.5, 2.2, COURT_Y + 5, -R);
    for (const s of [-1, 1]) interior(s > 0 ? 2.2 : -5.5, y, -36, s > 0 ? 5.5 : -2.2, y + 5.4, -30);
    const ceiling = (x0: number, z0: number, x1: number, z1: number, bottom: number) =>
      b.mass(
        [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ],
        bottom,
        bottom + 0.6,
      );
    b.buried(() => {
      // The corridor from the gate: a stair down, then a straight hall to the arena.
      const low = descend(
        "colosseum-stair",
        "arena",
        [0, COURT_Y, -57.5],
        [0, 1],
        COURT_Y - y,
        4,
        y,
      );
      b.rect("colosseum-corridor", "arena", -2.2, low[2] - 0.05, 2.2, -R + 0.4, y);
      b.rect("colosseum-lift-landing", "arena", -3.45, -27, -2.15, -21, y);
      for (const s of [-1, 1]) {
        const x = s * 2.5,
          alcove = { at: -33 - low[2], width: 6, bottom: y, height: 4.8, frame: "none" as const };
        b.wall([x, -57.5], [x, low[2]], y, COURT_Y + 5, { thickness: 0.6 });
        b.wall([x, low[2]], [x, -R], y, y + 5.4, {
          thickness: 0.6,
          openings:
            s < 0
              ? [{ at: -24 - low[2], width: 6.2, bottom: y, height: 4.6, frame: "none" }, alcove]
              : [alcove],
        });
        // Statue alcoves either side of the hall, framed by orange pillars.
        const outer = s * 5.8;
        b.rect(
          `colosseum-alcove-${s}`,
          "arena",
          s > 0 ? 2.15 : -5.5,
          -36,
          s > 0 ? 5.5 : -2.15,
          -30,
          y,
        );
        b.wall([outer, -36.3], [outer, -29.7], y, y + 5.4, { thickness: 0.6 });
        for (const z of [-36.3, -29.7]) b.wall([x, z], [outer, z], y, y + 5.4, { thickness: 0.6 });
        ceiling(s > 0 ? 2.2 : -6.1, -36.6, s > 0 ? 6.1 : -2.2, -29.4, y + 5.4);
        statue([s * 4.3, -33], y, s > 0 ? -Math.PI / 2 : Math.PI / 2, 1.5);
        for (const z of [-36.6, -29.4]) b.pillar(x, z, y, 5.4, 0.8, "timber");
      }
      ceiling(-2.8, -57.5, 2.8, low[2], COURT_Y + 5);
      ceiling(-2.8, low[2], 2.8, -R, y + 5.4);
      // The arena: a round floor ringed by a wall of niches and lamps, then the stands.
      const ring = Array.from({ length: 24 }, (_, i) =>
        polar(R, (i * Math.PI * 2) / 24 + Math.PI / 24),
      );
      b.floor("colosseum", "arena", ring, y, { thickness: 1 });
      // The wall opens to the north for the corridor; its range stops either side of the gap.
      const gate = 2.3 / (R + 0.3);
      ringWall(R + 0.3, gate, Math.PI * 2 - gate, y, y + 7, { thickness: 0.6 });
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI * 2) / 12 + Math.PI / 12,
          [x, z] = polar(R - 0.1, a);
        b.box(x, z, y + 2.2, [2, 2.4, 0.3], -a, "shadow", false);
        b.box(x, z, y + 3, [0.6, 0.6, 0.4], -a, "glow", false);
      }
      // The stands break at the north for the corridor and the lift beside it.
      ringMass(R + 0.6, R + 2.6, 0.48, Math.PI * 2 - 0.48, y, y + 7);
      ringMass(R + 2.6, R + 4.4, 0.48, Math.PI * 2 - 0.48, y, y + 8.4);
      b.mass(
        Array.from({ length: 16 }, (_, i) => polar(R + 1.5, (i * Math.PI * 2) / 16)),
        y + 9,
        y + 9.6,
      );
      // An outer ceiling ring roofs the stands, open only for the corridor and the
      // arena lift's shaft, so no daylight reaches the arena from the street ring above.
      ringMass(R + 1.3, R + 5, 0.13, 5.82, y + 9, y + 9.6);
      ringMass(R + 1.3, R + 5, 6.19, Math.PI * 2 - 0.13, y + 9, y + 9.6);
    });
    b.rooms.push({ id: "colosseum", width: 2 * R, depth: 2 * R, height: 9, high: true });
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6 + Math.PI / 6;
      b.piece("banner", [1.6, 4, 0.06], at3(polar(R - 0.05, a), y + 3.6), Math.PI - a, "cloth");
      brazier(polar(R - 1.8, a), y);
    }
    lantern([1.4, -32], y);
    lantern([-1.4, -40], y);
  }
  function facingAngle(x: number, z: number) {
    return (Math.atan2(x, -z) + Math.PI * 2) % (Math.PI * 2);
  }
}
