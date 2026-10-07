import { useEcsRef } from "../hooks/useEcsRef";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { CylinderCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { enemySpecs, parishEnemySpawns } from "../gameplay/ashenParish";
import { createParishRig } from "../gameplay/parishModels";
import { parishEnemyPose } from "../gameplay/parishAnimation";
import type { ParishEncounter } from "../gameplay/parishEncounter";
import { useReducedMotion } from "../hooks/useReducedMotion";

function ParishEnemyModel({
  index,
  state,
}: {
  index: number;
  state: MutableRefObject<ParishEncounter>;
}) {
  const spawn = parishEnemySpawns[index];
  const rig = useMemo(() => createParishRig(spawn.kind), [spawn.kind]);
  useEffect(() => () => rig.dispose(), [rig]);
  const materials = useMemo(() => {
    const metal = new Set<THREE.MeshStandardMaterial>();
    const ember = new Set<THREE.MeshStandardMaterial>();
    rig.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        if (object.material.metalness > 0.5) metal.add(object.material);
        else if (object.material.emissiveIntensity > 0) ember.add(object.material);
      }
    });
    return { metal: [...metal], ember: [...ember] };
  }, [rig]);
  const body = useRef<RapierRigidBody>(null);
  const bar = useRef<THREE.Mesh>(null);
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
    const p = parishEnemyPose(e, clock.elapsedTime, reduced);
    body.current?.setNextKinematicTranslation({ x: e.x, y: e.y, z: e.z });
    body.current?.setNextKinematicRotation(rotation.setFromAxisAngle(up, e.yaw));
    // Dead bodies stop colliding, but their pose keeps resolving in world space.
    rig.root.visible = p.sink < 3;
    const poseDelta = Math.min(visualDelta, 0.1);
    rig.root.position.y = THREE.MathUtils.damp(
      rig.root.position.y,
      p.bob - p.sink - p.death * 0.6,
      18,
      poseDelta,
    );
    const j = rig.joints;
    const response = e.phase === "strike" ? 40 : 18;
    j.body.rotation.set(
      THREE.MathUtils.damp(j.body.rotation.x, p.lean - p.death * 1.35, response, poseDelta),
      THREE.MathUtils.damp(j.body.rotation.y, p.twist, response, poseDelta),
      THREE.MathUtils.damp(
        j.body.rotation.z,
        p.roll + (e.kind === "hound" ? p.death * 1.4 : p.death * 0.15),
        response,
        poseDelta,
      ),
    );
    if (j.armR)
      j.armR.rotation.x = THREE.MathUtils.damp(
        j.armR.rotation.x,
        p.arm,
        e.phase === "strike" ? 40 : 14,
        Math.min(delta, 0.05),
      );
    if (j.armL)
      j.armL.rotation.x = THREE.MathUtils.damp(
        j.armL.rotation.x,
        p.shield + p.stride * 0.12,
        18,
        Math.min(delta, 0.05),
      );
    if (j.head) j.head.rotation.set(p.head, -p.twist * 0.35, 0);
    if (j.forearmR) j.forearmR.rotation.x = p.elbow;
    if (j.forearmL) j.forearmL.rotation.x = p.offElbow;
    j.legFL.rotation.x = p.legFL;
    j.legFR.rotation.x = p.legFR;
    if (j.legBL) j.legBL.rotation.x = p.legBL;
    if (j.legBR) j.legBR.rotation.x = p.legBR;
    for (const suffix of ["FL", "FR", "BL", "BR"] as const) {
      const knee = j[`knee${suffix}`];
      const foot = j[`foot${suffix}`];
      if (knee) knee.rotation.x = p[`knee${suffix}`];
      if (foot) foot.rotation.x = -p[`leg${suffix}`] - p[`knee${suffix}`] - p.lean;
    }
    if (j.jaw) j.jaw.rotation.x = p.jaw;
    if (j.tail) j.tail.rotation.y = reduced ? 0 : Math.sin(clock.elapsedTime * 2.4) * 0.2;
    if (j.cape) j.cape.rotation.set(-p.lean * 0.35, 0, reduced ? 0 : p.stride * 0.06);
    if (j.lantern) j.lantern.rotation.x = -j.armR.rotation.x - p.elbow;
    for (const material of materials.metal) {
      material.emissive.set(p.guardGlow > 0 ? "#d5b26d" : "#dc6839");
      material.emissiveIntensity = Math.max(p.glow, p.guardGlow);
    }
    for (const material of materials.ember) material.emissiveIntensity = 2.5 + p.castGlow * 2;
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
        args={[spawn.kind === "hound" ? 0.45 : 1.1, 0.4]}
        position={[0, spawn.kind === "hound" ? 0.55 : 1.1, 0]}
      />
      <primitive object={rig.root} dispose={null} />
      <group ref={vitals} position={[0, spawn.kind === "hound" ? 2.5 : 3.1, 0]}>
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
      {parishEnemySpawns.map((spawn, index) => (
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
