import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ParishPoint } from "./ashenParish.ts";

const CELL = 2;
const EXTENT = 200;
const SIZE = (EXTENT * 2) / CELL;

/**
 * The lowest architecture or walkable surface above each 2 m column. Rock is
 * decorative and has no collider, so it must stay beneath everything the
 * player can reach, with a side margin so crags never flank a walkway.
 *
 * Architecture reaching below `deepBelow` (the buried arena, shafts and piers that
 * stand on bedrock) is kept in a separate `deep` grid and walks below it in `low`, so
 * rock can close in around them instead of falling away in wide cones.
 */
export function capitalCeiling(
  objects: THREE.Object3D[],
  polygons: Array<{ vertices: ParishPoint[] }>,
  sideMargin = 5,
  deepBelow = -Infinity,
) {
  const raw = new Float32Array(SIZE * SIZE).fill(Infinity);
  const rawDeep = new Float32Array(SIZE * SIZE).fill(Infinity);
  const rawLow = new Float32Array(SIZE * SIZE).fill(Infinity);
  let below = rawDeep;
  const mark = (x: number, z: number, y: number) => {
    const cx = Math.floor((x + EXTENT) / CELL),
      cz = Math.floor((z + EXTENT) / CELL);
    if (cx < 0 || cz < 0 || cx >= SIZE || cz >= SIZE) return;
    const i = cz * SIZE + cx,
      grid = y < deepBelow ? below : raw;
    if (y < grid[i]) grid[i] = y;
  };
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const triangle = () => {
    const low = Math.min(a.y, b.y, c.y);
    // Edges catch walls and slivers; the interior fill catches broad floors.
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / (CELL / 2)) + 1;
      for (let s = 0; s <= steps; s++)
        mark(p.x + ((q.x - p.x) * s) / steps, p.z + ((q.z - p.z) * s) / steps, low);
    }
    const area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
    if (Math.abs(area) < 1e-6) return;
    const x0 = Math.floor((Math.min(a.x, b.x, c.x) + EXTENT) / CELL),
      x1 = Math.floor((Math.max(a.x, b.x, c.x) + EXTENT) / CELL),
      z0 = Math.floor((Math.min(a.z, b.z, c.z) + EXTENT) / CELL),
      z1 = Math.floor((Math.max(a.z, b.z, c.z) + EXTENT) / CELL);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        const x = (cx + 0.5) * CELL - EXTENT,
          z = (cz + 0.5) * CELL - EXTENT;
        const u = ((b.x - x) * (c.z - z) - (c.x - x) * (b.z - z)) / area,
          v = ((c.x - x) * (a.z - z) - (a.x - x) * (c.z - z)) / area;
        if (u >= 0 && v >= 0 && u + v <= 1) mark(x, z, low);
      }
  };
  for (const object of objects)
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.updateWorldMatrix(true, false);
      const position = o.geometry.getAttribute("position");
      const index = o.geometry.index;
      const count = index ? index.count : position.count;
      const at = (i: number) => (index ? index.getX(i) : i);
      for (let i = 0; i + 2 < count; i += 3) {
        a.fromBufferAttribute(position, at(i)).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(position, at(i + 1)).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(position, at(i + 2)).applyMatrix4(o.matrixWorld);
        triangle();
      }
    });
  below = rawLow;
  for (const { vertices } of polygons)
    for (let i = 1; i + 1 < vertices.length; i++) {
      a.set(...vertices[0]);
      b.set(...vertices[i]);
      c.set(...vertices[i + 1]);
      triangle();
    }
  // Separable square minimum: a conservative stand-in for a disk.
  const reach = Math.ceil(sideMargin / CELL);
  const widen = (raw: Float32Array) => {
    const rows = new Float32Array(raw.length);
    const out = new Float32Array(raw.length);
    for (let z = 0; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++) {
        let low = Infinity;
        for (let k = Math.max(0, x - reach); k <= Math.min(SIZE - 1, x + reach); k++)
          low = Math.min(low, raw[z * SIZE + k]);
        rows[z * SIZE + x] = low;
      }
    for (let z = 0; z < SIZE; z++)
      for (let x = 0; x < SIZE; x++) {
        let low = Infinity;
        for (let k = Math.max(0, z - reach); k <= Math.min(SIZE - 1, z + reach); k++)
          low = Math.min(low, rows[k * SIZE + x]);
        out[z * SIZE + x] = low;
      }
    return out;
  };
  const ceiling = widen(raw),
    deep = widen(rawDeep),
    low = widen(rawLow);
  /** Lowest architecture within `radius` of a column, beyond the side margin. */
  const lowest =
    (grid: Float32Array) =>
    (x: number, z: number, radius = 0) => {
      const x0 = Math.max(0, Math.floor((x - radius + EXTENT) / CELL)),
        x1 = Math.min(SIZE - 1, Math.floor((x + radius + EXTENT) / CELL)),
        z0 = Math.max(0, Math.floor((z - radius + EXTENT) / CELL)),
        z1 = Math.min(SIZE - 1, Math.floor((z + radius + EXTENT) / CELL));
      let low = Infinity;
      for (let cz = z0; cz <= z1; cz++)
        for (let cx = x0; cx <= x1; cx++) low = Math.min(low, grid[cz * SIZE + cx]);
      return low;
    };
  /**
   * The highest rock a column may reach when it must rise no faster than `rise(d)` away
   * from the architecture in `grid`: round, continuous cones rather than square steps.
   */
  const clearance =
    (grid: Float32Array, rise: (d: number) => number, radius: number) => (x: number, z: number) => {
      const gx = (x + EXTENT) / CELL - 0.5,
        gz = (z + EXTENT) / CELL - 0.5,
        n = radius / CELL;
      let low = Infinity;
      for (let cz = Math.max(0, Math.ceil(gz - n)); cz <= Math.min(SIZE - 1, gz + n); cz++)
        for (let cx = Math.max(0, Math.ceil(gx - n)); cx <= Math.min(SIZE - 1, gx + n); cx++) {
          const y = grid[cz * SIZE + cx];
          if (y === Infinity) continue;
          const d = Math.hypot(cx - gx, cz - gz) * CELL;
          if (d <= radius) low = Math.min(low, y + rise(d));
        }
      return low;
    };
  /** `deep` holds architecture reaching below `deepBelow`, `low` the walks down there. */
  return Object.assign(lowest(ceiling), {
    deep: lowest(deep),
    low: lowest(low),
    clearance: (rise: (d: number) => number, radius: number) => ({
      high: clearance(ceiling, rise, radius),
      low: clearance(low, rise, radius),
    }),
  });
}

