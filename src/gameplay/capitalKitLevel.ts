import type { ParishArea, ParishPoint } from "./ashenParish.ts";
import type { CapitalKitModel } from "./capitalBuildingKit.ts";

/**
 * The capital is assembled only from blockout kit pieces. Each primitive below places
 * the visible kit pieces and records the matching walkable surfaces (navigation and
 * floor collision) and box solids (physics and AI blocking), so the three never drift.
 *
 * Kit conventions: `block` is centred; every other piece stands on its base, centred in
 * X/Z. Openings and flights face +Z, stairs climb towards -Z, and three.js yaw maps a
 * local (x, z) to (x cos + z sin, -x sin + z cos).
 */
export type CapitalSurface = {
  id: string;
  area: ParishArea;
  vertices: ParishPoint[];
  layer: "upper" | "lower";
};
export type CapitalSolid = { position: ParishPoint; size: ParishPoint; yaw: number };
export type CapitalMaterial =
  | "wall"
  | "floor"
  | "piece"
  | "trim"
  | "timber"
  | "iron"
  | "rock"
  | "glow"
  | "marker"
  | "house"
  | "roof"
  | "shadow"
  | "cloth"
  | "hedge"
  | "water";
export type CapitalPiece = {
  model: CapitalKitModel;
  size: ParishPoint;
  position: ParishPoint;
  yaw: number;
  thickness?: number;
  material: CapitalMaterial;
  /** Sealed doors render their kit leaves shut; passable frames have none. */
  leaves?: boolean;
};
/** A prism slab: walkable floors, ramps under kit stairs, roofs and masonry masses. */
export type CapitalSlab = {
  vertices: ParishPoint[];
  thickness: number;
  material: CapitalMaterial;
  render: boolean;
  collide: boolean;
  /** A doorway patch bridges the adjoining floors; rendering trims their overlap. */
  threshold?: boolean;
  /** Closed masonry: rock may meet it, unlike walkable floors and kit pieces. */
  mass?: boolean;
};
export type CapitalDoorRecord = {
  id: string;
  width: number;
  height: number;
  position: ParishPoint;
};
export type CapitalRouteRecord = {
  id: string;
  kind: "path" | "street" | "stair";
  width: number;
  /** Clear height above the walking surface, where the piece has a ceiling. */
  headroom?: number;
};
export type CapitalRoomRecord = {
  id: string;
  width: number;
  depth: number;
  height: number;
  high?: boolean;
};
export type XZ = readonly [number, number];
export type CapitalOpening = {
  /** Distance of the opening centre from the wall's start. */
  at: number;
  width: number;
  bottom: number;
  height: number;
  frame?: "doorway" | "door" | "double-door" | "none";
  id?: string;
  /** Lays a threshold through the wall, joining the floors either side for navigation. */
  area?: ParishArea;
  /** Render a floor patch when neighboring floors leave the opening uncovered. */
  visibleThreshold?: boolean;
};

const BORDER = 0.4;
export const KIT_STEP_RUN = 0.3;

export function octagon(cx: number, cz: number, r: number): XZ[] {
  return Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) * Math.PI) / 4;
    return [cx + Math.sin(a) * r, cz - Math.cos(a) * r] as const;
  });
}

