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
 * The Fading Sacred Capital, shaped after a seven-tier white city against a mountain:
 * concentric half-ring terraces facing south (+Z), each eight metres above the last, a
 * sheer rock prow splitting them down the middle, and a citadel with a white tower on
 * top. The climb zig-zags: each tier is crossed through a gate tunnel in the prow and
 * climbed by a stair at alternating ends. The district map and flow of the original
 * capital map onto the tiers; the ground city lies on the plain beneath the fog.
 *
 * Every piece is placed through the kit builder, which also records its walkable
 * surfaces and colliders.
 */
export const TIER_R = [96, 61, 51, 42, 34, 27, 20] as const;
export const TIER_H = [0, 8, 16, 24, 32, 40, 48] as const;
export const Y = { plain: -20, citadel: 48, gallery: 54 } as const;
const BEDROCK = -22;
/** Half the angular span of each terrace either side of due south. */
const SPAN = 1.75;
const PROW = 4.5;
/** Lift decks are 6 m square; floors stop 3.05 m from the shaft centre. */
const SHAFT = 3.05;
const TIER_AREAS: ParishArea[] = ["refuge", "foundry", "foundry", "toproad", "toproad", "yard"];

/** Polar point: angle from -Z towards +X, so π is due south. */
export const polar = (r: number, a: number): XZ => [Math.sin(a) * r, -Math.cos(a) * r];
export const bandMid = (k: number) => (TIER_R[k] + TIER_R[k + 1]) / 2;
/** Angle of a point `d` metres along a band from the prow, east (+1) or west (-1). */
export const along = (k: number, side: 1 | -1, d: number) => Math.PI - side * (d / bandMid(k));
/** A point on band `k`, `d` metres from the prow at radius `r`. */
export const onTier = (k: number, side: 1 | -1, d: number, r = bandMid(k)): ParishPoint => {
  const [x, z] = polar(r, along(k, side, d));
  return [x, TIER_H[k], z];
};

export const LOWER_STREET_X = -TIER_R[0] - 4;
const GREAT_GATE_Z = TIER_R[0] + 0.6;
/** The apron: an annular sector before the walls at the lowest tier's level. */
export const CAPITAL_APRON = {
  r0: TIER_R[0] + 1.25,
  r1: 130,
  aE: Math.PI - 0.8,
  aW: Math.PI + 0.5,
};
/** The beacon's sunken court: the only place the plain drops to the road beneath it. */
export const BEACON_COURT = { x0: -86, x1: -48, z0: -96, z1: -48 };

export const CAPITAL_SITES = {
  start: [18, 0, TIER_R[0] - 8] as ParishPoint,
  startSpawn: [14, 0, TIER_R[0] - 8.5] as ParishPoint,
  courtyard: [26, 0, TIER_R[0] - 13] as ParishPoint,
  exit: [27, 0, 60] as ParishPoint,
  greatGate: [0, 0, GREAT_GATE_Z] as ParishPoint,
  /** Before the barbican's mouth, on the apron at the level of the lowest tier. */
  greatGateFoot: [0, 0, GREAT_GATE_Z + 31] as ParishPoint,
  townLift: (() => {
    const a = along(1, 1, 30),
      [x, z] = polar(56.05, a);
    return { a, center: [x, TIER_H[1], z] as ParishPoint };
  })(),
  tunnelGate: [-PROW - 0.3, TIER_H[2], bandMid(2)] as ParishPoint,
  chapel: [-11, 48, -12] as ParishPoint,
  whiteTower: [0, 48, 6] as ParishPoint,
  cathedralDoor: [0, 48, -36] as ParishPoint,
  apse: [0, 48, -92.93] as ParishPoint,
  arenaLift: [0, 0, -30] as ParishPoint,
  beaconTower: [-70, 0, -62] as ParishPoint,
  beaconLift: [-57, 0, -58] as ParishPoint,
  beaconSeal: [-16.9, 54, -58] as ParishPoint,
  backyard: [46, 54, -62] as ParishPoint,
  stairTower: [44, 0, -24] as ParishPoint,
  colosseum: [0, -20, 0] as ParishPoint,
};

/**
 * Inter-tier stairs alternate: tier 1 climbs at its east end, tier 2 at its west, and so
 * on. Each 12 m flight runs along the next tier's retaining face as a chord, and its
 * landing crosses that tier's parapet.
 */
/** Enterable homes among the row quarters, each with a clear spot inside its door. */
export const CAPITAL_HOMES: Array<{
  id: string;
  k: number;
  spot: ParishPoint;
  /** Just outside the door, on the street, and just inside it. */
  approach: [ParishPoint, ParishPoint];
}> = [];

export const TIER_STAIRS = Array.from({ length: 6 }, (_, k) => {
  const side = (k % 2 === 0 ? 1 : -1) as 1 | -1,
    inner = TIER_R[k + 1],
    rs = inner + (k >= 4 ? 3.3 : 3),
    end = Math.PI - side * SPAN,
    aTop = end + side * (6 / rs),
    aLow = aTop + side * 2 * Math.asin(6 / rs);
  const T = polar(rs, aTop),
    L = polar(rs, aLow),
    dir: XZ = [(T[0] - L[0]) / 12, (T[1] - L[1]) / 12];
  let n: XZ = [-dir[1], dir[0]];
  if (n[0] * T[0] + n[1] * T[1] < 0) n = [-n[0], -n[1]];
  const depthIn = rs - inner + 1.6;
  const corner = (s: number, q: number): XZ => [
    T[0] + dir[0] * s + n[0] * q,
    T[1] + dir[1] * s + n[1] * q,
  ];
  const mid = corner(2, -2);
  return {
    k,
    side,
    low: [L[0], TIER_H[k], L[1]] as ParishPoint,
    top: [T[0], TIER_H[k + 1], T[1]] as ParishPoint,
    dir,
    /** A point on the landing, over the upper tier's outer edge. */
    arrival: [corner(2, -3.6)[0], TIER_H[k + 1], corner(2, -3.6)[1]] as ParishPoint,
    landing: [corner(0, 2), corner(0, -depthIn), corner(4, -depthIn), corner(4, 2)],
    gapAngle: (Math.atan2(mid[0], -mid[1]) + 2 * Math.PI) % (2 * Math.PI),
  };
});

type Side = "n" | "e" | "s" | "w";
type HouseDoor = { side: Side; c: number; level?: number; width?: number; height?: number };
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
    /** A kit piece standing at local (x, z), turned `turn` from the frame. */
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
    /** A kit piece with its footprint as a collider. */
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

/** Keep the part of a convex polygon on one side of the line z = edge. */
function clip(poly: XZ[], edge: number, keep: -1 | 1): XZ[] {
  const inside = (p: XZ) => (keep < 0 ? p[1] <= edge : p[1] >= edge);
  const out: XZ[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    if (inside(p)) out.push(p);
    if (inside(p) !== inside(q)) {
      const t = (edge - p[1]) / (q[1] - p[1]);
      out.push([p[0] + (q[0] - p[0]) * t, edge]);
    }
  });
  return out;
}

