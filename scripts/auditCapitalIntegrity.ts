import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { buildCapitalEnvironment } from "../src/gameplay/capitalEnvironment.ts";
import {
  capitalSurfaces,
  capitalSurfaceHeight,
  capitalBlocked,
} from "../src/gameplay/capitalLayout.ts";

/** Sample authored floors and seams against the actual floor collider and visible meshes.
 * Run with: vp exec node --experimental-strip-types scripts/auditCapitalIntegrity.ts
 * Lift shafts and exterior voids are not floors and are intentionally excluded.
 * This checks sampled coverage, not watertightness of every decorative mesh.
 */
await RAPIER.init();
const environment = buildCapitalEnvironment(false);
const physics = new RAPIER.World({ x: 0, y: 0, z: 0 });
const visual = new RAPIER.World({ x: 0, y: 0, z: 0 });
for (const c of environment.colliders)
  physics.createCollider(
    RAPIER.ColliderDesc.trimesh(c.vertices, c.indices)
      .setTranslation(...c.position)
      .setRotation({ x: 0, y: Math.sin(c.yaw / 2), z: 0, w: Math.cos(c.yaw / 2) }),
  );
environment.root.updateMatrixWorld(true);
const vector = new THREE.Vector3();
environment.root.traverse((object) => {
  if (!(object instanceof THREE.Mesh) || !object.visible) return;
  const positions = object.geometry.getAttribute("position");
  const vertices = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++)
    vertices.set(
      vector.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).toArray(),
      i * 3,
    );
  const indices = object.geometry.index
    ? new Uint32Array(object.geometry.index.array)
    : Uint32Array.from({ length: positions.count }, (_, i) => i);
  visual.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
});
physics.step();
visual.step();
const downward = { x: 0, y: -1, z: 0 };
const floorGeometry = new THREE.BufferGeometry();
floorGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(environment.colliders[0].vertices, 3),
);
floorGeometry.setIndex(new THREE.BufferAttribute(environment.colliders[0].indices, 1));
const probeMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const floorMesh = new THREE.Mesh(floorGeometry, probeMaterial);
floorMesh.updateMatrixWorld(true);
const raycaster = new THREE.Raycaster();
raycaster.ray.direction.set(0, -1, 0);
raycaster.near = 0;
raycaster.far = 1.3;
let rayFallbacks = 0;
const failures = new Map<
  string,
  { kind: string; surface: string; count: number; examples: number[][] }