export function createCapitalBuilder() {
  const surfaces: CapitalSurface[] = [];
  const solids: CapitalSolid[] = [];
  const pieces: CapitalPiece[] = [];
  const slabs: CapitalSlab[] = [];
  const masses: Array<{ vertices: ParishPoint[]; bottom: number }> = [];
  const doors: CapitalDoorRecord[] = [];
  const routes: CapitalRouteRecord[] = [];
  const rooms: CapitalRoomRecord[] = [];
  const layer = (y: number) => (y < -1 ? "lower" : "upper") as CapitalSurface["layer"];
  const along = (a: XZ, b: XZ) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    return { dx: dx / length, dz: dz / length, length };
  };

  function surface(id: string, area: ParishArea, vertices: ParishPoint[]) {
    surfaces.push({ id, area, vertices, layer: layer(vertices[0][1]) });
  }
  function solid(position: ParishPoint, size: ParishPoint, yaw = 0) {
    solids.push({ position, size, yaw });
  }
  function piece(
    model: CapitalKitModel,
    size: ParishPoint,
    position: ParishPoint,
    yaw = 0,
    material: CapitalMaterial = "piece",
    thickness?: number,
    leaves?: boolean,
  ) {
    pieces.push({ model, size, position, yaw, material, thickness, leaves });
  }
  /** A walkable, convex floor slab. */
  function floor(
    id: string,
    area: ParishArea,
    outline: XZ[],
    y: number,
    o: {
      thickness?: number;
      material?: CapitalMaterial;
      render?: boolean;
      threshold?: boolean;
    } = {},
  ) {
    const vertices = outline.map(([x, z]): ParishPoint => [x, y, z]);
    surface(id, area, vertices);
    slabs.push({
      vertices,
      thickness: o.thickness ?? 0.6,
      material: o.material ?? "floor",
      render: o.render ?? true,
      threshold: o.threshold,
      collide: true,
    });
  }
  function rect(
    id: string,
    area: ParishArea,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y: number,
    o: {
      thickness?: number;
      material?: CapitalMaterial;
      render?: boolean;
      threshold?: boolean;
    } = {},
  ) {
    floor(
      id,
      area,
      [
        [x0, z0],
        [x0, z1],
        [x1, z1],
        [x1, z0],
      ],
      y,
      o,
    );
  }
  /** A closed, unwalkable masonry prism, such as a mountain core or foundation. */
  function mass(outline: XZ[], bottom: number, top: number, material: CapitalMaterial = "wall") {
    const vertices = outline.map(([x, z]): ParishPoint => [x, top, z]);
    slabs.push({
      vertices,
      thickness: top - bottom,
      material,
      render: true,
      collide: true,
      mass: true,
    });
    masses.push({ vertices, bottom });
  }
  /** A centred kit block with a matching collider. */
  function box(
    x: number,
    z: number,
    bottom: number,
    size: ParishPoint,
    yaw = 0,
    material: CapitalMaterial = "wall",
    collide = true,
  ) {
    piece("block", size, [x, bottom + size[1] / 2, z], yaw, material);
    if (collide) solid([x, bottom, z], size, yaw);
  }
  /** A kit piece standing on its base, with its footprint as a collider. */
  function prop(
    model: CapitalKitModel,
    size: ParishPoint,
    position: ParishPoint,
    yaw = 0,
    o: { material?: CapitalMaterial; collide?: boolean; thickness?: number } = {},
  ) {
    piece(model, size, position, yaw, o.material ?? "piece", o.thickness);
    if (o.collide ?? true) solid(position, size, yaw);
  }
  function pillar(
    x: number,
    z: number,
    bottom: number,
    height: number,
    side = 1.2,
    material: CapitalMaterial = "wall",
  ) {
    piece("pillar", [side, height, side], [x, bottom, z], 0, material);
    solid([x, bottom, z], [side, height, side]);
  }
  /**
   * A straight kit wall between two points, with framed openings. Each opening keeps
   * its clear width and height; jambs and lintel belong to its kit doorway frame.
   */
  function wall(
    a: XZ,
    b: XZ,
    bottom: number,
    top: number,
    o: { thickness?: number; material?: CapitalMaterial; openings?: CapitalOpening[] } = {},
  ) {
    const { dx, dz, length } = along(a, b);
    const thickness = o.thickness ?? 0.6,
      material = o.material ?? "wall",
      yaw = Math.atan2(-dz, dx);
    const at = (s: number, y: number): ParishPoint => [a[0] + dx * s, y, a[1] + dz * s];
    const run = (s0: number, s1: number, y0: number, y1: number, model: CapitalKitModel) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      piece(
        model,
        [s1 - s0, y1 - y0, thickness],
        at((s0 + s1) / 2, model === "block" ? (y0 + y1) / 2 : y0),
        yaw,
        material,
      );
      solid(at((s0 + s1) / 2, y0), [s1 - s0, y1 - y0, thickness], yaw);
    };
    // Openings that share a stretch of wall (a door beneath a gallery door) form one
    // column, filled between and beside them.
    const columns: Array<{ s0: number; s1: number; items: CapitalOpening[] }> = [];
    for (const opening of [...(o.openings ?? [])].sort((p, q) => p.at - q.at)) {
      const border = (opening.frame ?? "doorway") !== "none" ? BORDER : 0,
        s0 = opening.at - opening.width / 2 - border,
        s1 = opening.at + opening.width / 2 + border;
      const last = columns.at(-1);
      if (last && s0 < last.s1 - 0.01) {
        last.s0 = Math.min(last.s0, s0);
        last.s1 = Math.max(last.s1, s1);
        last.items.push(opening);
      } else columns.push({ s0, s1, items: [opening] });
    }
    let s = 0;
    for (const column of columns) {
      run(s, column.s0, bottom, top, "wall");
      let y = bottom;
      for (const opening of column.items.sort((p, q) => p.bottom - q.bottom)) {
        const framed = (opening.frame ?? "doorway") !== "none",
          border = framed ? BORDER : 0,
          s0 = opening.at - opening.width / 2 - border,
          s1 = opening.at + opening.width / 2 + border,
          head = opening.bottom + opening.height + border;
        run(column.s0, column.s1, y, opening.bottom, "block");
        run(column.s0, s0, opening.bottom, head, "block");
        run(s1, column.s1, opening.bottom, head, "block");
        y = head;
        if (framed) {
          piece(
            opening.frame === "door" || opening.frame === "double-door" ? opening.frame : "doorway",
            [opening.width + 2 * border, opening.height + border, thickness + 0.1],
            at(opening.at, opening.bottom),
            yaw,
            "piece",
            border,
          );
          for (const side of [-1, 1])
            solid(
              at(opening.at + side * (opening.width / 2 + border / 2), opening.bottom),
              [border, opening.height + border, thickness],
              yaw,
            );
          solid(
            at(opening.at, opening.bottom + opening.height),
            [opening.width, border, thickness],
            yaw,
          );
        }
        if (opening.area) {
          const half = opening.width / 2,
            across = thickness / 2 + 0.35,
            nx = -dz,
            nz = dx;
          const corner = (s: number, n: number): XZ => [
            a[0] + dx * (opening.at + s) + nx * n,
            a[1] + dz * (opening.at + s) + nz * n,
          ];
          floor(
            `${opening.id ?? `door:${doors.length}`}:threshold`,
            opening.area,
            [
              corner(-half, -across),
              corner(half, -across),
              corner(half, across),
              corner(-half, across),
            ],
            opening.bottom,
            { render: opening.visibleThreshold ?? false, thickness: 0.1, threshold: true },
          );
        }
        if (framed)
          doors.push({
            id: opening.id ?? `door:${doors.length}`,
            width: opening.width,
            height: opening.height,
            position: at(opening.at, opening.bottom),
          });
      }
      run(column.s0, column.s1, y, top, top - y > 0.4 ? "wall" : "block");
      s = column.s1;
    }
    run(s, length, bottom, top, "wall");
  }
  /** A closed loop of walls through the given corners. */
  function enclosure(
    corners: XZ[],
    bottom: number,
    top: number,
    o: {
      thickness?: number;
      material?: CapitalMaterial;
      openings?: Record<number, CapitalOpening[]>;
    } = {},
  ) {
    corners.forEach((p, i) =>
      wall(p, corners[(i + 1) % corners.length], bottom, top, {
        thickness: o.thickness,
        material: o.material,
        openings: o.openings?.[i],
      }),
    );
  }
  /**
   * A straight kit flight from `low`, climbing `rise` along `dir`. The kit treads sit
   * half a riser below the continuous ramp the capsule walks, so feet meet each tread.
   */
  function flight(
    id: string,
    area: ParishArea,
    low: ParishPoint,
    dir: XZ,
    rise: number,
    width: number,
    o: { material?: CapitalMaterial; fill?: number } = {},
  ): ParishPoint {
    const count = Math.max(1, Math.round(rise / 0.2)),
      step = rise / count,
      run = count * KIT_STEP_RUN;
    const [dx, dz] = dir,
      px = (-dz * width) / 2,
      pz = (dx * width) / 2;
    const high: ParishPoint = [low[0] + dx * run, low[1] + rise, low[2] + dz * run];
    piece(
      "stairs",
      [width, rise, run],
      [(low[0] + high[0]) / 2, low[1] - step / 2, (low[2] + high[2]) / 2],
      Math.atan2(-dx, -dz),
      o.material ?? "floor",
    );
    const vertices: ParishPoint[] = [
      [low[0] + px, low[1], low[2] + pz],
      [high[0] + px, high[1], high[2] + pz],
      [high[0] - px, high[1], high[2] - pz],
      [low[0] - px, low[1], low[2] - pz],
    ];
    surface(id, area, vertices);
    slabs.push({ vertices, thickness: 0.4, material: "floor", render: false, collide: true });
    // Stepped masonry closes the low space beneath a flight down to `fill`.
    if (o.fill !== undefined) {
      const steps = Math.max(1, Math.ceil(run / 2));
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps,
          top = low[1] + rise * (i / steps) - 0.25;
        if (top - o.fill < 0.2) continue;
        box(
          low[0] + dx * run * t,
          low[2] + dz * run * t,
          o.fill,
          [width, top - o.fill, run / steps],
          Math.atan2(-dz, dx) + Math.PI / 2,
          "wall",
        );
      }
    }
    routes.push({ id, kind: "stair", width });
    return high;
  }
  /**
   * A kit half-turn flight. `half` 0 sweeps the -Z half circle climbing from -X to +X;
   * `half` 1 is turned around, sweeping +Z from +X to -X. Returns both end centres.
   */
  function curvedFlight(
    id: string,
    area: ParishArea,
    center: ParishPoint,
    outer: number,
    rise: number,
    half: 0 | 1,
    material: CapitalMaterial = "floor",
  ) {
    const inner = outer * 0.45,
      yaw = half ? Math.PI : 0,
      count = Math.max(2, Math.round(rise / 0.15));
    piece(
      "curved-stairs",
      [outer * 2, rise, outer * 2],
      [center[0], center[1] - rise / count / 2, center[2]],
      yaw,
      material,
    );
    const point = (r: number, a: number): ParishPoint => {
      const x = r * Math.cos(a),
        z = -r * Math.sin(a);
      return [
        center[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
        center[1] + rise * (1 - a / Math.PI),
        center[2] - x * Math.sin(yaw) + z * Math.cos(yaw),
      ];
    };
    // Fine segments keep the triangulated helicoid within a few centimetres of the treads.
    const n = Math.max(12, Math.ceil(rise / 0.3));
    for (let i = 0; i < n; i++) {
      const a0 = (Math.PI * i) / n,
        a1 = (Math.PI * (i + 1)) / n;
      const vertices = [point(inner, a0), point(outer, a0), point(outer, a1), point(inner, a1)];
      surface(`${id}:${i}`, area, vertices);
      slabs.push({ vertices, thickness: 0.4, material: "floor", render: false, collide: true });
    }
    routes.push({ id, kind: "stair", width: outer - inner });
    const mid = (outer + inner) / 2;
    return { low: point(mid, Math.PI), high: point(mid, 0), inner, outer };
  }
  /**
   * A bridge deck from `a` to `b`. The kit walkway rails its long sides; the run-down
   * plank bridge has none; a slab bridge gets low kit parapets.
   */
  function bridge(
    id: string,
    area: ParishArea,
    a: XZ,
    b: XZ,
    y: number,
    width: number,
    o: {
      kind?: "walkway" | "wooden-bridge" | "slab";
      sides?: number;
      base?: number;
      material?: CapitalMaterial;
      rails?: [boolean, boolean];
    } = {},
  ) {
    const { dx, dz, length } = along(a, b);
    const yaw = Math.atan2(dx, dz),
      mid: XZ = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      kind = o.kind ?? "walkway",
      board = 0.15,
      sides = o.sides ?? 1.1;
    const side = (offset: number, s: number) =>
      [mid[0] + dz * offset + dx * s, mid[1] - dx * offset + dz * s] as const;
    const deck = (inner: number, render: boolean) =>
      floor(
        id,
        area,
        [
          side(inner / 2, -length / 2),
          side(inner / 2, length / 2),
          side(-inner / 2, length / 2),
          side(-inner / 2, -length / 2),
        ],
        y,
        { render, thickness: kind === "slab" ? 0.8 : 0.15, material: o.material ?? "floor" },
      );
    if (kind === "walkway") {
      piece("walkway", [width, sides, length], [mid[0], y - 0.15, mid[1]], yaw, "piece", board);
      deck(width - 2 * board, false);
      for (const s of [-1, 1]) {
        const [x, z] = side(s * (width / 2 - board / 2), 0);
        solid([x, y - 0.15, z], [board, sides, length], yaw);
      }
    } else if (kind === "wooden-bridge") {
      const base = o.base ?? y - 3;
      piece("wooden-bridge", [width, y - base, length], [mid[0], base, mid[1]], yaw, "timber");
      deck(width * 0.85, false);
    } else {
      deck(width, true);
      const rails = o.rails ?? [true, true];
      for (const s of [-1, 1]) {
        if (!rails[s < 0 ? 0 : 1]) continue;
        const p = side(s * (width / 2 + 0.2), -length / 2),
          q = side(s * (width / 2 + 0.2), length / 2);
        wall(p, q, y, y + sides, { thickness: 0.4, material: "trim" });
      }
    }
    const clear = kind === "walkway" ? width - 2 * board : width;
    routes.push({ id, kind: clear >= 4 ? "street" : "path", width: clear });
  }
  /** A covered kit hallway: floor, two walls and a ceiling, open at both ends. */
  function hallway(
    id: string,
    area: ParishArea,
    a: XZ,
    b: XZ,
    y: number,
    width: number,
    height: number,
  ) {
    const { dx, dz, length } = along(a, b);
    const yaw = Math.atan2(dx, dz),
      t = 0.2,
      mid: XZ = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    piece("hallway", [width, height, length], [mid[0], y - t, mid[1]], yaw, "wall", t);
    const side = (offset: number, s: number) =>
      [mid[0] + dz * offset + dx * s, mid[1] - dx * offset + dz * s] as const;
    const inner = width - 2 * t;
    floor(
      id,
      area,
      [
        side(inner / 2, -length / 2),
        side(inner / 2, length / 2),
        side(-inner / 2, length / 2),
        side(-inner / 2, -length / 2),
      ],
      y,
      { render: false, thickness: t },
    );
    for (const s of [-1, 1]) {
      const [x, z] = side(s * (width / 2 - t / 2), 0);
      solid([x, y, z], [t, height - 2 * t, length], yaw);
    }
    solid([mid[0], y - 2 * t + height, mid[1]], [width, t, length], yaw);
    routes.push({ id, kind: "path", width: inner, headroom: height - 2 * t });
  }
  /** A curved kit-panel walk between two radii, from angle a0 to a1 (radians from -Z). */
  function arc(
    id: string,
    area: ParishArea,
    cx: number,
    cz: number,
    inner: number,
    outer: number,
    a0: number,
    a1: number,
    y: number,
    segments: number,
    material: CapitalMaterial = "floor",
  ) {
    const p = (r: number, a: number) => [cx + Math.sin(a) * r, cz - Math.cos(a) * r] as const;
    for (let i = 0; i < segments; i++) {
      const s0 = a0 + ((a1 - a0) * i) / segments,
        s1 = a0 + ((a1 - a0) * (i + 1)) / segments;
      floor(`${id}:${i}`, area, [p(inner, s0), p(outer, s0), p(outer, s1), p(inner, s1)], y, {
        material,
        thickness: 1,
      });
    }
    routes.push({ id, kind: outer - inner >= 4 ? "street" : "path", width: outer - inner });
  }
  return {
    surfaces,
    solids,
    pieces,
    slabs,
    masses,
    doors,
    routes,
    rooms,
    surface,
    solid,
    piece,
    floor,
    rect,
    mass,
    box,
    prop,
    pillar,
    wall,
    enclosure,
    flight,
    curvedFlight,
    bridge,
    hallway,
    arc,
  };
}
export type CapitalBuilder = ReturnType<typeof createCapitalBuilder>;