export function authorCapitalDistricts(b: CapitalBuilder) {
  const lanterns: ParishPoint[] = [];
  const lantern = (x: number, y: number, z: number) => lanterns.push([x, y, z]);
  const parapet = (a: XZ, c: XZ, y: number, openings?: CapitalOpening[]) =>
    b.wall(a, c, y, y + 1.1, { thickness: 0.4, material: "trim", openings });
  const gap = (at: number, width: number, y: number): CapitalOpening => ({
    at,
    width,
    bottom: y,
    height: 1.1,
    frame: "none",
  });

  /** A flat-roofed kit house in a local frame; local +Z (its "s" side) faces the street. */
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
      storeys: 1 | 2;
      doors: HouseDoor[];
      material?: CapitalMaterial;
    },
  ) {
    const storey = 5,
      top = o.base + storey * o.storeys,
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
      const at =
        d.side === "n"
          ? d.c - o.x0
          : d.side === "e"
            ? d.c - o.z0
            : d.side === "s"
              ? o.x1 - d.c
              : o.z1 - d.c;
      (openings[sides.indexOf(d.side)] ??= []).push({
        at,
        width: d.width ?? 2.4,
        height: d.height ?? 3.6,
        bottom: o.base + (d.level ?? 0) * storey,
        id: `${o.id}:${d.side}${d.level ?? 0}`,
        area: o.area,
      });
    }
    t.enclosure(corners, o.base, top - 0.6, {
      openings,
      material: o.material ?? "house",
      thickness: th,
    });
    const inner = { x0: o.x0 + th / 2, x1: o.x1 - th / 2, z0: o.z0 + th / 2, z1: o.z1 - th / 2 };
    if (o.storeys === 2) {
      // A stair along the back wall; the landing column runs the full depth upstairs.
      const y = o.base + storey,
        sz0 = inner.z0,
        sz1 = inner.z0 + 2.2;
      const high = t.flight(
        `${o.id}:stair`,
        o.area,
        [inner.x0 + 0.6, o.base, (sz0 + sz1) / 2],
        [1, 0],
        storey,
        2.2,
        { fill: o.base },
      );
      t.rect(`${o.id}:landing`, o.area, high[0], sz0, inner.x1, inner.z1, y);
      t.rect(`${o.id}:upper`, o.area, inner.x0, sz1, high[0], inner.z1, y);
    }
    furnish(t, inner, o.base, o.storeys === 2);
    t.rooms.push({
      id: o.id,
      width: inner.x1 - inner.x0,
      depth: inner.z1 - inner.z0,
      height: storey - 0.6,
    });
    t.mass(corners, top - 0.6, top, "trim");
    // A slate gable over the street front, and windows either side of the door.
    t.piece(
      "roof",
      [o.x1 - o.x0, Math.min(3, (o.z1 - o.z0) * 0.55), o.z1 - o.z0],
      [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2],
      top,
      "roof",
      { thickness: 0.35 },
    );
    for (let level = 0; level < o.storeys; level++)
      for (const x of [o.x0 + (o.x1 - o.x0) * 0.2, o.x1 - (o.x1 - o.x0) * 0.2]) {
        if (
          o.doors.some((d) => d.side === "s" && (d.level ?? 0) === level && Math.abs(d.c - x) < 2.4)
        )
          continue;
        const y = o.base + level * storey + 1.4;
        t.piece("window", [1.1, 1.8, 0.2], [x, o.z1 + 0.38], y, "trim", { thickness: 0.16 });
        t.box([x, o.z1 + 0.31], y + 0.05, [0.85, 1.7, 0.04], "shadow", false);
      }
  }

  /**
   * Furnishes a single-storey house interior: hearth and logs on one side, a table with
   * benches, barrels and a bed, leaving the door, the middle and `keep` clear.
   */
  function furnish(
    t: Frame,
    inner: { x0: number; x1: number; z0: number; z1: number },
    y: number,
    upstairs: boolean,
  ) {
    const w = inner.x1 - inner.x0,
      d = inner.z1 - inner.z0,
      // Upstairs houses keep the strip along the back wall for their stair.
      mid = upstairs ? inner.z0 + 2.2 + (d - 2.2) / 2 : inner.z0 + d * 0.45;
    // The hearth, its fire and a log pile beside it.
    t.box([inner.x0 + 0.45, mid], y, [0.9, 1.2, 1.6], "wall");
    t.box([inner.x0 + 0.62, mid], y + 0.15, [0.5, 0.45, 1], "glow", false);
    t.box([inner.x0 + 0.45, mid], y + 1.2, [0.7, 2.6, 0.9], "wall");
    if (!upstairs) t.prop("log-pile", [1, 0.45, 1], [inner.x0 + 0.65, mid + 1.5], y, "timber");
    // A table with two benches.
    // Kept at least 1.7 m off the door's centre line, so the way in stays open.
    const tx = Math.max(1.7, inner.x1 - w * 0.32);
    t.prop("crate", [1.6, 0.8, 0.9], [tx, mid], y, "timber");
    for (const s of [-1, 1]) t.prop("crate", [1.4, 0.45, 0.35], [tx, mid + s * 0.8], y, "timber");
    // Barrels in the back corner, a bed by the front wall.
    if (!upstairs) {
      t.prop("drum", [0.6, 0.9, 0.6], [inner.x1 - 0.5, inner.z0 + 0.5], y, "timber");
      t.prop("drum", [0.6, 0.9, 0.6], [inner.x1 - 1.2, inner.z0 + 0.45], y, "timber");
      t.prop("wall", [2.2, 2.2, 0.4], [inner.x0 + w * 0.42, inner.z0 + 0.25], y, "timber");
      t.prop(
        "crate",
        [0.6, 0.45, 0.35],
        [inner.x0 + w * 0.42 - 0.5, inner.z0 + 0.25],
        y + 2.2,
        "timber",
        { collide: false },
      );
    }
    if (d >= 3.4) {
      t.prop("crate", [0.95, 0.5, 1.9], [inner.x1 - 0.55, inner.z1 - 1.05], y, "timber");
      t.box([inner.x1 - 0.55, inner.z1 - 0.35], y + 0.5, [0.8, 0.18, 0.45], "cloth", false);
    }
  }

  /** A house against the inner retaining face of band `k`, facing out over the tier below. */
  function tierHouse(
    k: number,
    side: 1 | -1,
    d: number,
    id: string,
    o: { width?: number; storeys?: 1 | 2 } = {},
  ) {
    const inner = TIER_R[k + 1],
      a = along(k, side, d),
      [ox, oz] = polar(inner + 0.4, a),
      depth = Math.min(7, TIER_R[k] - inner - 4.4),
      w = o.width ?? (o.storeys === 2 ? 12 : 9);
    const half = ((w / 2) * bandMid(k)) / (inner + 0.4) + 1.5;
    reserve(k, side, d - half, d + half);
    house(frame(b, ox, oz, Math.atan2(Math.sin(a), -Math.cos(a))), {
      id,
      area: TIER_AREAS[k],
      x0: -w / 2,
      z0: 0,
      x1: w / 2,
      z1: depth,
      base: TIER_H[k],
      storeys: o.storeys ?? 1,
      doors: [{ side: "s", c: 0 }],
    });
  }

  /** Stretches of each tier's inner face kept clear of row buildings, in metres from the prow. */
  const reserved = new Map<string, Array<[number, number]>>();
  const reserve = (k: number, side: 1 | -1, d0: number, d1: number) => {
    const key = `${k}:${side}`;
    reserved.set(key, [...(reserved.get(key) ?? []), [d0, d1]]);
  };

  // ------------------------------------------------------------------ The tiers
  const parapetGaps: number[][] = TIER_R.map(() => []);
  for (const st of TIER_STAIRS) parapetGaps[st.k + 1].push(st.gapAngle);
  const stairs = TIER_STAIRS;
  const town = CAPITAL_SITES.townLift;
  parapetGaps[2].push(town.a);

  const tunnelZ: number[] = [];
  for (let k = 0; k < 6; k++) {
    const inner = TIER_R[k + 1],
      outer = TIER_R[k],
      h = TIER_H[k],
      area = TIER_AREAS[k],
      delta = Math.asin(PROW / bandMid(k)),
      bottom = k >= 5 ? -2 : -12;
    tunnelZ.push(bandMid(k));
    for (const side of [1, -1] as const) {
      const a0 = Math.PI - side * delta,
        a1 = Math.PI - side * SPAN,
        count = Math.ceil(((SPAN - delta) * outer) / 8);
      const holes =
        k === 1 && side === 1
          ? [{ a: town.a, w: SHAFT / (56.05 - SHAFT), r0: 56.05 - SHAFT, r1: 56.05 + SHAFT }]
          : [];
      // Segment boundaries; a lift hole gets its own segment.
      const cuts = Array.from({ length: count + 1 }, (_, i) => a0 + ((a1 - a0) * i) / count);
      for (const hole of holes) {
        const lo = hole.a - hole.w,
          hi = hole.a + hole.w;
        for (let i = cuts.length - 1; i >= 0; i--)
          if (cuts[i] > lo - 0.02 && cuts[i] < hi + 0.02) cuts.splice(i, 1);
        cuts.push(lo, hi);
      }
      cuts.sort((p, q) => side * (q - p));
      for (let i = 0; i < cuts.length - 1; i++) {
        const s0 = cuts[i],
          s1 = cuts[i + 1],
          id = `tier-${k + 1}-${side > 0 ? "east" : "west"}:${i}`;
        // The prow is straight, so its terrace boundary must be x = ±PROW at
        // both radii. A shared polar angle left a widening, fall-through wedge
        // beside the wall, particularly on the broad lowest terrace.
        const start = (r: number): XZ =>
          i === 0 ? [side * PROW, Math.sqrt(r * r - PROW * PROW)] : polar(r, s0);
        const quad = (r0: number, r1: number): XZ[] => [
          start(r0),
          start(r1),
          polar(r1, s1),
          polar(r0, s1),
        ];
        const hole = holes.find((q) => Math.abs((s0 + s1) / 2 - q.a) < 1e-6);
        if (hole) {
          b.floor(`${id}:in`, area, quad(inner, hole.r0), h, { thickness: 1 });
          b.floor(`${id}:out`, area, quad(hole.r1, outer), h, { thickness: 1 });
        } else b.floor(id, area, quad(inner, outer), h, { thickness: 1 });
        b.mass(quad(inner, outer), bottom, h - 1, "wall");
        // The plinth, open where the colosseum gate passage runs beneath the west tiers.
        if (k < 5) {
          const plinth = quad(inner, outer),
            zs = plinth.map((p) => p[1]);
          if (!(side < 0 && Math.min(...zs) < 3.4 && Math.max(...zs) > -3.4))
            b.mass(plinth, BEDROCK, bottom);
          else {
            for (const [keep, edge] of [
              [-1, -3.4],
              [1, 3.4],
            ] as const) {
              const part = clip(plinth, edge, keep);
              if (part.length >= 3) b.mass(part, BEDROCK, bottom);
            }
            b.mass(plinth, -14.6, bottom);
          }
        }
        // Parapets on the outer edge; the lowest tier has the city wall instead.
        if (k > 0 && !parapetGaps[k].some((g) => (g - s0) * (g - s1) <= 0))
          parapet(polar(outer + 0.2, s0), polar(outer + 0.2, s1), h);
      }
      // The terraces end against the mountain; Backyard Below enters Up Town's east end.
      b.wall(polar(inner, a1), polar(outer, a1), h, h + 5, {
        openings:
          k === 3 && side === 1
            ? [
                {
                  at: (outer - inner) / 2 + 0.5,
                  width: 4,
                  height: 3.6,
                  bottom: h,
                  id: "backyard-below-door",
                  visibleThreshold: true,
                  area,
                },
              ]
            : [],
      });
    }
    // The prow stops at the second tier's face; the lowest tier runs straight across.
    if (k > 0)
      b.hallway(
        `prow-gate-${k + 1}`,
        k === 2 ? "tunnel" : area,
        [-PROW - 1.5, tunnelZ[k]],
        [PROW + 1.5, tunnelZ[k]],
        h,
        4.6,
        4.6,
      );
    else {
      const zIn = Math.sqrt(inner * inner - PROW * PROW),
        zOut = Math.sqrt(outer * outer - PROW * PROW),
        strip: XZ[] = [
          [-PROW, zIn],
          [-PROW, zOut],
          [PROW, zOut],
          [PROW, zIn],
        ];
      b.floor("tier-1-front", area, strip, h, { thickness: 1 });
      b.mass(strip, BEDROCK, h - 1, "wall");
      continue;
    }
    lantern(-PROW - 2.5, h, tunnelZ[k] + 3);
    lantern(PROW + 2.5, h, tunnelZ[k] + 3);
  }
  // The prow: a sheer blade of rock from the mountain, cut by the gates. As in the
  // reference it keeps the citadel's height all the way out and ends in a sheer face
  // over the second tier, barely reaching the lowest tier.
  const PROW_WALK_END = TIER_R[1] - 0.5;
  {
    const top = Y.citadel - 1;
    const zs = [TIER_R[6], ...tunnelZ.slice(1).flatMap((z) => [z - 2.4, z + 2.4]), TIER_R[1]].sort(
      (p, q) => p - q,
    );
    for (let i = 0; i < zs.length - 1; i++) {
      const z0 = zs[i],
        z1 = zs[i + 1],
        k = tunnelZ.findIndex((z) => Math.abs((z0 + z1) / 2 - z) < 0.01),
        box: XZ[] = [
          [-PROW, z0],
          [-PROW, z1],
          [PROW, z1],
          [PROW, z0],
        ];
      if (k < 1) b.mass(box, BEDROCK, top, "rock");
      else {
        b.mass(box, BEDROCK, TIER_H[k] - 0.2, "rock");
        b.mass(box, TIER_H[k] + 4.6, top, "rock");
      }
    }
    const end = PROW_WALK_END;
    b.rect("prow-walk", "kiln", -PROW, TIER_R[6] - 1, PROW, end, Y.citadel, { thickness: 1 });
    parapet([-PROW - 0.2, end], [-PROW - 0.2, TIER_R[6]], Y.citadel);
    parapet([PROW + 0.2, TIER_R[6]], [PROW + 0.2, end], Y.citadel);
    parapet([-PROW, end + 0.2], [PROW, end + 0.2], Y.citadel);
    lantern(0, Y.citadel, end - 2);
    // Four green beds on the terrace before the white tower, as in the reference.
    for (const x of [-2.2, 2.2])
      for (const z of [25, 29.4]) b.piece("drum", [3.8, 0.14, 3.8], [x, Y.citadel, z], 0, "hedge");
  }
  for (const s of stairs) {
    b.flight(`tier-stair-${s.k + 1}`, TIER_AREAS[s.k], s.low, s.dir, 8, 4, { fill: TIER_H[s.k] });
    b.floor(
      `tier-landing-${s.k + 1}`,
      s.k === 5 ? "kiln" : TIER_AREAS[s.k + 1],
      s.landing,
      TIER_H[s.k + 1],
      { thickness: 8 },
    );
  }

  // ------------------------------------------------------------ Tier 1: City Wall
  {
    const y = TIER_H[0],
      outer = TIER_R[0];
    // The great gate: a tall gatehouse between two towers on the centreline.
    b.wall([-PROW, GREAT_GATE_Z], [PROW, GREAT_GATE_Z], y, y + 12, {
      thickness: 1.2,
      openings: [
        {
          at: PROW,
          width: 6,
          height: 7,
          bottom: y,
          frame: "double-door",
          id: "great-gate",
          visibleThreshold: true,
          area: "refuge",
        },
      ],
    });
    // The curtain: kit wall runs with merlons.
    for (const side of [1, -1] as const) {
      const a0 = Math.PI - side * Math.asin(PROW / outer),
        a1 = Math.PI - side * SPAN,
        count = Math.ceil(((SPAN - Math.asin(PROW / outer)) * outer) / 8);
      const cuts = Array.from({ length: count + 1 }, (_, i) => a0 + ((a1 - a0) * i) / count);
      for (let i = 0; i < cuts.length - 1; i++) {
        const s0 = cuts[i],
          s1 = cuts[i + 1],
          p = polar(outer + 0.6, s0),
          q = polar(outer + 0.6, s1);
        const curtain = [
          polar(outer, s0),
          polar(outer + 1.2, s0),
          polar(outer + 1.2, s1),
          polar(outer, s1),
        ];
        const zs = curtain.map((c) => c[1]);
        if (side < 0 && Math.min(...zs) < 3.4 && Math.max(...zs) > -3.4) {
          // The colosseum gate passage pierces the curtain's foot.
          for (const [keep, edge] of [
            [-1, -3.4],
            [1, 3.4],
          ] as const) {
            const part = clip(curtain, edge, keep);
            if (part.length >= 3) b.mass(part, BEDROCK, -1, "wall");
          }
          b.mass(curtain, -14.6, -1, "wall");
        } else b.mass(curtain, BEDROCK, -1, "wall");
        b.wall(p, q, y, y + 7, { thickness: 1.2 });
        // Merlons follow the wall's line and sit within its thickness.
        for (const t of [0.2, 0.5, 0.8])
          b.box(
            p[0] + (q[0] - p[0]) * t,
            p[1] + (q[1] - p[1]) * t,
            y + 7,
            [1.4, 1.1, 1.1],
            Math.atan2(-(q[1] - p[1]), q[0] - p[0]),
            "trim",
          );
      }
    }
    // The apron: the plain itself before the walls, walkable at the lowest tier's level
    // so the gate opens straight onto it. Only the road out of the barbican's mouth is
    // paved; the rest shows the plain, and an unseen edge keeps the walk within it.
    {
      const { r0, r1, aW, aE } = CAPITAL_APRON,
        count = Math.ceil(((aW - aE) * r1) / 8),
        rings = [r0, r0 + 8, r1],
        edge = (p: XZ, q: XZ) =>
          b.solid(
            [(p[0] + q[0]) / 2, y, (p[1] + q[1]) / 2],
            [Math.hypot(q[0] - p[0], q[1] - p[1]), 3, 0.4],
            Math.atan2(-(q[1] - p[1]), q[0] - p[0]),
          );
      for (let i = 0; i < count; i++) {
        const s0 = aE + ((aW - aE) * i) / count,
          s1 = aE + ((aW - aE) * (i + 1)) / count,
          road = Math.abs((s0 + s1) / 2 - Math.PI) * r1 < 7;
        for (let k = 0; k < 2; k++) {
          const quad = [polar(rings[k], s0), polar(rings[k + 1], s0)];
          quad.push(polar(rings[k + 1], s1), polar(rings[k], s1));
          b.floor(`apron:${i}:${k}`, "refuge", quad, y, {
            thickness: 1,
            render: road,
          });
        }
        edge(polar(r1 + 0.2, s0), polar(r1 + 0.2, s1));
      }
      edge(polar(r0, aE), polar(r1, aE));
      edge(polar(r0, aW), polar(r1, aW));
    }
    // Bastions stand out from the curtain like the reference's, corbelled above the
    // ground-city street so its headroom stays clear, each with a crenellated top.
    for (const a of [-1.3, -0.95, -0.62, -0.32, 0.32, 0.98, 1.32]) {
      const [cx, cz] = polar(outer + 3.4, Math.PI + a);
      b.mass(octagon(cx, cz, 2.6), -10, -6, "wall");
      b.mass(octagon(cx, cz, 4.4), -6, y + 7.6, "wall");
      b.mass(octagon(cx, cz, 4.8), y + 7.6, y + 8.2, "trim");
      octagon(cx, cz, 4.3).forEach(([mx, mz], i) =>
        b.box(mx, mz, y + 8.2, [1.3, 1.1, 0.9], ((i + 0.5) * Math.PI) / 4, "trim", false),
      );
    }
    // Gate towers flank the gatehouse, and the barbican's two walls run out from them
    // onto the apron, each ending in a smaller tower.
    const crown = (cx: number, cz: number, r: number, top: number) => {
      b.mass(octagon(cx, cz, r + 0.4), top, top + 0.6, "trim");
      octagon(cx, cz, r).forEach(([mx, mz], i) =>
        b.box(mx, mz, top + 0.6, [1.3, 1.1, 0.9], ((i + 0.5) * Math.PI) / 4, "trim", false),
      );
    };
    for (const side of [-1, 1]) {
      b.mass(octagon(side * 9, GREAT_GATE_Z + 3, 4.6), BEDROCK, y + 15, "wall");
      crown(side * 9, GREAT_GATE_Z + 3, 4.4, y + 15);
      b.wall([side * 7, GREAT_GATE_Z + 7], [side * 7, GREAT_GATE_Z + 24], y, y + 8, {
        thickness: 1.4,
      });
      for (let z = GREAT_GATE_Z + 9; z < GREAT_GATE_Z + 24; z += 3)
        b.box(side * 7, z, y + 8, [1.4, 1.1, 1.3], 0, "trim");
      b.mass(octagon(side * 7, GREAT_GATE_Z + 26, 3.2), BEDROCK, y + 11, "wall");
      crown(side * 7, GREAT_GATE_Z + 26, 3, y + 11);
    }
    b.box(0, GREAT_GATE_Z, y + 12, [2 * PROW + 2, 0.6, 2], 0, "trim");
    // A beam fallen from the breach lies against the face of the second tier.
    const beamA = along(0, -1, 54),
      [fx, fz] = polar(TIER_R[1] + 1.2, beamA);
    b.prop(
      "fallen-beam",
      [0.6, 0.55, 3.4],
      [fx, y, fz],
      Math.atan2(Math.cos(beamA), Math.sin(beamA)),
      {
        material: "timber",
      },
    );
    tierHouse(0, 1, 30, "lower-house-east-1");
    tierHouse(0, 1, 46, "lower-house-east-2");
    tierHouse(0, -1, 26, "lower-house-west-1");
    tierHouse(0, -1, 42, "lower-house-west-2");
    const [shx, , shz] = CAPITAL_SITES.start;
    b.prop("crate", [1.25, 0.6, 0.9], [shx + 1, y, shz + 3.5], 0.3, { material: "timber" });
    b.prop("log-pile", [2.2, 0.5, 2.2], [shx - 9, y, shz - 1], 0, { material: "timber" });
    for (const d of [10, 60, 90])
      for (const side of [1, -1] as const) {
        // East of the prow, the first lantern stands clear of the great gate.
        const [x, , z] = onTier(0, side, side > 0 && d === 10 ? 20 : d, TIER_R[0] - 2);
        lantern(x, y, z);
      }
  }

  // ----------------------------------------------------- Tiers 2–3: Mid Town
  {
    tierHouse(1, 1, 18, "town-east-1", { storeys: 2 });
    tierHouse(1, 1, 46, "town-east-2");
    tierHouse(1, -1, 18, "town-west-1", { storeys: 2 });
    tierHouse(1, -1, 34, "town-west-2");
    tierHouse(2, 1, 16, "upper-town-east-1");
    tierHouse(2, 1, 36, "upper-town-east-2");
    tierHouse(2, -1, 22, "upper-town-west-1");
    // The town lift rises from tier 2 to a pad on tier 3 inside a kit elevator frame.
    const [lx, , lz] = town.center,
      w = 3 / 50.7;
    b.floor(
      "town-lift-pad",
      "foundry",
      [
        polar(48.5, town.a - w),
        polar(56.05 - SHAFT, town.a - w),
        polar(56.05 - SHAFT, town.a + w),
        polar(48.5, town.a + w),
      ],
      TIER_H[2],
      { thickness: 1 },
    );
    b.piece(
      "elevator",
      [7.4, TIER_H[2] + 5.6 - (TIER_H[1] - 4), 7.4],
      [lx, TIER_H[1] - 4, lz],
      Math.atan2(Math.sin(town.a), -Math.cos(town.a)),
      "trim",
      0.6,
    );
    for (const s of [-1, 1]) {
      const [x, z] = polar(56.05, town.a + (s * 4.4) / 56.05);
      lantern(x, TIER_H[1], z);
    }
  }

  // ---------------------------------------------------- Tiers 4–5: Up Town
  {
    tierHouse(3, 1, 14, "uptown-east-1");
    tierHouse(3, -1, 14, "uptown-west-1");
    tierHouse(3, -1, 30, "uptown-west-2");
    for (const [k, side, d] of [
      [4, 1, 12],
      [4, -1, 18],
      [3, 1, 30],
    ] as const) {
      b.prop("crate", [1.3, 0.4, 0.94], onTier(k, side, d, TIER_R[k] - 3), d, {
        material: "timber",
      });
      const [x, , z] = onTier(k, side, d + 4, TIER_R[k] - 1.2);
      lantern(x, TIER_H[k], z);
    }
    // Backyard Below: two kit half-turns from the garden down to Up Town's east end.
    const [tx, , tz] = CAPITAL_SITES.stairTower;
    // Four gentle kit half-turns from the garden down to Up Town's east end.
    for (let i = 0; i < 4; i++)
      b.curvedFlight(
        `backyard-below:${i}`,
        "graveyard",
        [tx, TIER_H[3] + 7.5 * i, tz],
        8,
        7.5,
        (i % 2) as 0 | 1,
      );
    b.pillar(tx, tz, BEDROCK, Y.gallery + 1 - BEDROCK, 5);
    b.box(tx, tz, Y.gallery + 1, [1.2, 0.8, 1.2], 0, "glow", false);
    const door = polar((TIER_R[3] + TIER_R[4]) / 2 + 0.5, Math.PI - SPAN);
    b.bridge(
      "backyard-below-foot",
      "graveyard",
      [tx - 5.8, tz],
      [tx - 5.8, door[1] - 2],
      TIER_H[3],
      4.4,
      {
        kind: "slab",
      },
    );
    b.floor(
      "backyard-below-join",
      "graveyard",
      [
        [door[0] - 1.2, door[1] - 2.6],
        [door[0] - 1.2, door[1] + 1],
        [tx - 3.6, door[1] + 1],
        [tx - 3.6, door[1] - 2.6],
      ],
      TIER_H[3],
      { thickness: 1 },
    );
    b.bridge("backyard-below-top", "graveyard", [tx - 5.8, tz], [tx - 5.8, -55], Y.gallery, 4.4, {
      kind: "slab",
    });
  }

  // ------------------------------------------- Tier 6: Ultimate Plaza (ring)
  {
    const k = 5;
    for (const side of [1, -1] as const)
      for (const d of [10, 22]) {
        const [x, , z] = onTier(k, side, d, bandMid(k) - 1.5);
        b.box(x, z, TIER_H[k], [1.6, 0.8, 1.6], 0, "trim");
        b.prop("post", [0.9, 3.4, 0.9], [x, TIER_H[k] + 0.8, z], 0, {
          material: "wall",
          collide: false,
        });
        b.solid([x, TIER_H[k], z], [1.6, 4.2, 1.6]);
        const [lx, , lz] = onTier(k, side, d + 5, TIER_R[k] - 1);
        lantern(lx, TIER_H[k], lz);
      }
  }

  // ---------------------------------------------------------------- Citadel
  {
    const y = Y.citadel,
      R = TIER_R[6],
      [ax, , az] = CAPITAL_SITES.arenaLift;
    const arc = Array.from({ length: 9 }, (_, i) => polar(R, Math.PI / 2 + (Math.PI * i) / 8));
    // A court over the prow root and a forecourt before the cathedral.
    b.floor("citadel", "kiln", [...arc, [-R, az + SHAFT], [R, az + SHAFT]], y, { thickness: 1 });
    b.rect("citadel-north-west", "kiln", -R, -36, ax - SHAFT, az + SHAFT, y, { thickness: 1 });
    b.rect("citadel-north-east", "kiln", ax + SHAFT, -36, R, az + SHAFT, y, { thickness: 1 });
    b.rect("citadel-north", "kiln", ax - SHAFT, -36, ax + SHAFT, az - SHAFT, y, { thickness: 1 });
    b.mass([...arc, [-R, az + 3.1], [R, az + 3.1]], -2, y - 1);
    b.mass(
      [
        [-R, -36],
        [-R, az + 3.1],
        [ax - 3.1, az + 3.1],
        [ax - 3.1, -36],
      ],
      BEDROCK,
      y - 1,
      "rock",
    );
    b.mass(
      [
        [ax + 3.1, -36],
        [ax + 3.1, az + 3.1],
        [R, az + 3.1],
        [R, -36],
      ],
      BEDROCK,
      y - 1,
      "rock",
    );
    b.mass(
      [
        [ax - 3.1, -36],
        [ax - 3.1, az - 3.1],
        [ax + 3.1, az - 3.1],
        [ax + 3.1, -36],
      ],
      BEDROCK,
      y - 1,
      "rock",
    );
    b.piece("elevator", [7.4, y + 5.6 - (Y.plain - 4), 7.4], [ax, Y.plain - 4, az], 0, "trim", 0.6);
    // A parapet around the court, open where the tier stair lands and onto the prow walk.
    const landingA = parapetGaps[6][0];
    for (let i = 0; i < 8; i++) {
      const s0 = Math.PI / 2 + (Math.PI * i) / 8,
        s1 = s0 + Math.PI / 8;
      if ((landingA - s0) * (landingA - s1) <= 0) continue;
      const p = polar(R + 0.2, s0),
        q = polar(R + 0.2, s1),
        length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (i === 3 || i === 4) parapet(p, q, y, [gap(i === 3 ? length - 2.3 : 2.3, 4.6, y)]);
      else parapet(p, q, y);
    }
    parapet([-R - 0.2, -5], [-R - 0.2, -36], y);
    parapet([R + 0.2, -20], [R + 0.2, -4], y);
    parapet([16, -36.2], [R, -36.2], y);
    parapet([-R, -36.2], [-16, -36.2], y);
    // The white tower: a kit stack rising from the court above the prow.
    const [wx, , wz] = CAPITAL_SITES.whiteTower;
    b.box(wx, wz, y, [8, 54, 8]);
    for (const dy of [12, 26, 40, 54]) b.box(wx, wz, y + dy, [9, 0.8, 9], 0, "trim");
    for (const [x, z] of [
      [-4, -4],
      [4, -4],
      [-4, 4],
      [4, 4],
    ])
      b.pillar(wx + x, wz + z, y, 56, 1.4, "trim");
    b.box(wx, wz, y + 54.8, [6, 6, 6]);
    b.piece("pillar", [3.4, 10, 3.4], [wx, y + 60.8, wz], 0, "trim");
    b.piece("post", [1.4, 9, 1.4], [wx, y + 70.8, wz], 0, "trim");
    b.box(wx, wz, y + 79.8, [0.9, 0.9, 0.9], 0, "glow", false);
    // The Oblivion Chapel: a small kit octagon with a walkable roof.
    const [cx, , cz] = CAPITAL_SITES.chapel,
      ring = octagon(cx, cz, 7.6),
      edge = 2 * 7.6 * Math.sin(Math.PI / 8);
    b.floor("chapel", "kiln", ring, y, { thickness: 1 });
    b.enclosure(ring, y, Y.gallery - 0.6, {
      openings: {
        1: [{ at: edge / 2, width: 3, height: 4, bottom: y, area: "kiln", id: "chapel-door" }],
      },
    });
    b.floor("chapel-roof", "kiln", ring, Y.gallery);
    ring.forEach((q, i) =>
      parapet(
        q,
        ring[(i + 1) % 8],
        Y.gallery,
        i === 7 ? [gap(edge / 2, 3.2, Y.gallery)] : undefined,
      ),
    );
    b.box(cx, cz, Y.gallery, [3, 3, 3], 0, "trim");
    // Inside: an altar on the west wall under a banner, candles, and benches facing it.
    b.box(cx - 5.6, cz, y, [1.2, 1.1, 3], 0, "trim");
    b.piece("banner", [1.6, 3.6, 0.05], [cx - 6.7, y + 1.6, cz], Math.PI / 2, "cloth");
    for (const dz of [-1.1, 1.1]) {
      b.piece("post", [0.18, 0.5, 0.18], [cx - 5.6, y + 1.1, cz + dz], 0, "trim");
      b.box(cx - 5.6, cz + dz, y + 1.6, [0.12, 0.18, 0.12], 0, "glow", false);
    }
    for (const dz of [-2.6, 2.6])
      for (const dx of [-3.4, -1.9])
        b.prop("crate", [0.5, 0.45, 1.8], [cx + dx, y, cz + dz], 0, { material: "timber" });
    b.flight("chapel-roof-stair", "kiln", [cx + 10, y, cz - 11], [-1, 0], 6, 4, { fill: y });
    b.rect("chapel-roof-landing", "kiln", cx - 4, cz - 13, cx + 1, cz - 6, Y.gallery, {
      thickness: 6,
    });
    lantern(cx + 7, y, cz + 4);
    lantern(12, y, -30);
    // The White Tree in its fountain before the tower: a pale kit trunk with bare,
    // radiating limbs that turn up at their tips, ringed by a low basin.
    {
      const [tx, tz] = [-9, 11],
        basin = octagon(tx, tz, 3.2);
      basin.forEach((q, i) =>
        b.wall(q, basin[(i + 1) % 8], y, y + 0.7, { thickness: 0.5, material: "trim" }),
      );
      b.piece("block", [5.4, 0.1, 5.4], [tx, y + 0.45, tz], Math.PI / 8, "water");
      b.box(tx, tz, y, [0.9, 5.2, 0.9], 0.3, "trim");
      for (let i = 0; i < 7; i++) {
        const a = i * 2.39 + 0.4,
          h = y + 3.6 + (i % 3) * 0.7,
          len = 1.6 + (i % 2) * 0.9;
        b.box(
          tx + Math.sin(a) * len * 0.5,
          tz + Math.cos(a) * len * 0.5,
          h,
          [0.22, 0.22, len],
          a,
          "trim",
          false,
        );
        b.box(
          tx + Math.sin(a) * len,
          tz + Math.cos(a) * len,
          h,
          [0.18, 0.9 + (i % 3) * 0.3, 0.18],
          a,
          "trim",
          false,
        );
      }
      b.box(tx, tz, y + 5.2, [0.5, 1.4, 0.5], 0.8, "trim", false);
    }
    lantern(-12, y, 8);
  }

  // ------------------------------------------------------ Asylum Cathedral
  {
    const y = Y.citadel,
      g = Y.gallery,
      [, , apseZ] = CAPITAL_SITES.apse,
      apse = octagon(0, apseZ, 14);
    b.rect("nave", "cloister", -16, -68, 16, -36, y, { thickness: 1 });
    b.rect("transept", "cloister", -22, -80, 22, -68, y, { thickness: 1 });
    b.floor("apse", "cloister", apse, y, { thickness: 1 });
    b.rect("gallery-west", "cloister", -16, -68, -10, -36, g);
    b.rect("gallery-east", "cloister", 10, -68, 16, -36, g);
    b.rect("gallery-loft", "cloister", -10, -40, 10, -36, g);
    for (const x of [-13, 13])
      b.flight(`gallery-stair:${x}`, "cloister", [x, y, -77], [0, 1], 6, 5, { fill: y });
    b.wall([16, -36], [-16, -36], y, 68, {
      openings: [
        {
          at: 16,
          width: 6,
          height: 5,
          bottom: y,
          frame: "double-door",
          id: "cathedral-front",
          area: "cloister",
        },
      ],
    });
    b.wall([16, -68], [16, -36], y, 68, {
      openings: [
        { at: 8, width: 2.4, height: 3.6, bottom: g, id: "gallery-east-door", area: "aqueduct" },
      ],
    });
    b.wall([-16, -36], [-16, -68], y, 68, {
      openings: [
        {
          at: 22,
          width: 3,
          height: 3.6,
          bottom: g,
          id: "gallery-west-door",
          visibleThreshold: true,
          area: "belfry",
        },
      ],
    });
    b.wall([22, -68], [16, -68], y, 64);
    b.wall([22, -80], [22, -68], y, 64);
    b.wall([-22, -80], [22, -80], y, 64, {
      openings: [
        {
          at: 22,
          width: 6,
          height: 7,
          bottom: y,
          frame: "double-door",
          id: "apse-door",
          area: "cloister",
        },
      ],
    });
    b.wall([-22, -68], [-22, -80], y, 64);
    b.wall([-16, -68], [-22, -68], y, 64);
    apse.forEach((q, i) => {
      if (i !== 3) b.wall(q, apse[(i + 1) % 8], y, 64);
    });
    for (const x of [-10, 10]) {
      for (const z of [-42, -50, -58, -66]) b.pillar(x, z, y, 20, 1.2);
      parapet([x, -68], [x, -40], g);
    }
    parapet([-10, -40.2], [10, -40.2], g);
    for (let z = -63; z <= -43; z += 5)
      for (const x of [-5.5, 5.5]) {
        b.prop("scaffold", [4, 0.63, 1], [x, y, z], 0, { material: "timber" });
        b.box(x, z - 0.55, y, [4, 1.2, 0.2], 0, "timber");
      }
    for (const [i, q] of apse.entries())
      if (i !== 3 && i !== 4) b.pillar(q[0] * 0.92, apseZ + (q[1] - apseZ) * 0.92, y, 16, 1.4);
    for (const a of [-1, 1]) {
      const x = a * 8.6,
        z = apseZ - 9;
      b.prop("drum", [0.9, 1.1, 0.9], [x, y, z], 0, { material: "wall" });
      b.box(x, z, y + 1.1, [0.5, 0.35, 0.5], 0, "glow", false);
    }
    b.prop("debris", [2.4, 0.6, 1.9], [-10, y, apseZ + 4], 0.6, { collide: false, thickness: 0.5 });
    // Pale gabled roofs over the nave and transept, a stepped dome over the apse and
    // pilasters down the walls, so the hall reads as the reference's citadel palace.
    b.box(0, -52, 68, [33, 1, 33], 0, "trim");
    b.piece("roof", [32, 6, 33], [0, 69, -52], Math.PI / 2, "roof", 0.6);
    b.box(0, -74, 64, [45, 1, 13], 0, "trim");
    b.piece("roof", [45, 4, 12], [0, 65, -74], 0, "roof", 0.6);
    b.mass(apse, 64, 65, "trim");
    for (const [i, [r, h]] of [
      [12, 2],
      [10, 2],
      [7.5, 1.6],
      [4.5, 1.4],
    ].entries())
      b.piece("drum", [r * 2, h, r * 2], [0, 65 + i * 2, apseZ], 0, i % 2 ? "trim" : "roof");
    b.piece("spire", [2.4, 5, 2.4], [0, 72.8, apseZ], 0, "trim");
    for (const x of [-16.5, 16.5])
      for (const z of [-38.5, -50, -62, -67]) b.box(x, z, y, [1, 20, 1.3], 0, "trim", false);
    b.mass(
      [
        [-16, -68],
        [-16, -36],
        [16, -36],
        [16, -68],
      ],
      BEDROCK,
      y - 1,
      "rock",
    );
    b.mass(
      [
        [-22, -80],
        [-22, -68],
        [22, -68],
        [22, -80],
      ],
      BEDROCK,
      y - 1,
      "rock",
    );
    b.mass(apse, BEDROCK, y - 1, "rock");
    lantern(-8, y, -70);
    lantern(8, y, -70);
    lantern(-12, g, -50);
    // Banners hang from the nave pillars, a red runner leads to the transept, and
    // candle stands ring the apse outside the keeper's circle.
    for (const x of [-9.3, 9.3])
      for (const z of [-42, -50, -58, -66])
        b.piece("banner", [1.3, 6, 0.06], [x, y + 9, z], Math.PI / 2, "cloth");
    b.piece("block", [3, 0.04, 30], [0, y + 0.02, -52], 0, "cloth");
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * 0.15 + (i / 9) * Math.PI * 0.7 + Math.PI,
        [x, z] = [Math.cos(a) * 12.4, apseZ + Math.sin(a) * 12.4];
      if (Math.hypot(x, z - apseZ) < 12) continue;
      b.prop("post", [0.3, 1.3, 0.3], [x, y, z], 0, { material: "iron" });
      b.box(x, z, y + 1.3, [0.16, 0.24, 0.16], 0, "glow", false);
    }
    for (const x of [-20, 20]) b.piece("banner", [1.8, 7, 0.06], [x, y + 2.2, -79.6], 0, "cloth");
  }

  // ------------------------------------- Church outside path and Royal Backyard
  {
    const y = Y.citadel,
      g = Y.gallery;
    b.rect("outside-path", "aqueduct", 20, -46, 24, -20, y, { thickness: 1 });
    parapet([24.2, -20], [24.2, -46], y);
    parapet([20, -19.8], [24, -19.8], y);
    b.flight("outside-path-stair", "aqueduct", [22, y, -46], [0, -1], 6, 4, { fill: y });
    b.rect("outside-path-upper", "aqueduct", 16, -70, 24, -55, g, { thickness: 1 });
    parapet([24.2, -55], [24.2, -62], g);
    parapet([24.2, -66], [24.2, -70], g);
    parapet([16, -70.2], [24, -70.2], g);
    b.mass(
      [
        [20, -46],
        [20, -20],
        [24, -20],
        [24, -46],
      ],
      BEDROCK,
      y - 1,
      "rock",
    );
    b.mass(
      [
        [16.3, -70],
        [16.3, -55],
        [24, -55],
        [24, -70],
      ],
      BEDROCK,
      g - 1,
      "rock",
    );
    b.bridge("backyard-bridge", "aqueduct", [24, -64], [37, -64], g, 4, { kind: "slab" });
    // The bridge rides an arcade, like the reference's viaduct along the ridge.
    for (const x of [28.3, 32.7]) b.pillar(x, -64, 28, g - 1 - 28, 1.8);
    for (const [x0, x1] of [
      [24, 28.3],
      [28.3, 32.7],
      [32.7, 35],
    ])
      b.box((x0 + x1) / 2, -64, g - 2.6, [x1 - x0, 1.6, 3.6], 0, "wall", false);
    const [cx, , cz] = CAPITAL_SITES.backyard,
      island = octagon(cx, cz, 12);
    b.floor("backyard", "graveyard", island, g, { thickness: 1 });
    b.mass(island, 20, g - 1, "rock");
    island.forEach((q, i) => {
      if (i === 5) return;
      parapet(q, island[(i + 1) % 8], g, i === 4 ? [gap(2.4, 4.6, g)] : undefined);
    });
    for (const [x, z] of [
      [-4, -2],
      [4, -2],
      [-4, 6],
      [4, 6],
    ])
      b.pillar(cx + x, cz + z, g, 4, 0.9, "trim");
    b.box(cx, cz + 2, g + 4, [9.4, 0.5, 9.4], 0, "trim", false);
    // A domed pavilion, like the small domed halls on the reference's ridge.
    for (const [i, [w, h]] of [
      [8, 1],
      [6.4, 1.2],
      [4.2, 1.2],
    ].entries())
      b.piece("drum", [w, h, w], [cx, g + 4.5 + i * 1.1, cz + 2], 0, i === 1 ? "trim" : "roof");
    b.piece("spire", [1, 1.8, 1], [cx, g + 7.8, cz + 2], 0, "trim");
    b.prop("corner-wall", [3, 2.4, 3], [cx + 7, g, cz - 6], -Math.PI / 2, {
      thickness: 0.4,
      collide: false,
    });
    b.solid([cx + 7.8, g, cz - 6], [1.4, 2.4, 3]);
    b.prop("log-pile", [2.4, 0.5, 2.4], [cx + 7, g, cz + 4], 0, { material: "timber" });
    b.prop("crate", [1.25, 0.6, 0.9], [cx - 6.5, g, cz + 5], 0.4, { material: "timber" });
    b.prop("debris", [2.4, 0.5, 1.9], [cx + 1, g, cz - 8], 0, { collide: false, thickness: 0.4 });
    lantern(cx - 8, g, cz - 2);
    lantern(cx + 8, g, cz + 6);
    // Clipped hedges in kit planters and a small fountain under the pavilion.
    for (const [x, z, w] of [
      [cx - 4.5, cz - 9, 4],
      [cx + 3, cz + 9.5, 5],
    ] as const) {
      b.box(x, z, g, [w + 0.3, 0.5, 1.4], 0, "trim");
      b.box(x, z, g + 0.5, [w, 0.9, 1.1], 0, "hedge", false);
    }
    b.prop("drum", [1.6, 0.6, 1.6], [cx, g, cz + 2], 0, { material: "trim" });
    b.piece("drum", [1.3, 0.05, 1.3], [cx, g + 0.56, cz + 2], 0, "water");
  }

  // ------------------------------------------------------- Beacon pathway
  {
    const y = Y.gallery,
      [bx, , bz] = CAPITAL_SITES.beaconTower,
      [lx, , lz] = CAPITAL_SITES.beaconLift,
      rise = (y - Y.plain) / 6;
    b.bridge("beacon-pathway", "belfry", [-16.6, lz], [bx + 20, lz], y, 4, { kind: "walkway" });
    for (const x of [-26, -36, -46]) b.pillar(x, lz, BEDROCK, y - 0.15 - BEDROCK, 1.2);
    b.rect("beacon-top", "belfry", bx + 3, bz, lx - SHAFT, bz + 12, y);
    b.rect("beacon-top-south", "belfry", lx - SHAFT, lz + SHAFT, lx + SHAFT, bz + 12, y);
    b.rect("beacon-top-east", "belfry", lx + SHAFT, bz, bx + 20, bz + 12, y);
    parapet([bx + 3, bz + 12.2], [bx + 20, bz + 12.2], y);
    parapet([bx + 2.8, bz + 12], [bx + 2.8, bz + 9], y);
    for (let i = 0; i < 6; i++)
      b.curvedFlight(
        `beacon-spiral:${i}`,
        "belfry",
        [bx, y - rise * (i + 1), bz],
        9,
        rise,
        (i % 2) as 0 | 1,
      );
    b.pillar(bx, bz, BEDROCK, y + 4 - BEDROCK, 5.6);
    b.box(bx, bz, y + 4, [3, 2, 3], 0, "glow", false);
    b.box(bx, bz, y + 6, [4.4, 0.6, 4.4], 0, "trim");
    for (const x of [bx + 10, bx + 18]) b.pillar(x, bz + 11, BEDROCK, y - 0.6 - BEDROCK, 1.4);
    b.piece("elevator", [7.4, y + 5.6 - (Y.plain - 4), 7.4], [lx, Y.plain - 4, lz], 0, "trim", 0.6);
    lantern(bx + 18, y, bz + 1.5);
  }

  // --------------------------------------- Grand Street beneath the plain
  // The old road runs covered beneath the plain, from the beacon's sunken foot to the
  // gate into the mountain, so the plain above it lies flat to the walls.
  {
    const y = Y.plain,
      [bx, , bz] = CAPITAL_SITES.beaconTower,
      [lx, , lz] = CAPITAL_SITES.beaconLift,
      street = { thickness: 3 } as const;
    b.rect("beacon-foot", "crypt", bx - 12, bz - 30, bx + 18, bz, y, street);
    b.rect("beacon-foot-lift", "crypt", lx - SHAFT, bz, lx + SHAFT, lz - SHAFT, y, street);
    const route: XZ[] = [
      [-74, -76],
      [LOWER_STREET_X, -40],
      [LOWER_STREET_X, 0],
    ];
    route.forEach((p, i) => {
      b.floor(`grand-street-joint:${i}`, "crypt", octagon(p[0], p[1], 4.4), y, street);
      if (i)
        b.bridge(`grand-street:${i}`, "crypt", route[i - 1], p, y, 8, {
          kind: "slab",
          rails: [false, false],
        });
    });
    b.rect(
      "grand-street-turn",
      "crypt",
      LOWER_STREET_X - 4.2,
      -4.2,
      LOWER_STREET_X + 4,
      4.2,
      y,
      street,
    );
    // Walls and a vault follow the road from where it leaves the beacon's foot, mitred at
    // each turn, and close round the gate passage's mouth.
    const mouth = 0.25,
      tunnel: XZ[] = [
        [-74 + (LOWER_STREET_X + 74) * mouth, -76 + 36 * mouth],
        ...route.slice(1),
        [LOWER_STREET_X + 4, 0],
      ],
      height = 7,
      side = (d: number) =>
        tunnel.map(([x, z], i): XZ => {
          const normal = (j: number) => {
            const [p, q] = [tunnel[j], tunnel[j + 1]],
              length = Math.hypot(q[0] - p[0], q[1] - p[1]);
            return [-(q[1] - p[1]) / length, (q[0] - p[0]) / length] as const;
          };
          const n0 = normal(Math.max(0, i - 1)),
            n1 = normal(Math.min(tunnel.length - 2, i)),
            mx = n0[0] + n1[0],
            mz = n0[1] + n1[1],
            k = d / (mx * n1[0] + mz * n1[1]);
          return [x + mx * k, z + mz * k];
        });
    const left = side(4.6),
      right = side(-4.6),
      leftRoof = side(5.2),
      rightRoof = side(-5.2);
    for (let i = 0; i < tunnel.length - 1; i++) {
      b.wall(left[i], left[i + 1], y, y + height, { thickness: 0.8 });
      b.wall(right[i], right[i + 1], y, y + height, { thickness: 0.8 });
      b.mass(
        [leftRoof[i], leftRoof[i + 1], rightRoof[i + 1], rightRoof[i]],
        y + height,
        y + height + 1,
      );
    }
    // Retaining walls hold the plain back round the sunken court, with a parapet along
    // their brink; a block above the road's vault closes the court's south-west corner.
    const { x0, x1, z0, z1 } = BEACON_COURT,
      t = 3.6;
    for (const [ax, az, cx, cz] of [
      [x0, z0, x1, z0 + t],
      [x1 - t, z0 + t, x1, z1],
      [x0 + 6, z1 - t, x1 - t, z1],
      [x0, z0 + t, x0 + t, -72],
    ])
      b.mass(
        [
          [ax, az],
          [cx, az],
          [cx, cz],
          [ax, cz],
        ],
        BEDROCK,
        0,
        "wall",
      );
    b.mass(
      [
        [x0, -72],
        [x0 + 6, -72],
        [x0 + 6, z1],
        [x0, z1],
      ],
      y + height + 1,
      0,
      "wall",
    );
    for (const [p, q] of [
      [
        [x0 + t, z0 + t],
        [x1 - t, z0 + t],
      ],
      [
        [x1 - t, z0 + t],
        [x1 - t, z1 - t],
      ],
      [
        [x1 - t, z1 - t],
        [x0 + 6, z1 - t],
      ],
      [
        [x0 + 6, z1 - t],
        [x0 + 6, -72],
      ],
      [
        [x0 + 6, -72],
        [x0 + t, -72],
      ],
      [
        [x0 + t, -72],
        [x0 + t, z0 + t],
      ],
    ] as Array<[XZ, XZ]>)
      parapet(p, q, 0);
    b.wall(left.at(-1)!, right.at(-1)!, y, y + height, {
      thickness: 0.8,
      openings: [{ at: 4.6, width: 6, bottom: y, height: 6, frame: "none" }],
    });
    // The gate into the mountain, ending at the colosseum's sealed door.
    b.hallway("colosseum-gate", "crypt", [LOWER_STREET_X + 4, 0], [-21.85, 0], y, 6, 6);
    for (const z of [-30, -12]) lantern(LOWER_STREET_X + 3.2, y, z);
    for (const x of [-3, 3]) lantern(x, 0, CAPITAL_SITES.greatGateFoot[2]);
  }

  // ------------------------------------------------------- Glory Colosseum
  {
    const [cx, y, cz] = CAPITAL_SITES.colosseum,
      ring = octagon(cx, cz, 23),
      apothem = 23 * Math.cos(Math.PI / 8),
      edge = 2 * 23 * Math.sin(Math.PI / 8),
      [ax, , az] = CAPITAL_SITES.arenaLift;
    b.floor("colosseum", "arena", ring, y, { thickness: 3 });
    b.enclosure(ring, y, -6, {
      thickness: 1.2,
      openings: {
        5: [
          {
            at: edge / 2,
            width: 6,
            height: 6,
            bottom: y,
            id: "colosseum-gate",
            visibleThreshold: true,
            area: "arena",
          },
        ],
        7: [
          {
            at: edge / 2,
            width: 4,
            height: 4.5,
            bottom: y,
            id: "colosseum-lift",
            visibleThreshold: true,
            area: "arena",
          },
        ],
      },
    });
    for (let i = 0; i < 8; i++) {
      if (i === 5 || i === 7) continue;
      const phi = ((i + 1) * Math.PI) / 4;
      for (let k = 0; k < 2; k++) {
        const d = apothem - 0.6 - 0.75 - 1.5 * (1 - k),
          length = 2 * d * Math.tan(Math.PI / 8) - 1.2;
        b.box(
          cx + Math.sin(phi) * d,
          cz - Math.cos(phi) * d,
          y,
          [length, (k + 1) * 1.1, 1.5],
          -phi,
          k ? "trim" : "wall",
        );
      }
    }
    for (const q of ring) b.pillar(cx + (q[0] - cx) * 0.97, cz + (q[1] - cz) * 0.97, y, 14, 2);
    b.mass(octagon(cx, cz, 24.6), -6, -2, "wall");
    b.piece(
      "double-door",
      [8, 9, 0.15],
      [cx + apothem - 0.68, y, cz],
      -Math.PI / 2,
      "piece",
      0.8,
      true,
    );
    for (const a of [-1, 1]) {
      const x = cx + a * 9,
        z = cz + apothem - 3;
      b.prop("drum", [0.9, 1.1, 0.9], [x, y, z], 0, { material: "wall" });
      b.box(x, z, y + 1.1, [0.5, 0.35, 0.5], 0, "glow", false);
    }
    b.hallway("colosseum-lift-hall", "arena", [ax, cz - apothem - 0.6], [ax, az + SHAFT], y, 5, 5);
    // Bedrock around the hall, open for the gate passage, lift hall and shaft.
    const n = cz - apothem - 1.2;
    for (const part of [
      [
        [-26, n],
        [-26, -3.4],
        [cx - apothem - 0.6, -3.4],
        [cx - apothem - 0.6, n],
      ],
      [
        [-26, -36],
        [-26, n],
        [ax - 3.1, n],
        [ax - 3.1, -36],
      ],
      [
        [ax + 3.1, -36],
        [ax + 3.1, n],
        [26, n],
        [26, -36],
      ],
      [
        [ax - 3.1, -36],
        [ax - 3.1, az - 3.1],
        [ax + 3.1, az - 3.1],
        [ax + 3.1, -36],
      ],
    ] as XZ[][])
      b.mass(part, BEDROCK, -2);
    b.mass(
      [
        [ax - 3.1, az + 3.1],
        [ax - 3.1, n],
        [ax + 3.1, n],
        [ax + 3.1, az + 3.1],
      ],
      y + 5,
      -2,
    );
    for (const a of [-1, 1]) lantern(cx + a * 6, y, cz + apothem - 2);
    lantern(ax + 1.8, y, n - 3);
    // Banners above the stands and braziers burning on the upper seats.
    for (let i = 0; i < 8; i++) {
      if (i === 5 || i === 7) continue;
      const phi = ((i + 1) * Math.PI) / 4,
        r = apothem - 0.68;
      b.piece(
        "banner",
        [2.2, 6, 0.06],
        [cx + Math.sin(phi) * r, y + 5, cz - Math.cos(phi) * r],
        -phi,
        "cloth",
      );
      const d = apothem - 0.6 - 0.75;
      for (const s of [-1, 1]) {
        const along = s * 3,
          x = cx + Math.sin(phi) * d + Math.cos(phi) * along,
          z = cz - Math.cos(phi) * d + Math.sin(phi) * along;
        b.piece("drum", [0.8, 0.7, 0.8], [x, y + 2.2, z], 0, "iron");
        b.box(x, z, y + 2.9, [0.5, 0.35, 0.5], 0, "glow", false);
      }
    }
  }
  /** An enterable, furnished home in the row, built like the tier houses. */
  function home(k: number, side: 1 | -1, d: number, back: number, w: number, depth: number) {
    const a = along(k, side, d),
      [ox, oz] = polar(back, a),
      t = frame(b, ox, oz, Math.atan2(Math.sin(a), -Math.cos(a))),
      id = `home-${k + 1}-${side > 0 ? "east" : "west"}-${Math.round(d)}`;
    house(t, {
      id,
      area: TIER_AREAS[k],
      x0: -w / 2,
      z0: 0,
      x1: w / 2,
      z1: depth,
      base: TIER_H[k],
      storeys: 1,
      doors: [{ side: "s", c: 0 }],
    });
    CAPITAL_HOMES.push({
      id,
      k,
      spot: t.world([-0.9, depth - 1.4], TIER_H[k]),
      approach: [t.world([0, depth + 1.8], TIER_H[k]), t.world([0, depth - 0.8], TIER_H[k])],
    });
  }
  rowQuarters(b, reserved, home);
  // Two rings of detached blocks pack the broad lowest tier like the reference. They
  // leave the inner street, a back lane, the street under the curtain, two cross streets
  // per side, the gate forecourt, the start courtyard, the breach and the end stair open.
  {
    const rand = scatter(4421),
      dEnd = SPAN * bandMid(0),
      s0 = TIER_STAIRS[0],
      stairD =
        Math.abs(Math.PI - ((Math.atan2(s0.low[0], -s0.low[2]) + 2 * Math.PI) % (2 * Math.PI))) *
        bandMid(0);
    for (const side of [1, -1] as const)
      for (const [back, depth] of [
        [75.5, 8.5],
        [85.6, 5.9],
      ]) {
        const scale = bandMid(0) / (back + depth / 2);
        const blocked: Array<[number, number]> = [
          [0, 9],
          [66, 74],
          [101, 109],
          [dEnd - 6, dEnd + 10],
          ...(side > 0
            ? ([
                [6, 40],
                [s0.side > 0 ? stairD - 14 : dEnd, dEnd],
              ] as Array<[number, number]>)
            : ([[back > 80 ? 46 : 50, back > 80 ? 64 : 58]] as Array<[number, number]>)),
        ];
        const free = (d0: number, d1: number) => blocked.every(([p, q]) => d1 <= p || d0 >= q);
        let d = 12;
        while (d < dEnd) {
          const w = 6 + rand() * 4,
            span = w * scale;
          if (!free(d, d + span)) {
            d += 1;
            continue;
          }
          const tower = rand() < 0.1,
            storeys = tower ? 4 : 1 + Math.floor(rand() * 3);
          rowBuilding(b, 0, side, d + span / 2, back, w, depth, storeys, tower, rand, 4.5);
          d += span + (1 + rand() * 0.9) * scale;
        }
      }
  }
  return lanterns;
}

