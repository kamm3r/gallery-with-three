import { exportEnemyNormals } from "./exportEnemyNormals.ts";
import type { HoundAttack } from "../src/gameplay/houndAttacks.ts";
import { enemyAttackSpec } from "../src/gameplay/enemyAttacks.ts";
import { type KilnAttack } from "../src/gameplay/kilnAttacks.ts";
import fs from "node:fs";
import * as THREE from "three";
import { createParishRig, ENEMY_ATLAS } from "../src/gameplay/parishModels.ts";
import { applyParishRigPose } from "../src/gameplay/parishRigPose.ts";
import { createParishEncounter, type EnemyPhase } from "../src/gameplay/parishEncounter.ts";
import { enemySpecs, newParishProgress, type EnemyKind } from "../src/gameplay/ashenParish.ts";
const kind = process.argv[2] as EnemyKind;
if (!(kind in enemySpecs)) throw new Error("Pass an enemy kind");
const kilnAttack = (kind === "hound" ? "clamp" : (process.argv[4] ?? "clamp")) as KilnAttack;
const houndAttack = (kind === "hound" ? (process.argv[4] ?? "pounce") : "pounce") as HoundAttack;
const spec = enemyAttackSpec({ kind, kilnAttack, houndAttack }),
  template = createParishEncounter(newParishProgress()).enemies[0];
const actionYaw = kind === "hound" ? Math.PI / 2 : kind === "bearer" ? Math.PI / 3 : Math.PI / 4;
const headReview = kind === "hound" && process.argv[5] === "head";
const poses: [string, EnemyPhase, number, number][] = headReview
  ? [
      ["FRONT", "idle", 0, 0],
      ["THREE QUARTER", "idle", 0, -Math.PI / 4],
      ["PROFILE", "idle", 0, -Math.PI / 2],
      ["OPEN JAW", "windup", spec.windup, -Math.PI / 4],
    ]
  : process.argv[5] === "design"
    ? [
        ["THREE QUARTER", "idle", 0, -Math.PI / 4],
        ["SIDE", "idle", 0, -Math.PI / 2],
      ]
    : process.argv[5] === "motion"
      ? kilnAttack === "slam"
        ? [
            ["CARRY", "idle", 0, actionYaw],
            ["LIFT", "windup", spec.windup * 0.4, actionYaw],
            ["FLIP", "windup", spec.windup * 0.65, actionYaw],
            ["JAWS DOWN", "windup", spec.windup, actionYaw],
            ["DRIVE", "strike", spec.contact, actionYaw],
            ["RECOVER", "recovery", spec.recovery * 0.25, actionYaw],
          ]
        : [
            ["CARRY", "idle", 0, actionYaw],
            ["LOAD", "windup", spec.windup, actionYaw],
            ["RELEASE", "strike", spec.contact * 0.5, actionYaw],
            ["CONTACT", "strike", spec.contact, actionYaw],
            ["FOLLOW", "strike", spec.strike, actionYaw],
            ["RECOVER", "recovery", spec.recovery * 0.25, actionYaw],
          ]
      : [
          ["FRONT", "idle", 0, 0],
          ["REAR", "idle", 0, Math.PI],
          ["SIDE", "idle", 0, -Math.PI / 2],
          ["PREPARE", "windup", spec.windup, actionYaw],
          ["CONTACT", "strike", spec.contact, actionYaw],
          ["FOLLOW THROUGH", "recovery", 0, actionYaw],
        ];
if (headReview) {
  const view = ["front", "quarter", "profile", "jaw"].indexOf(process.argv[6] ?? "front");
  poses.splice(0, poses.length, poses[Math.max(0, view)]);
}
const enemies = poses.map(([name, phase, timer, yaw], poseIndex) => {
  const rig = createParishRig(kind);
  rig.root.rotation.y = yaw;
  applyParishRigPose(
    rig,
    {
      ...template,
      kind,
      kilnAttack,
      houndAttack,
      phase,
      timer,
      folded: kind === "clinger" && phase === "idle" ? 1 : 0,
      attackNumber: 1,
      moveAmount: 0,
    },
    0,
    true,
  );
  if (headReview) {
    const centre = rig.joints.head.localToWorld(new THREE.Vector3(0, 0.04, 0.25));
    rig.root.position.add(new THREE.Vector3(-centre.x, 1.4 - centre.y, -centre.z));
    rig.skin?.update();
  }
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
  rig.dispose();
  const houndLabels =
    houndAttack === "pounce"
      ? ["STALK", "COIL", "LEAP", "BITE", "LAND", "RECOVER"]
      : houndAttack === "snap"
        ? ["STALK", "BARE TEETH", "SNAP", "BITE", "RECOIL", "RECOVER"]
        : ["STALK", "LOAD LEFT", "JAW SWEEP", "BITE", "FOLLOW", "RECOVER"];
  return {
    kind,
    name: kind === "hound" && process.argv[5] === "motion" ? houndLabels[poseIndex] : name,
    meshes,
    triangles,
  };
});
fs.writeFileSync(
  process.argv[3] ?? `/tmp/${kind}-poses.json`,
  JSON.stringify({
    atlas: `public${ENEMY_ATLAS}`,
    enemies,
    framing: headReview
      ? {
          spacing: 0.9,
          pixelsPerActor: 900,
          height: 900,
          targetHeight: 1.4,
          cameraHeight: 1.4,
          turnDegrees: 0,
        }
      : process.argv[5] === "design"
        ? {
            spacing: 3.4,
            pixelsPerActor: 700,
            height: 650,
            targetHeight: 1.0,
            cameraHeight: 1.0,
            turnDegrees: 0,
          }
        : undefined,
  }),
);