type CapitalCeiling = ReturnType<typeof capitalCeiling>;

const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (x: number, z: number) => {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx),
    sz = fz * fz * (3 - 2 * fz);
  const top = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * sx;
  const bottom = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * sx;
  return top + (bottom - top) * sz;
};

/** Fractal noise from the smooth lattice above, 0–1. */
const fbm = (x: number, z: number, octaves: number) => {
  let sum = 0,
    amp = 0.5,
    f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * f + o * 17.3, z * f - o * 9.1);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / (1 - 0.5 ** octaves);
};

/** A height grid as one smooth-shaded mesh; cells under `floor` everywhere are dropped. */
function heightfield(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  step: number,
  height: (x: number, z: number) => number,
  floor: number,
) {
  const nx = Math.round((x1 - x0) / step) + 1,
    nz = Math.round((z1 - z0) / step) + 1;
  const positions = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step,
        z = z0 + j * step,
        k = (j * nx + i) * 3;
      positions[k] = x;
      positions[k + 1] = height(x, z);
      positions[k + 2] = z;
    }
  const indices: number[] = [];
  const y = (i: number, j: number) => positions[(j * nx + i) * 3 + 1];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      if (Math.max(y(i, j), y(i + 1, j), y(i, j + 1), y(i + 1, j + 1)) <= floor) continue;
      const a = j * nx + i,
        b = a + 1,
        c = a + nx,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/**
 * The mountain the city is carved into: a massif that towers over the citadel from
 * behind, wraps the east end of every tier in a sheer cliff and falls to a lower western
 * shoulder, so the white tiers read as cut into its south-west face. Every vertex stays
 * two metres beneath the lowest reachable architecture within the ceiling's side margin,
 * then climbs steeply away from it, so cuts read as gorges and cliffs, not walls.
 */
