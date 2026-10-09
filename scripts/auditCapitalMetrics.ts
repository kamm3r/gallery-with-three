import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { isCapitalStair } from "../src/gameplay/capitalReferenceDetails.ts";
import { buildCapitalEnvironment } from "../src/gameplay/capitalEnvironment.ts";
import {
  capitalBuildings,
  capitalRailSurfaces,
  capitalSurfaceHeight,
} from "../src/gameplay/capitalLayout.ts";

/** Run from the repository root:
 * node --experimental-strip-types scripts/auditCapitalMetrics.ts
 * Measures the rendered capital against the reference blockout metrics for the
 * 1.84 m capsule: 3 m hallway and 4 m stair headroom, 1.5 m paths and 2 x 3.5 m
 * doors. Only points where the capsule can stand are measured; each failure
 * names the triangle that limits it. Sampling is advisory: it does not certify
 * the chart's room sizes, street widths, stair widths or movement speeds.
 */
type Point = { x: number; y: number; z: number };

await RAPIER.init();
const environment = buildCapitalEnvironment(false);
environment.root.updateMatrixWorld(true);
const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
const meshes = new Map<number, { vertices: Float32Array; indices: Uint32Array }>();
const v = new THREE.Vector3();
environment.root.traverse((o) => {
  if (!(o instanceof THREE.Mesh)) return;
  const position = o.geometry.getAttribute("position");
  const vertices = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++)
    vertices.set(v.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld).toArray(), i * 3);
  const indices = o.geometry.index
    ? new Uint32Array(o.geometry.index.array)
    : Uint32Array.from({ length: position.count }, (_, i) => i);
  meshes.set(world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices)).handle, {
    vertices,
    indices,
  });
});
world.step();

// castRay can skip a thin tube's nearest face on these trimeshes, so every
// query uses the normal variant. Parry reports a back face as an id past the
// triangle count.
const cast = (from: Point, direction: Point, length = 30) => {
  const hit = world.castRayAndGetNormal(new RAPIER.Ray(from, direction), length, true);
  if (!hit) return null;
  const mesh = meshes.get(hit.collider.handle)!;
  const count = mesh.indices.length / 3;
  const triangle = hit.featureId! % count;
  return {
    distance: hit.timeOfImpact,
    back: hit.featureId! >= count,
    get triangle() {
      return [0, 1, 2]
        .map((k) => {
          const i = mesh.indices[triangle * 3 + k] * 3;
          return Array.from(mesh.vertices.slice(i, i + 3), (n) => n.toFixed(2)).join(",");
        })
        .join(" | ");
    },
  };
};

