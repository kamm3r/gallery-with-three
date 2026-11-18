import { exportEnemyNormals } from "./exportEnemyNormals.ts";
import fs from "node:fs";
import * as THREE from "three";
import { createParishRig, ENEMY_ATLAS } from "../src/gameplay/parishModels.ts";
import { applyParishRigPose } from "../src/gameplay/parishRigPose.ts";
import type { ParishEnemy } from "../src/gameplay/parishEncounter.ts";
import { createParishEncounter } from "../src/gameplay/parishEncounter.ts";
import { enemySpecs, newParishProgress, type EnemyKind } from "../src/gameplay/ashenParish.ts";

const template = createParishEncounter(newParishProgress()).enemies[0];
const kinds = Object.keys(enemySpecs) as EnemyKind[];
const output = kinds.map((kind) => {
  const rig = createParishRig(kind);
  const phase = process.argv[3] === "attack" ? "strike" : "idle";
  const enemy: ParishEnemy = {
    ...template,
    kind,
    folded: kind === "clinger" && phase === "idle" ? 1 : 0,
    phase,
    timer: phase === "strike" ? enemySpecs[kind].contact : 0,
    flash: 0,
    guardFlash: 0,
    flinch: 0,
    deathTime: 0,
    moveAmount: 0,
  };
  applyParishRigPose(rig, enemy, 0, true);
  rig.root.updateMatrixWorld(true);
  const meshes: unknown[] = [];
  let triangles = 0;
  rig.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (let parent: THREE.Object3D | null = o; parent; parent = parent.parent)
      if (parent.userData.enemyEffect) return;
    const g = o.geometry;
    triangles += (g.index?.count ?? g.getAttribute("position").count) / 3;
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
      glow: o.material.name === "enemy-votive",
    });
  });
  const bounds = new THREE.Box3().setFromObject(rig.root);
  console.log(
    kind,
    Math.round(triangles),
    meshes.length,
    bounds.min.toArray(),
    bounds.max.toArray(),
  );
  rig.dispose();
  return {
    kind,
    name: enemySpecs[kind].name,
    meshes,
    triangles,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
  };
});
fs.writeFileSync(
  process.argv[2] ?? "/tmp/enemy-review.json",
  JSON.stringify({ atlas: `public${ENEMY_ATLAS}`, enemies: output }),
);