/** Deterministic scatter, so the quarters are identical on every load. */
function scatter(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/**
 * Packs closed kit row buildings against each tier's retaining face, like the white
 * terraces of the reference: varied widths and storeys, windows, cornices, doors, flat
 * crenellated roofs, gables and the odd tower. Each keeps a street at least 4.2 m wide
 * along the parapet, and keeps clear of gates, stairs, lifts and the enterable houses.
 */
function rowQuarters(
  b: CapitalBuilder,
  reserved: Map<string, Array<[number, number]>>,
  home: (k: number, side: 1 | -1, d: number, back: number, w: number, depth: number) => void,
) {
  const rand = scatter(7919);
  let eligible = 0;
  const storey = 4.5;
  for (let k = 0; k < 5; k++)
    for (const side of [1, -1] as const) {
      const inner = TIER_R[k + 1],
        outer = TIER_R[k],
        back = inner + 0.4,
        scale = bandMid(k) / back,
        dEnd = SPAN * bandMid(k);
      const blocked: Array<[number, number]> = [
        // The prow ends above the lowest tier, which only keeps a short avenue clear.
        [0, k === 0 ? 6 : 10],
        [dEnd - 4, dEnd + 10],
        ...(reserved.get(`${k}:${side}`) ?? []),
      ];
      const stair = TIER_STAIRS[k];
      if (stair.side === side) {
        const a = Math.atan2(stair.low[0], -stair.low[2]),
          dLow = Math.abs(Math.PI - ((a + 2 * Math.PI) % (2 * Math.PI))) * bandMid(k);
        blocked.push([dLow - (k === 0 ? 12 : 8), dEnd + 10]);
      }
      if (k === 0 && side === 1) blocked.push([8, 36]);
      if (k === 0 && side === -1) blocked.push([48, 60]);
      if (k === 1 && side === 1) blocked.push([22, 38]);
      const free = (d0: number, d1: number) => blocked.every(([p, q]) => d1 <= p || d0 >= q);
      const [wMin, wMax] = k < 2 ? [6, 11] : k < 4 ? [5, 9] : [4, 7];
      let d = 10;
      while (d < dEnd) {
        const tower = k < 4 && rand() < 0.12,
          w = tower ? 5 : wMin + rand() * (wMax - wMin),
          span = w * scale;
        if (!free(d, d + span)) {
          d += 1;
          continue;
        }
        const front = Math.sqrt((outer - 4.5) ** 2 - (w / 2) ** 2) - back,
          depth = Math.min(6.5, front);
        // Every other broad house on the lower three tiers can be entered.
        const enterable = k <= 2 && !tower && w >= 6.5 && depth >= 3.8 && eligible++ % 2 === 1;
        if (enterable) home(k, side, d + span / 2, back, w, depth);
        else if (depth > 1.6) {
          const storeys = tower
            ? 4 + Math.floor(rand() * 2)
            : 1 + Math.floor(rand() * (k < 4 ? 3 : 2));
          rowBuilding(b, k, side, d + span / 2, back, w, depth, storeys, tower, rand, storey);
        }
        d += span + (0.4 + rand() * 0.8) * scale;
      }
    }
}

function rowBuilding(
  b: CapitalBuilder,
  k: number,
  side: 1 | -1,
  d: number,
  back: number,
  w: number,
  depth: number,
  storeys: number,
  tower: boolean,
  rand: () => number,
  storey: number,
) {
  const a = along(k, side, d),
    [ox, oz] = polar(back, a),
    yaw = Math.atan2(Math.sin(a), -Math.cos(a)),
    c = Math.cos(yaw),
    s = Math.sin(yaw),
    y = TIER_H[k],
    height = storeys * storey;
  const P = (x: number, z: number): XZ => [ox + x * c + z * s, oz - x * s + z * c];
  const at = (
    x: number,
    z: number,
    bottom: number,
    size: ParishPoint,
    m: CapitalMaterial,
    collide = false,
  ) => {
    const [px, pz] = P(x, z);
    b.box(px, pz, bottom, size, yaw, m, collide);
  };
  const place = (
    model: Parameters<CapitalBuilder["piece"]>[0],
    size: ParishPoint,
    x: number,
    z: number,
    bottom: number,
    m: CapitalMaterial,
    thickness?: number,
    leaves?: boolean,
  ) => {
    const [px, pz] = P(x, z);
    b.piece(model, size, [px, bottom, pz], yaw, m, thickness, leaves);
  };
  const bodyDepth = tower ? Math.min(depth, 5) : depth;
  // The body, with a plinth course and a cornice at each floor.
  at(0, bodyDepth / 2, y, [w, height, bodyDepth], "house", true);
  at(0, bodyDepth / 2, y, [w + 0.2, 0.6, bodyDepth + 0.2], "trim");
  for (let i = 1; i <= storeys; i++)
    at(0, bodyDepth / 2, y + i * storey - 0.3, [w + 0.3, 0.3, bodyDepth + 0.3], "trim");
  // Bays of windows; the door takes one ground-floor bay.
  const bays = Math.max(1, Math.floor(w / 2.4)),
    pitch = w / bays,
    door = Math.floor(rand() * bays);
  for (let i = 0; i < storeys; i++)
    for (let j = 0; j < bays; j++) {
      const x = -w / 2 + pitch * (j + 0.5),
        bottom = y + i * storey;
      if (i === 0 && j === door) {
        place("door", [1.9, 3, 0.2], x, bodyDepth + 0.05, bottom + 0.6, "timber", 0.3, true);
        continue;
      }
      const wh = i === 0 ? 1.6 : 2;
      place("window", [1.1, wh, 0.2], x, bodyDepth + 0.08, bottom + 1.4, "trim", 0.16);
      at(x, bodyDepth + 0.02, bottom + 1.45, [0.85, wh - 0.1, 0.04], "shadow");
    }
  const top = y + height;
  if (tower) {
    // Some houses hang a banner between their upper windows.
    if (storeys >= 2 && rand() < 0.3)
      place("banner", [1, 3.2, 0.05], 0, bodyDepth + 0.12, y + storey + 0.6, "cloth");
    place("spire", [w + 0.6, 6, bodyDepth + 0.6], 0, bodyDepth / 2, top, "roof");
    return;
  }
  const roof = rand();
  if (roof < 0.45) {
    // A flat roof behind a crenellated parapet.
    at(0, bodyDepth - 0.2, top, [w, 0.6, 0.4], "trim");
    at(0, 0.2, top, [w, 0.6, 0.4], "trim");
    for (const sx of [-1, 1])
      at((sx * (w - 0.4)) / 2, bodyDepth / 2, top, [0.4, 0.6, bodyDepth], "trim");
    for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 1.4)
      at(x, bodyDepth - 0.2, top + 0.6, [0.6, 0.6, 0.4], "trim");
  } else
    place("roof", [w, Math.min(3, bodyDepth * 0.6), bodyDepth], 0, bodyDepth / 2, top, "roof", 0.3);
  if (rand() < 0.5) at(w / 2 - 1.2, bodyDepth * 0.35, top, [0.8, 2.4, 0.8], "trim");
}
