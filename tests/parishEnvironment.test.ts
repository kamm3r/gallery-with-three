import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildParishEnvironment } from "../src/gameplay/parishEnvironment.ts";
import { parishBlocked } from "../src/gameplay/ashenParish.ts";

await RAPIER.init();
void test("replacement architecture preserves actual cathedral and arcade openings in physics", () => {
  const environment = buildParishEnvironment(false);
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  for (const wall of environment.colliders) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(...wall.position)
        .setRotation({ x: 0, y: Math.sin(wall.yaw / 2), z: 0, w: Math.cos(wall.yaw / 2) }),
    );
    world.createCollider(RAPIER.ColliderDesc.trimesh(wall.vertices, wall.indices), body);
  }
  world.step();
  const ray = (x: number, y: number, z: number, dx: number, dz: number, length: number) =>
    world.castRay(new RAPIER.Ray({ x, y, z }, { x: dx, y: 0, z: dz }), length, true);
  assert.equal(ray(0, 13, 29, 0, -1, 6), null, "cathedral doorway must be open");
  assert.ok(ray(6, 13, 29, 0, -1, 6), "cathedral masonry must be solid");
  assert.equal(ray(42, 7, 88, 1, 0, 4), null, "court ascent must pass through the arcade");
  assert.ok(ray(42, 7, 84, 1, 0, 4), "arcade pier must be solid");
  assert.equal(ray(-22, 1, 128, 1, 0, 4), null, "opened shortcut keeps its gatehouse opening");
  world.free();
  environment.dispose();
});
void test("refuge buildings and bell tower supports block enemy paths on their own floor", () => {
  assert.equal(parishBlocked(18, 0, 144, 0.4), true);
  assert.equal(parishBlocked(43, 14, 43, 0.4), true);
  assert.equal(parishBlocked(43, 6, 43, 0.4), false);
  assert.equal(parishBlocked(0, 0, 138, 0.4), false);
  assert.equal(parishBlocked(0, 0, 136, 0.4), true, "the brazier has a solid body");
});
void test("replacement scenery batches submissions and releases each owned geometry once", () => {
  const environment = buildParishEnvironment(false);
  const geometry = new Set<THREE.BufferGeometry>();
  let visible = 0,
    hidden = 0;
  environment.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometry.add(o.geometry);
      if (o.visible) visible++;
      else hidden++;
    }
  });
  assert.ok(
    visible < hidden / 3,
    `${visible} visible meshes versus ${hidden} batched source meshes`,
  );
  const disposed = new Map<THREE.BufferGeometry, number>();
  for (const g of geometry)
    g.addEventListener("dispose", () => disposed.set(g, (disposed.get(g) ?? 0) + 1));
  environment.dispose();
  assert.equal(disposed.size, geometry.size);
  assert.ok([...disposed.values()].every((count) => count === 1));
});
void test("dense vegetation stays instanced in culled cells instead of creating one draw per leaf", () => {
  const environment = buildParishEnvironment(false);
  try {
    const foliage: THREE.InstancedMesh[] = [];
    let instances = 0,
      submissions = 0;
    environment.dressing.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) {
        instances += o.count;
        submissions++;
        if (o.name.startsWith("foliage:")) foliage.push(o);
      }
    });
    assert.ok(instances > 10000 && instances < 30000);
    assert.ok(submissions < 120);
    assert.ok(foliage.length > 4);
    assert.ok(
      foliage.every((o) => o.frustumCulled && o.boundingSphere && o.boundingSphere.radius < 48),
    );
  } finally {
    environment.dispose();
  }
});
void test("world detail thins decorative vegetation without rebuilding buffers or removing trunks", () => {
  const environment = buildParishEnvironment(false);
  try {
    const vegetation: THREE.InstancedMesh[] = [];
    environment.dressing.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh && /^(foliage:|weeds:|fallen-leaves)/.test(o.name))
        vegetation.push(o);
    });
    const original = vegetation.map((mesh) => ({
      count: mesh.count,
      buffer: mesh.instanceMatrix.array,
      version: mesh.instanceMatrix.version,
    }));
    const colliders = environment.solids;
    environment.dressing.setDetail("low");
    assert.ok(vegetation.every((mesh, i) => mesh.count < original[i].count));
    assert.equal(environment.solids, colliders);
    environment.dressing.setDetail("high");
    assert.ok(
      vegetation.every(
        (mesh, i) =>
          mesh.count === original[i].count &&
          mesh.instanceMatrix.array === original[i].buffer &&
          mesh.instanceMatrix.version === original[i].version,
      ),
    );
  } finally {
    environment.dispose();
  }
});
