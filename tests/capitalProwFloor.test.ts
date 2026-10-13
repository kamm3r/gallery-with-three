import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildCapitalEnvironment } from "../src/gameplay/capitalEnvironment.ts";
import { capitalFloorHeight } from "../src/gameplay/capitalLayout.ts";
import { TIER_R, TIER_H } from "../src/gameplay/capitalDistricts.ts";

const environment = buildCapitalEnvironment(false);
environment.root.updateMatrixWorld(true);
test.after(() => environment.dispose());

void test("terraces meet the straight prow wall without un-authored wedge gaps", () => {
  for (let k = 0; k < 6; k++) {
    const inner = Math.sqrt(TIER_R[k + 1] ** 2 - 4.5 ** 2);
    const outer = Math.sqrt(TIER_R[k] ** 2 - 4.5 ** 2);
    for (const side of [-1, 1])
      for (let z = (inner + outer) / 2 + 1; z < outer - 0.5; z += 0.25) {
        const x = side * 4.95,
          y = TIER_H[k];
        assert.ok(
          Math.abs((capitalFloorHeight(x, z, y) ?? Infinity) - y) < 1e-6,
          `missing floor beside prow at ${x},${y},${z}`,
        );
        const ray = new THREE.Raycaster(
          new THREE.Vector3(x, y + 0.1, z),
          new THREE.Vector3(0, -1, 0),
          0,
          0.11,
        );
        assert.ok(
          ray.intersectObject(environment.root, true).some((h) => h.object.visible),
          `missing paving beside prow at ${x},${y},${z}`,
        );
      }
  }
});

void test("the real capsule can walk up to either prow wall without dropping through the terrace", async () => {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  for (const c of environment.colliders)
    world.createCollider(RAPIER.ColliderDesc.trimesh(c.vertices, c.indices));
  for (const s of environment.solids)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)
        .setTranslation(s.position[0], s.position[1] + s.size[1] / 2, s.position[2])
        .setRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) }),
    );
  try {
    for (const side of [-1, 1]) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(side * 7, 0.95, 94),
      );
      const capsule = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.42), body);
      const controller = world.createCharacterController(0.03);
      controller.enableSnapToGround(0.5);
      world.step();
      try {
        for (let frame = 0; frame < 180; frame++) {
          const p = body.translation();
          const dx = side * Math.max(-0.03, Math.min(0, 4.96 - side * p.x));
          controller.computeColliderMovement(
            capsule,
            { x: dx, y: -0.06, z: 0 },
            undefined,
            undefined,
            (c) => c.handle !== capsule.handle,
          );
          const movement = controller.computedMovement();
          body.setNextKinematicTranslation({
            x: p.x + movement.x,
            y: p.y + movement.y,
            z: p.z + movement.z,
          });
          world.step();
          assert.ok(
            body.translation().y > 0.85,
            `player dropped beside ${side > 0 ? "east" : "west"} prow at frame ${frame}`,
          );
        }
        assert.ok(
          Math.abs(body.translation().x - side * 4.96) < 0.05,
          "player never reached wall seam",
        );
      } finally {
        world.removeCharacterController(controller);
        world.removeRigidBody(body);
      }
    }
  } finally {
    world.free();
  }
});