export function buildCapitalMountain(ceiling: CapitalCeiling) {
  const bump = (x: number, z: number, cx: number, cz: number, sx: number, sz: number) =>
    Math.exp(-((x - cx) ** 2 / (2 * sx * sx) + (z - cz) ** 2 / (2 * sz * sz)));
  // Allowed rise above nearby architecture: gentle beside walks, then cliff-steep.
  const rise = (d: number) =>
    d <= 8 ? 1.7 * d : d <= 14 ? 13.6 + 2.4 * (d - 8) : 28 + 2.8 * (d - 14);
  const reach = 32,
    open = ceiling.clearance(rise, reach),
    walks = ceiling.clearance(rise, 8);
  const g = heightfield(
    -200,
    240,
    -260,
    130,
    2,
    (x, z) => {
      const massif =
        128 * bump(x, z, 55, -95, 95, 80) +
        // The summit, right behind the white tower.
        45 * bump(x, z, 62, -70, 32, 30) +
        34 * bump(x, z, -70, -95, 55, 50) +
        58 * bump(x, z, 150, -5, 48, 60) +
        40 * bump(x, z, 10, -190, 120, 50) -
        34 -
        // The south-west stays open: the face sweeps forward only on the east.
        1.3 * Math.max(0, z + 25 - Math.max(0, x) * 0.95);
      const ridges = 1 - Math.abs(fbm(x / 34, z / 34, 4) * 2 - 1);
      const detail = fbm(x / 9 + 40, z / 9, 3);
      let h = massif + 22 * (ridges - 0.5) + 7 * (detail - 0.5);
      if (h <= -29.9) return -30;
      // Deep architecture only holds rock off itself, like a shaft cut in the cliff;
      // low walks keep a narrow clearing before it closes in.
      h = Math.min(h, ceiling.deep(x, z) - 2);
      h = Math.min(h, ceiling.low(x, z) - 2, walks.low(x, z) - 2);
      // Anything clear of all architecture within the reach skips the cone search.
      if (h <= ceiling(x, z, reach) - 2) return h;
      // Ridged noise only ever carves the cut faces down, so they break into crags.
      const crag = 1 - Math.abs(fbm(x / 13 - 7, z / 13 + 3, 3) * 2 - 1);
      h = Math.min(h, ceiling(x, z) - 2, open.high(x, z) - 2 - 14 * crag);
      return Math.max(-30, h);
    },
    -29.9,
  );
  // Large-scale colour the 4 m rock texture cannot carry: warm grey-brown stone with
  // ochre streaks running down the faces, darker in the clefts and paler on the heights.
  const position = g.getAttribute("position"),
    normal = g.getAttribute("normal"),
    colors = new Float32Array(position.count * 3);
  const grey = [1.08, 1.05, 1.0],
    ochre = [1.24, 1.08, 0.86],
    cleft = [0.72, 0.68, 0.64];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i),
      steep = 1 - normal.getY(i);
    const streak = Math.max(0, fbm(x / 22 + z / 31, y / 70, 3) - 0.5) * 2.4,
      cut = Math.max(0, 0.55 - fbm(x / 7, z / 7, 2)) * 1.6 * steep,
      lift = 0.9 + 0.12 * Math.min(1, Math.max(0, (y + 10) / 110));
    for (let c = 0; c < 3; c++) {
      const v = grey[c] + (ochre[c] - grey[c]) * Math.min(1, streak);
      colors[i * 3 + c] = (v + (cleft[c] - v) * Math.min(1, cut)) * lift;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * The plain the city stands on: flat ground just below the lowest tier's level, rolling
 * gently out to the horizon, never above architecture. Only where `sunken` allows does it
 * drop to hold off the walks beneath it; where `flush` asks it meets a walk on the plain.
 */
export function buildCapitalPlain(
  ceiling: CapitalCeiling,
  sunken: (x: number, z: number) => boolean = () => false,
  flush: (x: number, z: number) => boolean = () => false,
) {
  const g = heightfield(
    -440,
    440,
    -440,
    440,
    4,
    (x, z) => {
      const r = Math.hypot(x, z),
        t = Math.min(1, Math.max(0, (r - 200) / 160)),
        swell = (0.6 + 6 * t) * (fbm(x / 90, z / 90, 4) - 0.5) - 3 * t * t;
      if (Math.abs(x) >= 200 || Math.abs(z) >= 200) return -0.5 + swell;
      if (flush(x, z)) return Math.min(-0.03, ceiling(x, z) - 0.03);
      const near = sunken(x, z)
        ? Math.min(ceiling(x, z), ceiling.deep(x, z), ceiling.low(x, z)) - 2
        : ceiling(x, z) - 0.5;
      return Math.min(-0.5 + swell, near);
    },
    -60,
  );
  // Farmland like the Pelennor's: a patchwork of fields radiating from the city, edged
  // by darker hedgerows, with the gate road running out south across them.
  const position = g.getAttribute("position"),
    colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      z = position.getZ(i),
      r = Math.hypot(x, z),
      u = r / 30,
      v = (Math.atan2(x, -z) * 140) / 40,
      edge = Math.min(
        Math.min(u % 1, 1 - (u % 1)) * 30,
        Math.min(v - Math.floor(v), Math.ceil(v) - v) * 40 * (r / 140),
      ),
      tone =
        Math.abs(x) < 4.5 && z > 0
          ? CAPITAL_ROAD
          : edge < 2.4
            ? CAPITAL_HEDGEROW
            : CAPITAL_FIELDS[
                Math.floor(hash(Math.floor(u), Math.floor(v)) * CAPITAL_FIELDS.length)
              ],
      shade = 0.9 + 0.2 * fbm(x / 9, z / 9, 2);
    for (let c = 0; c < 3; c++) colors[i * 3 + c] = tone[c] * shade;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Field tones over the earth texture: meadow, young wheat, ripe wheat, fallow, pasture. */
const CAPITAL_FIELDS = [
  [1.15, 1.42, 0.8],
  [1.4, 1.38, 0.86],
  [1.75, 1.5, 0.98],
  [1.3, 1.08, 0.9],
  [1.0, 1.32, 0.76],
] as const;
const CAPITAL_HEDGEROW = [0.62, 0.86, 0.5] as const,
  CAPITAL_ROAD = [1.6, 1.55, 1.45] as const;
