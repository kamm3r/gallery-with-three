import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { enemySpecs, parishEnemySpawns } from "../../gameplay/ashenParish";
import { enemyAttackSpec } from "../../gameplay/enemyAttacks";
import { kilnSweepWindow } from "../../gameplay/kilnAttacks";
import { createParishRig } from "../../gameplay/parishModels";
import { applyParishRigPose } from "../../gameplay/parishRigPose";
import type { ParishEncounter, ParishEnemy } from "../../gameplay/parishEncounter";
import { playSound } from "../../gameplay/sound";

/** Native view of the parish enemies, their ember bolts and the flask's heal aura. */
export function createParishEnemyViews(
  scene: THREE.Scene,
  world: RAPIER.World,
  state: ParishEncounter,
  reduced: () => boolean,
) {
  const spawns = state.world?.spawns ?? parishEnemySpawns;
  const up = new THREE.Vector3(0, 1, 0);
  const rotation = new THREE.Quaternion();
  const views = spawns.map((spawn, index) => {
    const rig = createParishRig(spawn.kind);
    const metal = new Set<THREE.MeshStandardMaterial>();
    const ember = new Set<THREE.MeshStandardMaterial>();
    rig.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        if (object.material.name === "painted-ps2-enemy") metal.add(object.material);
        else if (object.material.emissiveIntensity > 0) ember.add(object.material);
      }
    });
    const group = new THREE.Group();
    group.add(rig.root);
    scene.add(group);
    const tall = spawn.kind === "hound" || spawn.kind === "clinger" ? 0.6 : 1.1;
    const radius = spawn.kind === "kiln" || spawn.kind === "bearer" ? 0.55 : 0.35;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...spawn.position),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(tall, radius).setTranslation(0, tall, 0),
      body,
    );
    let bellWave: THREE.Mesh | undefined;
    if (spawn.kind === "widow") {
      bellWave = new THREE.Mesh(
        new THREE.RingGeometry(0.94, 1, 48),
        new THREE.MeshBasicMaterial({
          color: "#c9b88f",
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      bellWave.rotation.x = -Math.PI / 2;
      bellWave.position.y = 0.055;
      bellWave.visible = false;
      group.add(bellWave);
    }
    const vitals = new THREE.Group();
    vitals.position.y = spawn.kind === "hound" ? 2 : spawn.kind === "bearer" ? 3.5 : 3.1;
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.075),
      new THREE.MeshBasicMaterial({ color: "#191717", depthTest: false }),
    );
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.06).translate(0.65, 0, 0),
      new THREE.MeshBasicMaterial({ color: "#a94f3f", depthTest: false }),
    );
    bar.position.set(-0.65, 0, 0.01);
    back.renderOrder = bar.renderOrder = 10;
    vitals.add(back, bar);
    vitals.visible = false;
    scene.add(vitals);
    return {
      index,
      rig,
      group,
      body,
      bellWave,
      vitals,
      bar,
      metal: [...metal],
      ember: [...ember],
      observed: undefined as ParishEnemy | undefined,
      alive: true,
      visualTime: 0,
      lastContact: null as { enemy: ParishEnemy; attack: number } | null,
    };
  });
  const boltMaterial = new THREE.MeshBasicMaterial({ color: "#ffc277" });
  const boltGeometry = new THREE.IcosahedronGeometry(0.17, 1);
  const bolts = Array.from({ length: 12 }, () => {
    const mesh = new THREE.Mesh(boltGeometry, boltMaterial);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  const healing = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 12, 8),
    new THREE.MeshBasicMaterial({
      color: "#cde4be",
      transparent: true,
      opacity: 0.15,
      wireframe: true,
    }),
  );
  healing.visible = false;
  scene.add(healing);

  return {
    update(camera: THREE.Camera, time: number, delta: number) {
      for (const view of views) {
        const e = state.enemies[view.index];
        if (!e) continue;
        if (view.observed !== e) {
          view.observed = e;
          view.visualTime = 0;
          view.rig.root.position.y = 0;
          view.body.setTranslation({ x: e.x, y: e.y, z: e.z }, true);
        }
        const alive = e.health > 0;
        if (view.alive !== alive) {
          view.body.setEnabled(alive);
          view.alive = alive;
        }
        const distance = Math.hypot(camera.position.x - e.x, camera.position.z - e.z);
        const visible = distance < 52 && e.deathTime < 19;
        view.group.visible = visible;
        view.vitals.visible = visible && alive && e.phase !== "idle";
        view.body.setNextKinematicTranslation({ x: e.x, y: e.y, z: e.z });
        view.body.setNextKinematicRotation(rotation.setFromAxisAngle(up, e.yaw));
        if (!visible) continue;
        view.visualTime += delta;
        if (distance > 28 && view.visualTime < 1 / 20) continue;
        const visualDelta = view.visualTime;
        view.visualTime = 0;
        if (
          alive &&
          distance < 28 &&
          e.phase === "strike" &&
          e.timer >=
            (e.kind === "kiln" && e.kilnAttack === "sweep"
              ? kilnSweepWindow.start
              : enemyAttackSpec(e).contact) &&
          (view.lastContact?.enemy !== e || view.lastContact?.attack !== e.attackNumber)
        ) {
          view.lastContact = { enemy: e, attack: e.attackNumber };
          const intensity = Math.max(0.15, 1 - distance / 30);
          if (e.kind === "widow") playSound("graveBell", { intensity });
          else if (e.kind === "bearer") playSound("slam", { intensity });
          else if (e.kind === "hound") playSound("houndBite", { intensity });
          else if (e.kind === "kiln")
            playSound(
              e.kilnAttack === "slam"
                ? "slam"
                : e.kilnAttack === "check"
                  ? "bossImpact"
                  : "bossSwing",
              { intensity },
            );
        }
        if (view.bellWave) {
          view.bellWave.visible = alive && e.phase === "strike";
          view.bellWave.scale.setScalar(
            enemySpecs.widow.reach * Math.min(1, e.timer / enemySpecs.widow.contact),
          );
          (view.bellWave.material as THREE.MeshBasicMaterial).opacity = Math.max(
            0,
            0.5 * (1 - e.timer / enemySpecs.widow.strike),
          );
        }
        view.group.position.set(e.x, e.y, e.z);
        view.group.quaternion.setFromAxisAngle(up, e.yaw);
        const p = applyParishRigPose(view.rig, e, time, reduced(), visualDelta);
        view.group.visible = p.sink < 3;
        for (const material of view.metal) {
          material.emissive.set(p.guardGlow > 0 ? "#d5b26d" : p.glow > 0 ? "#dc6839" : "#b8c7d1");
          material.emissiveIntensity = Math.max(0.18, p.glow, p.guardGlow);
        }
        for (const material of view.ember) material.emissiveIntensity = 1.8 + p.castGlow * 2;
        const ratio = Math.max(0, e.health / enemySpecs[e.kind].health);
        view.bar.scale.x = Math.max(0.0001, ratio);
        view.vitals.position.set(e.x, e.y + (view.vitals.position.y || 3), e.z);
        view.vitals.position.y = e.y + (e.kind === "hound" ? 2 : e.kind === "bearer" ? 3.5 : 3.1);
        view.vitals.quaternion.copy(camera.quaternion);
      }
      bolts.forEach((mesh, index) => {
        const bolt = state.bolts[index];
        mesh.visible = Boolean(bolt);
        if (bolt) mesh.position.set(bolt.x, bolt.y, bolt.z);
      });
      healing.visible = state.healTime > 0;
      healing.position.set(state.combat.playerX, state.combat.playerY + 1, state.combat.playerZ);
      healing.scale.setScalar(reduced() ? 1 : 1 + (1 - state.healTime) * 0.35);
    },
    targets() {
      return state.enemies
        .filter((e) => e.health > 0)
        .map((e) => ({ id: e.id, x: e.x, y: e.y, z: e.z, height: 1.5 }));
    },
    removeFrom(scene: THREE.Scene) {
      for (const view of views) {
        scene.remove(view.group, view.vitals);
        world.removeRigidBody(view.body);
      }
      for (const mesh of bolts) scene.remove(mesh);
      scene.remove(healing);
    },
    dispose() {
      for (const view of views) view.rig.dispose();
      boltGeometry.dispose();
    },
  };
}