>();
let samples = 0;
let obstructedSamples = 0;
function check(surface: string, x: number, y: number, z: number) {
  if (capitalBlocked(x, y, z, 0)) {
    obstructedSamples++;
    return;
  }
  samples++;
  const physicalHit = physics.castRayAndGetNormal(
    new RAPIER.Ray({ x, y: y + 0.65, z }, downward),
    0.75,
    false,
  );
  const visualHit = visual.castRayAndGetNormal(
    new RAPIER.Ray({ x, y: y + 0.65, z }, downward),
    1.3,
    false,
  );
  let physicalValid = physicalHit !== null && physicalHit.timeOfImpact <= 0.675;
  let visualValid = visualHit !== null;
  raycaster.ray.origin.set(x, y + 0.65, z);
  if (!physicalValid) {
    const hit = raycaster.intersectObject(floorMesh, false)[0];
    physicalValid = !!hit && hit.distance <= 0.675;
    if (physicalValid) rayFallbacks++;
  }
  if (!visualValid) visualValid = raycaster.intersectObject(environment.root, true).length > 0;
  for (const [kind, valid] of [
    ["missing collision floor", physicalValid],
    ["missing visible floor", visualValid],
  ] as const) {
    if (valid) continue;
    const key = `${kind}:${surface}`;
    const failure = failures.get(key) ?? { kind, surface, count: 0, examples: [] };
    failure.count++;
    if (failure.examples.length < 5) failure.examples.push([x, y, z].map((n) => +n.toFixed(3)));
    failures.set(key, failure);
  }
}
for (const surface of capitalSurfaces) {
  const points = surface.vertices;
  const cx = points.reduce((n, p) => n + p[0], 0) / points.length;
  const cz = points.reduce((n, p) => n + p[2], 0) / points.length;
  const sample = (x: number, z: number) => {
    const y = capitalSurfaceHeight(surface, x, z);
    if (y !== null) check(surface.id, x, y, z);
  };
  sample(cx, cz);
  // Probe just inside every edge, including tiny threshold panels and corners.
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.25));
    for (let k = 0; k <= steps; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / steps;
      const z = a[2] + ((b[2] - a[2]) * k) / steps;
      const distance = Math.hypot(cx - x, cz - z);
      const inset = Math.min(0.02 / Math.max(distance, 0.001), 0.1);
      sample(x + (cx - x) * inset, z + (cz - z) * inset);
    }
  }
  // Sample each triangle with barycentric coordinates, keeping points strictly inside.
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[0], points[i], points[i + 1]];
    const steps = Math.max(
      2,
      Math.ceil(
        Math.max(
          Math.hypot(b[0] - a[0], b[2] - a[2]),
          Math.hypot(c[0] - a[0], c[2] - a[2]),
          Math.hypot(c[0] - b[0], c[2] - b[2]),
        ) / 0.5,
      ),
    );
    for (let j = 1; j < steps; j++)
      for (let k = 1; j + k < steps; k++) {
        const u = j / steps,
          v = k / steps;
        sample(a[0] * (1 - u - v) + b[0] * u + c[0] * v, a[2] * (1 - u - v) + b[2] * u + c[2] * v);
      }
  }
}
// Confirm representative flagged seams with the same capsule/controller setup as route tests.
for (const solid of environment.solids)
  physics.createCollider(
    RAPIER.ColliderDesc.cuboid(...(solid.size.map((n) => n / 2) as [number, number, number]))
      .setTranslation(solid.position[0], solid.position[1] + solid.size[1] / 2, solid.position[2])
      .setRotation({ x: 0, y: Math.sin(solid.yaw / 2), z: 0, w: Math.cos(solid.yaw / 2) }),
  );
const capsuleChecks: Array<{
  surface: string;
  expectedY: number;
  actualY: number;
  supported: boolean;
}> = [];
const supportProbes = new Map(
  [...failures.values()].map((failure) => [failure.surface, failure.examples[0]]),
);
// Keep auditing repaired thresholds after their missing-mesh findings disappear.
for (const id of [
  "backyard-below-door",
  "great-gate",
  "gallery-west-door",
  "colosseum-gate",
  "colosseum-lift",
]) {
  const surface = capitalSurfaces.find((s) => s.id === `${id}:threshold`)!;
  supportProbes.set(
    surface.id,
    [0, 1, 2].map(
      (axis) =>
        surface.vertices.reduce((sum, point) => sum + point[axis], 0) / surface.vertices.length,
    ),
  );
}
for (const [surface, [x, y, z]] of supportProbes) {
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + 0.95, z),
  );
  const capsule = physics.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.42), body);
  const controller = physics.createCharacterController(0.03);
  controller.enableSnapToGround(0.5);
  physics.step();
  for (let i = 0; i < 60; i++) {
    controller.computeColliderMovement(
      capsule,
      { x: 0, y: -0.06, z: 0 },
      undefined,
      undefined,
      (other) => other.handle !== capsule.handle,
    );
    const position = body.translation(),
      movement = controller.computedMovement();
    body.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });
    physics.step();
  }
  const actualY = body.translation().y - 0.95;
  capsuleChecks.push({
    surface,
    expectedY: y,
    actualY,
    supported: Math.abs(actualY - y) < 0.1,
  });
  physics.removeCharacterController(controller);
  physics.removeRigidBody(body);
}
console.log(
  JSON.stringify(
    {
      surfaces: capitalSurfaces.length,
      samples,
      obstructedSamples,
      rayFallbacks,
      gridSpacing: 0.5,
      edgeSpacing: 0.25,
      edgeInset: 0.02,
      failures: [...failures.values()],
      capsuleChecks,
    },
    null,
    2,
  ),
);
process.exitCode = failures.size || capsuleChecks.some((c) => !c.supported) ? 1 : 0;
floorGeometry.dispose();
probeMaterial.dispose();
physics.free();
visual.free();
environment.dispose();
