import * as THREE from "three";
import type { ParishPoint } from "./ashenParish.ts";
import { GROUND } from "./capitalDistricts.ts";

/** Rock below this is hidden under the plain. */
const GROUND_ROCK = GROUND - 2;
/** The plain's level: just below the ground the walls and piers stand on. */
const PLAIN = GROUND - 0.05;

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
  /** Enclosed routes inside the mountain: rock may surround them, never cut through them. */
  buriedPolygons: Array<{ vertices: ParishPoint[] }> = [],
) {
  const raw = new Float32Array(SIZE * SIZE).fill(Infinity);
  const rawBuried = new Float32Array(SIZE * SIZE).fill(Infinity);
  const rawBuriedTop = new Float32Array(SIZE * SIZE).fill(-Infinity);
  let only: Float32Array | null = null;
  const rawDeep = new Float32Array(SIZE * SIZE).fill(Infinity);
  const rawLow = new Float32Array(SIZE * SIZE).fill(Infinity);
  let below = rawDeep;
  const mark = (x: number, z: number, y: number) => {
    const cx = Math.floor((x + EXTENT) / CELL),
      cz = Math.floor((z + EXTENT) / CELL);
    if (cx < 0 || cz < 0 || cx >= SIZE || cz >= SIZE) return;
    const i = cz * SIZE + cx,
      grid = only ?? (y < deepBelow ? below : raw);
    if (only && y > rawBuriedTop[i]) rawBuriedTop[i] = y;
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
  only = rawBuried;
  for (const { vertices } of buriedPolygons)
    for (let i = 1; i + 1 < vertices.length; i++) {
      a.set(...vertices[0]);
      b.set(...vertices[i]);
      c.set(...vertices[i + 1]);
      triangle();
    }
  only = null;
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
  const widenMax = (grid: Float32Array) => {
    const negated = grid.map((v) => -v);
    return widen(negated).map((v) => -v);
  };
  const ceiling = widen(raw),
    deep = widen(rawDeep),
    low = widen(rawLow),
    // One side margin reaches into the enclosures' thick walls, so any slope between a
    // lowered and a full-height column is hidden inside the masonry.
    buried = widen(rawBuried),
    buriedTop = widenMax(rawBuriedTop);
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
    /** The lowest enclosed (buried) floor over a column. */
    buried: lowest(buried),
    /** The highest enclosed floor over a column (−∞ where there is none). */
    buriedTop: (x: number, z: number) => {
      const cx = Math.floor((x + EXTENT) / CELL),
        cz = Math.floor((z + EXTENT) / CELL);
      return cx < 0 || cz < 0 || cx >= SIZE || cz >= SIZE ? -Infinity : buriedTop[cz * SIZE + cx];
    },
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
  softenPeaks = 0,
  /** A final per-vertex adjustment applied after softening. */
  post?: (x: number, z: number, y: number) => number,
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
  // Round narrow peaks created by intersecting clearance cuts. This filter only
  // lowers vertices, so smoothing cannot put rock back into a cleared walkway.
  for (let pass = 0; pass < softenPeaks; pass++) {
    const next = positions.slice();
    for (let j = 1; j < nz - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        let sum = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) sum += positions[((j + dz) * nx + i + dx) * 3 + 1];
        const k = (j * nx + i) * 3 + 1;
        next[k] = Math.min(positions[k], sum / 9);
      }
    positions.set(next);
  }
  if (post)
    for (let k = 0; k < positions.length; k += 3)
      positions[k + 1] = post(positions[k], positions[k + 2], positions[k + 1]);
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
 * The mountain the city is carved into: a broad, lumpy massif whose rounded crown rises
 * only a little above the citadel, wrapping the back of the city and both ends of every
 * tier, swelling forward into a great buttress east of the walls and falling to a lower
 * western shoulder, so the white tiers read as cut into its south face. Every vertex
 * stays two metres beneath the lowest reachable architecture within the ceiling's side
 * margin, then climbs steeply away from it, so cuts read as gorges and cliffs, not walls.
 */
export function buildCapitalMountain(ceiling: CapitalCeiling) {
  /** A rounded dome: flat-topped, steepening towards its rim, zero beyond it. */
  const dome = (x: number, z: number, cx: number, cz: number, rx: number, rz: number) => {
    const t = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
    return t >= 1 ? 0 : (1 - t ** 1.6) ** 0.6;
  };
  // Allowed rise above nearby architecture: gentle beside walks, then cliff-steep.
  const rise = (d: number) => (d <= 6 ? 2 * d : d <= 12 ? 12 + 4 * (d - 6) : 36 + 6 * (d - 12));
  const reach = 28,
    open = ceiling.clearance(rise, reach),
    walks = ceiling.clearance(rise, 8);
  /** Above an enclosed route rock clears its vault, or else stays under its floor. */
  const BURIED_VAULT = 6.5;
  const enclose = (x: number, z: number, h: number) => {
    const floor = ceiling.buried(x, z),
      top = ceiling.buriedTop(x, z);
    if (floor === Infinity || h <= floor - 2 || h >= top + BURIED_VAULT) return h;
    // A tall stack (the return stair tower) stands in its own rock shell: the mountain
    // stays under its lowest floor across the whole footprint. A single-level tunnel is
    // roofed over instead. Mixing the two would slope rock through the interior.
    const over = top + BURIED_VAULT;
    return top - floor < 10 && over <= ceiling(x, z) - 2 ? over : floor - 2;
  };
  const g = heightfield(-150, 150, -140, 160, 2, massifHeight, GROUND_ROCK + 0.1, 3, enclose);
  function massifHeight(x: number, z: number) {
    {
      // The sky city's rock: a central mountain under the plaza, a broad island under the
      // cathedral, garden and beacon arc, and a lower shelf beneath Up Town. Wall, bridges
      // and town stand clear of it on their own masonry, as in the reference's whitebox.
      const core = 34 * dome(x, z, 0, 2, 34, 34);
      const island = 42 * dome(x, z, 6, 74, 104, 62) + 10 * dome(x, z, 70, 58, 46, 52);
      const shelf = 18 * dome(x, z, -60, -30, 46, 52);
      const massif = Math.max(core, island, shelf) - 12;
      const warpX = 9 * (noise(x / 35 + 3, z / 35 - 5) - 0.5),
        warpZ = 9 * (noise(x / 35 - 11, z / 35 + 7) - 0.5),
        u = x + warpX,
        v = z + warpZ;
      const bulges = noise(u / 18 + 3, v / 22 - 5),
        ridges = 1 - Math.abs(noise(u / 9 - 7, v / 13 + 3) * 2 - 1),
        detail = fbm(u / 5 + 40, v / 5, 3),
        relief = 24 * (bulges - 0.5) + 22 * (ridges * ridges - 0.4) + 8 * (detail - 0.5);
      let h = massif + Math.min(1, Math.max(0, (massif + 12) / 24)) * relief;
      // Strata: each 9 m band of rock steps back at its top, so faces read as layered
      // cliffs with ledges. This only lowers rock, so clearances below stay intact.
      if (h > 0) {
        const band = (h + 3) / 9 - Math.floor((h + 3) / 9);
        h -= 3.4 * Math.max(0, (band - 0.62) / 0.38) ** 2 * Math.min(1, h / 20);
      }
      if (h <= GROUND_ROCK + 0.1) return GROUND_ROCK;
      // Deep architecture only holds rock off itself, like a shaft cut in the cliff;
      // low walks keep a narrow clearing before it closes in.
      h = Math.min(h, ceiling.deep(x, z) - 2);
      h = Math.min(h, ceiling.low(x, z) - 2, walks.low(x, z) - 2);
      // Anything clear of all architecture within the reach skips the cone search.
      if (h <= ceiling(x, z, reach) - 2) return h;
      // Ridged noise only ever carves the cut faces down, so they break into crags.
      // Carry the same relief through the cut slopes. Only carving down keeps every
      // crag inside the clearance envelope while breaking up the otherwise smooth cone.
      const cleft = 26 * (1 - bulges) + 18 * (1 - ridges) ** 2;
      h = Math.min(h, ceiling(x, z) - 2, open.high(x, z) - 2 - cleft);
      return Math.max(GROUND_ROCK, h);
    }
  }
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
      if (Math.abs(x) >= 200 || Math.abs(z) >= 200) return PLAIN + swell;
      // Flush ground meets the walk; only architecture standing in this very column
      // (not the side margin) may press it lower, so the grass stays under the feet.
      // The apron is walked on the ground itself, so it stays exactly underfoot. Walls,
      // bastions and paving standing in it reach below and simply hide the ground there.
      if (flush(x, z)) return GROUND + 0.47;
      const near = sunken(x, z)
        ? Math.min(ceiling(x, z), ceiling.deep(x, z), ceiling.low(x, z)) - 2
        : ceiling(x, z) - 0.5;
      return Math.min(PLAIN + swell, near);
    },
    PLAIN - 60,
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
        edge < 2.4
          ? CAPITAL_HEDGEROW
          : CAPITAL_FIELDS[Math.floor(hash(Math.floor(u), Math.floor(v)) * CAPITAL_FIELDS.length)],
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
const CAPITAL_HEDGEROW = [0.62, 0.86, 0.5] as const;
