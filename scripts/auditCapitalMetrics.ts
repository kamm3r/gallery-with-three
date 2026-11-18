import {
  CAPITAL_METRICS as metrics,
  capitalPlayerProfile,
  capitalControllerTuning,
} from "../src/gameplay/capitalMetrics.ts";
import { ROLL_DURATION, ROLL_FALLOFF } from "../src/gameplay/playerRules.ts";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { buildCapitalEnvironment } from "../src/gameplay/capitalEnvironment.ts";
import {
  capitalLevel,
  capitalSurfaces,
  capitalSurfaceHeight,
} from "../src/gameplay/capitalLayout.ts";

/** The route record a surface belongs to: its id, or the id before a segment suffix. */
const routeOf = (id: string) =>
  capitalLevel.routes.find((r) => id === r.id || id.startsWith(r.id + ":"));
const capitalRailSurfaces = capitalSurfaces;

/** Run: node --experimental-strip-types scripts/auditCapitalMetrics.ts
 * Audits room/door records, the live movement profile, and sampled clearance
 * against the metre grid. A nonzero exit code means a measured violation.
 * The geometric sampling is not an exhaustive proof of every point on a route.
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
const reach = (x: number, y: number, z: number, dx: number, dz: number, target: number) => {
  let px = x,
    py = y,
    pz = z,
    distance = 0;
  while (distance < target / 2) {
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
  const route = routeOf(s.id),
    flight = route?.kind === "stair";
  const targetWidth = route?.kind === "street" ? metrics.streetWidth : metrics.pathWidth;
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let width = { clear: -Infinity, at: "", limit: "" };
  const samples: number[][] = [
    [
      s.vertices.reduce((n, p) => n + p[0], 0) / s.vertices.length,
      s.vertices.reduce((n, p) => n + p[2], 0) / s.vertices.length,
    ],
  ];
  for (let x = x0 + 0.2; x <= x1 - 0.2; x += Math.max(0.4, (x1 - x0) / 14))
    for (let z = z0 + 0.2; z <= z1 - 0.2; z += Math.max(0.4, (z1 - z0) / 14)) samples.push([x, z]);
  for (const [x, z] of samples) {
    const y = capitalSurfaceHeight(s, x, z);
    if (y === null || !standable(x, y, z)) continue;
    const at = [x, y, z].map((n) => n.toFixed(1)).join(",");
    // Start above foot-level overlays such as paving bands and thresholds.
    const up = cast({ x, y: y + 0.4, z }, { x: 0, y: 1, z: 0 });
    const clear = up ? up.distance + 0.4 : Infinity;
    // The nave side aisles include the stair underpass; the central hall is five metres.
    // Doorway lintels sit lower than the hall they open into.
    const inDoorway = capitalLevel.doors.some(
      (d) => Math.hypot(d.position[0] - x, d.position[2] - z) < d.width / 2 + 1.2,
    );
    const highHall =
      !inDoorway &&
      (s.id === "chapel" ||
        s.id === "apse" ||
        s.id === "colosseum" ||
        (s.id === "nave" && Math.abs(x) < 8));
    const required = flight
      ? metrics.stairHeight
      : highHall
        ? metrics.highHallHeight
        : metrics.hallwayHeight;
    if (clear < required - 0.01)
      report.push(
        `headroom ${clear.toFixed(2)} m < ${required} m on ${s.id} at ${at}: ${up?.triangle ?? ""}`,
      );
    // Once the required disk fits, further width queries cannot change the verdict.
    // Lift pads are bounded by the moving deck, which carries the walk across.
    if (width.clear >= targetWidth || s.id.includes("lift-pad")) continue;
    // Inscribed width: a path is as wide as its widest clear disk.
    let narrowest = { distance: Infinity, limit: "" };
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const r = reach(x, y, z, Math.cos(a), Math.sin(a), targetWidth);
      if (r.distance < narrowest.distance) narrowest = r;
    }
    if (2 * narrowest.distance > width.clear)
      width = { clear: 2 * narrowest.distance, at, limit: narrowest.limit };
  }
  if (width.clear >= 0 && width.clear < targetWidth)
    report.push(
      `width ${width.clear.toFixed(2)} m < ${targetWidth} m on ${s.id} at ${width.at}: ${width.limit}`,
    );
}
for (const d of capitalLevel.doors)
  if (d.width < metrics.doorWidth || d.height < metrics.doorHeight)
    report.push(`door ${d.width} x ${d.height} m at ${d.id}`);
for (const r of capitalLevel.rooms)
  if (Math.min(r.width, r.depth) < metrics.roomSize || r.height < metrics.hallwayHeight)
    report.push(`room ${r.id}: ${r.width} x ${r.depth} x ${r.height} m`);
for (const [name, actual, expected] of [
  ["standing height", capitalPlayerProfile.height, metrics.playerHeight],
  ["crouch height", capitalPlayerProfile.crouchHeight, metrics.crouchHeight],
] as const)
  if (Math.abs(actual - expected) > 0.001) report.push(`${name}: ${actual} instead of ${expected}`);
// Movement may be faster than the chart's pacing minimums, never slower.
for (const [name, actual, minimum] of [
  ["walk speed", capitalControllerTuning.walkSpeed, metrics.walkSpeed],
  ["sprint speed", capitalControllerTuning.runSpeed, metrics.runSpeed],
  [
    "roll distance",
    capitalPlayerProfile.rollSpeed * ROLL_DURATION * (1 - ROLL_FALLOFF / 2),
    metrics.rollDistance,
  ],
] as const)
  if (actual < minimum) report.push(`${name}: ${actual} is below ${minimum}`);
console.log(
  report.length
    ? report.join("\n")
    : `Reference metric audit passes (${capitalSurfaces.length} surfaces, ${capitalLevel.doors.length} doors, ${capitalLevel.rooms.length} rooms, capital movement profile).`,
);
process.exitCode = report.length ? 1 : 0;
world.free();
environment.dispose();
