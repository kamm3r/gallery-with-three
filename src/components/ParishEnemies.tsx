import { enemyAttackSpec } from "../gameplay/enemyAttacks";
import { kilnSweepWindow } from "../gameplay/kilnAttacks";
import { useEcsRef } from "../hooks/useEcsRef";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { CylinderCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { enemySpecs, parishEnemySpawns } from "../gameplay/ashenParish";
import { createParishRig } from "../gameplay/parishModels";
import { applyParishRigPose } from "../gameplay/parishRigPose";
import type { ParishEncounter, ParishEnemy } from "../gameplay/parishEncounter";
import { playSound } from "../gameplay/sound";
import { useReducedMotion } from "../hooks/useReducedMotion";

function ParishEnemyModel({
  index,
  state,
}: {
  index: number;
  state: MutableRefObject<ParishEncounter>;
}) {
  const spawn = (state.current.world?.spawns ?? parishEnemySpawns)[index];
  const rig = useMemo(() => createParishRig(spawn.kind), [spawn.kind]);
  useEffect(() => () => rig.dispose(), [rig]);
  const materials = useMemo(() => {
    const metal = new Set<THREE.MeshStandardMaterial>();
    const ember = new Set<THREE.MeshStandardMaterial>();
    rig.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        if (object.material.name === "painted-ps2-enemy") metal.add(object.material);
        else if (object.material.emissiveIntensity > 0) ember.add(object.material);
      }
    });
    return { metal: [...metal], ember: [...ember] };
  }, [rig]);
  const body = useRef<RapierRigidBody>(null);
  const bar = useRef<THREE.Mesh>(null);
  const bellWave = useRef<THREE.Mesh>(null);
  const lastContact = useRef<{ enemy: ParishEnemy; attack: number } | null>(null);
  const vitals = useRef<THREE.Group>(null);
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const reduced = useReducedMotion();
  const visualTime = useEcsRef("visualTime", () => 0);
  const enabled = useEcsRef("enabled", () => true);
  const observedEnemy = useEcsRef("enemy-record", () => state.current.enemies[index]);
  useFrame(({ clock, camera }, delta) => {
    const e = state.current.enemies[index];
    if (observedEnemy.current !== e) {
      observedEnemy.current = e;
      visualTime.current = 0;
      rig.root.position.y = 0;
      // Respawn/rest replaces simulation records. Move the retained collider
      // immediately, including enemies culled from animation updates below.
      body.current?.setTranslation({ x: e.x, y: e.y, z: e.z }, true);
      body.current?.setNextKinematicTranslation({ x: e.x, y: e.y, z: e.z });
      const facing = rotation.setFromAxisAngle(up, e.yaw);
      body.current?.setRotation(facing, true);
      body.current?.setNextKinematicRotation(facing);
    }
    const alive = e.health > 0;
    if (enabled.current !== alive) {
      if (body.current) {
        body.current.userData = { cameraIgnore: true, nonBlocking: !alive };
        body.current.setEnabled(alive);
      }
      enabled.current = alive;
    }
    const distance = Math.hypot(camera.position.x - e.x, camera.position.z - e.z);
    const visible = distance < 52 && e.deathTime < 19;
    rig.root.visible = visible;
    if (vitals.current) vitals.current.visible = visible && alive && e.phase !== "idle";
    // Simulation remains authoritative. Distant sleeping enemies need no
    // skeletal/material work, and nearby combat always updates every frame.
    if (!visible) return;
    visualTime.current += delta;
    if (distance > 28 && visualTime.current < 1 / 20) return;
    const visualDelta = visualTime.current;
    visualTime.current = 0;
    if (
      alive &&
      distance < 28 &&
      e.phase === "strike" &&
      e.timer >=
        (e.kind === "kiln" && e.kilnAttack === "sweep"
          ? kilnSweepWindow.start
          : enemyAttackSpec(e).contact) &&
      (lastContact.current?.enemy !== e || lastContact.current?.attack !== e.attackNumber)
    ) {
      lastContact.current = { enemy: e, attack: e.attackNumber };
      const intensity = Math.max(0.15, 1 - distance / 30);
      if (e.kind === "widow") playSound("graveBell", { intensity });
      else if (e.kind === "bearer") playSound("slam", { intensity });
      else if (e.kind === "hound") playSound("houndBite", { intensity });
      else if (e.kind === "kiln")
        playSound(
          e.kilnAttack === "slam" ? "slam" : e.kilnAttack === "check" ? "bossImpact" : "bossSwing",
          { intensity },
        );
    }
    if (bellWave.current) {
      bellWave.current.visible = alive && e.kind === "widow" && e.phase === "strike";
      bellWave.current.scale.setScalar(
        enemySpecs.widow.reach * Math.min(1, e.timer / enemySpecs.widow.contact),
      );
      (bellWave.current.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.5 * (1 - e.timer / enemySpecs.widow.strike),
      );
    }
    const p = applyParishRigPose(rig, e, clock.elapsedTime, reduced, visualDelta);
    body.current?.setNextKinematicTranslation({ x: e.x, y: e.y, z: e.z });
    body.current?.setNextKinematicRotation(rotation.setFromAxisAngle(up, e.yaw));
    // Dead bodies stop colliding, but their pose keeps resolving in world space.
    rig.root.visible = p.sink < 3;
    for (const material of materials.metal) {
      material.emissive.set(p.guardGlow > 0 ? "#d5b26d" : p.glow > 0 ? "#dc6839" : "#b8c7d1");
      material.emissiveIntensity = Math.max(0.18, p.glow, p.guardGlow);
    }
    for (const material of materials.ember) material.emissiveIntensity = 1.8 + p.castGlow * 2;
    if (bar.current) {
      const ratio = e.health / enemySpecs[e.kind].health;
      bar.current.scale.x = ratio;
      bar.current.position.x = 0.65 * ratio;
    }
    if (vitals.current) vitals.current.visible = e.health > 0 && e.phase !== "idle";
  });
  return (
    <RigidBody
      userData={{ cameraIgnore: true }}
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={spawn.position}
    >
      <CylinderCollider
        args={[
          spawn.kind === "hound" ? 0.55 : spawn.kind === "clinger" ? 0.6 : 1.1,
          spawn.kind === "kiln" || spawn.kind === "bearer" ? 0.55 : 0.35,
        ]}
        position={[0, spawn.kind === "hound" ? 0.6 : spawn.kind === "clinger" ? 0.6 : 1.1, 0]}
      />
      <primitive object={rig.root} dispose={null} />
      {spawn.kind === "widow" && (
        <mesh
          ref={bellWave}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.055, 0]}
          visible={false}
        >
          <ringGeometry args={[0.94, 1, 48]} />
          <meshBasicMaterial
            color="#c9b88f"
            transparent
            opacity={0.45}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      <group
        ref={vitals}
        position={[0, spawn.kind === "hound" ? 2 : spawn.kind === "bearer" ? 3.5 : 3.1, 0]}
      >
        <Billboard>
          <mesh>
            <planeGeometry args={[1.3, 0.075]} />
            <meshBasicMaterial color="#191717" depthTest={false} />
          </mesh>
          <group position={[-0.65, 0, 0.01]}>
            <mesh ref={bar} position={[0.65, 0, 0]}>
              <planeGeometry args={[1.3, 0.06]} />
              <meshBasicMaterial color="#a94f3f" depthTest={false} />
            </mesh>
          </group>
        </Billboard>
      </group>
    </RigidBody>
  );
}
export function ParishEnemies({ state }: { state: MutableRefObject<ParishEncounter> }) {
  const reduced = useReducedMotion();
  const bolts = useRef<THREE.Group>(null);
  const healing = useRef<THREE.Mesh>(null);
  useFrame(() => {
    bolts.current?.children.forEach((object, index) => {
      const bolt = state.current.bolts[index];
      object.visible = Boolean(bolt);
      if (bolt) object.position.set(bolt.x, bolt.y, bolt.z);
    });
    if (healing.current) {
      const s = state.current;
      healing.current.visible = s.healTime > 0;
      healing.current.position.set(s.combat.playerX, s.combat.playerY + 1, s.combat.playerZ);
      healing.current.scale.setScalar(reduced ? 1 : 1 + (1 - s.healTime) * 0.35);
    }
  });
  return (
    <>
      {(state.current.world?.spawns ?? parishEnemySpawns).map((spawn, index) => (
        <ParishEnemyModel key={spawn.id} index={index} state={state} />
      ))}
      <group ref={bolts}>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} visible={false}>
            <icosahedronGeometry args={[0.17, 1]} />
            <meshBasicMaterial color="#ffc277" />
          </mesh>
        ))}
      </group>
      <mesh ref={healing} visible={false}>
        <sphereGeometry args={[0.65, 12, 8]} />
        <meshBasicMaterial color="#cde4be" transparent opacity={0.15} wireframe />
      </mesh>
    </>
  );
}