const cell = 8;
const buckets = new Map<string, typeof capitalRailSurfaces>();
for (const s of capitalRailSurfaces) {
  const xs = s.vertices.map((p) => p[0]),
    zs = s.vertices.map((p) => p[2]);
  for (let x = Math.floor(Math.min(...xs) / cell); x <= Math.floor(Math.max(...xs) / cell); x++)
    for (let z = Math.floor(Math.min(...zs) / cell); z <= Math.floor(Math.max(...zs) / cell); z++)
      buckets.set(`${x},${z}`, [...(buckets.get(`${x},${z}`) ?? []), s]);
}
/** The walkable height nearest y, within a climbable step. */
const floorNear = (x: number, z: number, y: number) => {
  let best: number | null = null;
  for (const s of buckets.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []) {
    const h = capitalSurfaceHeight(s, x, z);
    if (
      h !== null &&
      Math.abs(h - y) <= 0.65 &&
      (best === null || Math.abs(h - y) < Math.abs(best - y))
    )
      best = h;
  }
  return best;
};
/** Clear walking distance until the floor ends or a wall rises at knee or head height. */
const reach = (x: number, y: number, z: number, dx: number, dz: number) => {
  let px = x,
    py = y,
    pz = z,
    distance = 0;
  while (distance < 0.75) {
    const nx = px + dx * 0.25,
      nz = pz + dz * 0.25;
    const ny = floorNear(nx, nz, py);
    if (ny === null) return { distance, limit: "floor ends" };
    for (const head of [0.9, 1.7]) {
      const from = { x: px, y: py + head, z: pz };
      const to = new THREE.Vector3(nx - px, ny - py, nz - pz);
      const hit = cast(from, to.clone().normalize(), to.length());
      if (hit) return { distance, limit: hit.triangle };
    }
    [px, py, pz] = [nx, ny, nz];
    distance += 0.25;
  }
  return { distance, limit: "open" };
};
/** The capsule fits here: nothing within its radius, and not inside a closed solid. */
const standable = (x: number, y: number, z: number) => {
  // Solid records use their base height, with yaw in the horizontal plane.
  // Overlapping decoration makes back-face ray counts unreliable inside them.
  for (const s of environment.solids) {
    const dx = x - s.position[0],
      dz = z - s.position[2];
    const localX = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw);
    const localZ = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
    if (
      y + 1.84 > s.position[1] &&
      y < s.position[1] + s.size[1] &&
      Math.abs(localX) < s.size[0] / 2 + 0.42 &&
      Math.abs(localZ) < s.size[2] / 2 + 0.42
    )
      return false;
  }
  const above = cast({ x, y: y + 0.4, z }, { x: 0, y: 1, z: 0 }, 1.44);
  if (above) return false;
  for (const h of [0.35, 1, 1.7]) {
    let back = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const hit = cast({ x, y: y + h, z }, { x: Math.cos(a), y: 0, z: Math.sin(a) });
      if (hit && hit.distance < 0.45) return false;
      if (hit?.back) back++;
    }
    if (back >= 6) return false;
  }
  return true;
};

const report: string[] = [];
for (const s of capitalRailSurfaces) {
  const xs = s.vertices.map((p) => p[0]),
    zs = s.vertices.map((p) => p[2]);
  const flight = isCapitalStair(s);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let headroom = { clear: Infinity, at: "", limit: "" };
  let width = { clear: -Infinity, at: "", limit: "" };
  for (let x = x0 + 0.2; x <= x1 - 0.2; x += Math.max(0.4, (x1 - x0) / 14))
    for (let z = z0 + 0.2; z <= z1 - 0.2; z += Math.max(0.4, (z1 - z0) / 14)) {
      const y = capitalSurfaceHeight(s, x, z);
      if (y === null || !standable(x, y, z)) continue;
      const at = [x, y, z].map((n) => n.toFixed(1)).join(",");
      // Start above foot-level overlays such as paving bands and thresholds.
      const up = cast({ x, y: y + 0.4, z }, { x: 0, y: 1, z: 0 });
      const clear = up ? up.distance + 0.4 : Infinity;
      if (clear < headroom.clear) headroom = { clear, at, limit: up?.triangle ?? "" };
      // Once a 1.5-metre disk fits, further width queries cannot change the verdict.
      if (width.clear >= 1.5) continue;
      // Inscribed width: a path is as wide as its widest clear disk.
      let narrowest = { distance: Infinity, limit: "" };
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8;
        const r = reach(x, y, z, Math.cos(a), Math.sin(a));
        if (r.distance < narrowest.distance) narrowest = r;
      }
      if (2 * narrowest.distance > width.clear)
        width = { clear: 2 * narrowest.distance, at, limit: narrowest.limit };
    }
  if (headroom.clear < (flight ? 4 : 3) - 0.01)
    report.push(
      `headroom ${headroom.clear.toFixed(2)} m on ${s.id} at ${headroom.at}: ${headroom.limit}`,
    );
  if (width.clear >= 0 && width.clear < 1.5)
    report.push(`width ${width.clear.toFixed(2)} m on ${s.id} at ${width.at}: ${width.limit}`);
}
for (const b of capitalBuildings)
  for (const d of b.doors)
    if (d.width < 2 || d.height < 3.5)
      report.push(`door ${d.width} x ${d.height} m on ${b.id} ${d.side}`);
console.log(
  report.length ? report.join("\n") : "No sampled headroom, path-width or door-size violations.",
);
world.free();
environment.dispose();
