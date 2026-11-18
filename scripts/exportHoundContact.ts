import { exportEnemyNormals } from "./exportEnemyNormals.ts";
/** Export actual gameplay contact frames, including committed attack travel. */
import fs from "node:fs";
import * as THREE from "three";
import { createParishRig, ENEMY_ATLAS } from "../src/gameplay/parishModels.ts";
import { applyParishRigPose } from "../src/gameplay/parishRigPose.ts";
import { createParishEncounter, stepParishEncounter } from "../src/gameplay/parishEncounter.ts";
import { newParishProgress, parishShrines } from "../src/gameplay/ashenParish.ts";

const enemies = (
  [
    ["pounce", 3.5],
    ["snap", 1.3],
    ["rake", 1.7],
  ] as const
).map(([move, distance]) => {
  const progress = newParishProgress();
  const state = createParishEncounter(progress, {
    campaign: true,
    spawns: [{ id: "hound", kind: "hound", position: [0, 0, 0], area: "yard" }],
    shrines: parishShrines,
    floorHeight: () => 0,
    blocked: () => false,
    lineClear: () => true,
  });
  const e = state.enemies[0];
  Object.assign(e, { phase: "windup", timer: 0, houndAttack: move, attackNumber: 3, yaw: 0 });
  Object.assign(state.combat, { playerX: 0, playerZ: distance, playerY: 0 });
  const health = state.combat.health;
  for (let frame = 0; frame < 240; frame++) {
    stepParishEncounter(state, 1 / 120, progress);
    if (state.combat.health < health) break;
  }
  if (state.combat.health === health) throw Error(`${move} failed to connect`);
  const rig = createParishRig("hound"),
    actor = new THREE.Group();
  actor.rotation.y = Math.PI / 2;
  actor.position.x = -distance / 2;
  actor.add(rig.root);
  rig.root.position.set(e.x, 0, e.z);
  rig.root.rotation.y = e.yaw;
  applyParishRigPose(rig, e, 0, true);
  actor.updateMatrixWorld(true);
  const meshes: unknown[] = [];
  rig.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry;
    meshes.push({
      position:
        o instanceof THREE.SkinnedMesh
          ? Array.from({ length: g.getAttribute("position").count }, (_, i) =>
              o.getVertexPosition(i, new THREE.Vector3()).toArray(),
            ).flat()
          : Array.from(g.getAttribute("position").array),
      uv: Array.from(g.getAttribute("uv").array),
      normal: exportEnemyNormals(o),
      color: g.getAttribute("color") ? Array.from(g.getAttribute("color").array) : null,
      index: g.index ? Array.from(g.index.array) : null,
      matrix: o.matrixWorld.toArray(),
      texture: (o.material as THREE.Material).userData.reviewTexture,
      glow: false,
    });
  });
  rig.dispose();
  return {
    kind: "hound",
    name: `${move} / actual damage frame`,
    meshes,
    target: [distance / 2, 0, 0],
  };
});
fs.writeFileSync(
  process.argv[2] ?? "/tmp/hound-contact.json",
  JSON.stringify({
    atlas: `public${ENEMY_ATLAS}`,
    enemies,
    framing: {
      spacing: 4.6,
      pixelsPerActor: 700,
      height: 600,
      cameraHeight: 3,
      targetHeight: 1,
      turnDegrees: 0,
    },
  }),
);
