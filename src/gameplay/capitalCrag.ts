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
 */
export function capitalCeiling(
  objects: THREE.Object3D[],
  polygons: Array<{ vertices: ParishPoint[] }>,
  sideMargin = 5,
) {
  const raw = new Float32Array(SIZE * SIZE).fill(Infinity);
  const mark = (x: number, z: number, y: number) => {
    const cx = Math.floor((x + EXTENT) / CELL),
      cz = Math.floor((z + EXTENT) / CELL);
    if (cx < 0 || cz < 0 || cx >= SIZE || cz >= SIZE) return;
    const i = cz * SIZE + cx;
    if (y < raw[i]) raw[i] = y;
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
  for (const { vertices } of polygons)
    for (let i = 1; i + 1 < vertices.length; i++) {
      a.set(...vertices[0]);
      b.set(...vertices[i]);
      c.set(...vertices[i + 1]);
      triangle();
    }
  // Separable square minimum: a conservative stand-in for a disk.
  const reach = Math.ceil(sideMargin / CELL);
  const rows = new Float32Array(raw.length);
  const ceiling = new Float32Array(raw.length);
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
      ceiling[z * SIZE + x] = low;
    }
  /** Lowest architecture within `radius` of a column, beyond the side margin. */
  return (x: number, z: number, radius = 0) => {
    const x0 = Math.max(0, Math.floor((x - radius + EXTENT) / CELL)),
      x1 = Math.min(SIZE - 1, Math.floor((x + radius + EXTENT) / CELL)),
      z0 = Math.max(0, Math.floor((z - radius + EXTENT) / CELL)),
      z1 = Math.min(SIZE - 1, Math.floor((z + radius + EXTENT) / CELL));
    let low = Infinity;
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) low = Math.min(low, ceiling[cz * SIZE + cx]);
    return low;
  };
}

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

/** Normalized distance inside the mountain footprint: 0 at its heart, 1 at its rim. */
export function capitalCragReach(x: number, z: number) {
  // The reference map wraps crags around the cathedral and western backyard
  // and leaves the southern curtain and its exposed bridges over open fog.
  const dx = (x - 2) / 98,
    dz = (z + 38) / (z < -38 ? 82 : 70);
  const wobble = 0.12 * (noise(x / 23 + 7, z / 23) - 0.5);
  return Math.hypot(dx, dz) + wobble;
}

/**
 * One craggy mountain beneath the capital. Each jagged prism is clamped below
 * the reachable architecture above it; toward the rim the peaks fall into fog.
 */
export function buildCapitalCrag(ceiling: (x: number, z: number, radius?: number) => number) {
  const parts: THREE.BufferGeometry[] = [];
  const spacing = 5.5;
  for (let gz = -130; gz <= 50; gz += spacing)
    for (let gx = -110; gx <= 110; gx += spacing) {
      const x = gx + (hash(gx, gz) - 0.5) * 3,
        z = gz + (hash(gz, gx) - 0.5) * 3;
      const reach = capitalCragReach(x, z);
      if (reach > 1) continue;
      const radius = 3.6 + hash(x * 0.3, z) * 2.4;
      const peak =
        12 + 22 * noise(x / 17, z / 17) + 8 * noise(x / 6 + 3, z / 6) - (4 * Math.abs(x)) / 110;
      const rim = THREE.MathUtils.smoothstep(reach, 0.62, 1);
      const designed = THREE.MathUtils.lerp(peak, -34, rim);
      // Two metres of clear air beneath the lowest reachable architecture.
      const top = Math.min(designed, ceiling(x, z, radius * 1.3) - 2);
      const bottom = -48 - 26 * (1 - reach * reach) + hash(x, z * 0.7) * 6;
      if (top - bottom < 4 || top < -32) continue;
      const height = top - bottom;
      const segments = 5 + Math.floor(hash(z, x * 0.5) * 3);
      const rings = 4;
      const g = new THREE.CylinderGeometry(
        radius * 0.7,
        radius * 1.3,
        height,
        segments,
        rings,
        false,
        hash(x, z) * Math.PI * 2,
      );
      const position = g.getAttribute("position");
      // A sloping fracture across the top and a lean through the rings turn
      // each prism into a weathered crag rather than a basalt column.
      const slope = hash(x * 0.9, z * 1.1) * Math.PI * 2;
      const leanX = (hash(x, z * 1.9) - 0.5) * 2.4,
        leanZ = (hash(x * 1.9, z) - 0.5) * 2.4;
      for (let i = 0; i < position.count; i++) {
        const px = position.getX(i),
          py = position.getY(i),
          pz = position.getZ(i);
        const n = hash(px * 1.7 + x, pz * 1.3 + z + py);
        const scale = 0.68 + 0.64 * n;
        const t = py / height + 0.5;
        const atTop = py > height / 2 - 0.01;
        // Top vertices only drop, so a crag never exceeds its clamped height.
        const fracture =
          ((Math.cos(slope) * px + Math.sin(slope) * pz) / radius + 1) * radius * 0.35;
        position.setXYZ(
          i,
          px * scale + leanX * t,
          atTop ? py - fracture - n * 1.2 : py + (n - 0.5) * (height / rings) * 0.5,
          pz * scale + leanZ * t,
        );
      }
      g.translate(x, (top + bottom) / 2, z);
      parts.push(g.toNonIndexed());
      g.dispose();
      // A fractured boulder sits on most crags; its highest point is the crag top.
      if (hash(z * 1.3, x) < 0.55) {
        const size = radius * (0.45 + hash(x, z * 2.3) * 0.35);
        const boulder = new THREE.DodecahedronGeometry(size, 0);
        boulder.rotateY(hash(z, x * 2.1) * 6);
        boulder.rotateX(hash(x * 2.1, z) * 6);
        boulder.scale(1.15, 0.7, 1);
        boulder.computeBoundingBox();
        const lift = top - boulder.boundingBox!.max.y - radius * 0.35;
        boulder.translate(x + leanX, lift, z + leanZ);
        // Polyhedra are already non-indexed.
        parts.push(boulder);
      }
    }
  const crag = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  crag.computeVertexNormals();
  return crag;
}
