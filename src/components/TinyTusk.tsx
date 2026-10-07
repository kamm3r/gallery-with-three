import { useEcsRef } from "../hooks/useEcsRef";
import { useFrame } from "@react-three/fiber";
import { CylinderCollider, RigidBody } from "@react-three/rapier";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { playSound } from "../gameplay/sound";
import type { PlatformerLink } from "../gameplay/platformerLink";
import { BOSS, bossLift, stepBoss, type BossEvent, type BossFight } from "../gameplay/warpBoss";

const SKIN = "#8a5a3c";
const HIDE = "#6b4128";

/** Stone arena ringed with spikes and torches, open to a burning sky. */
export function TuskArena() {
  const torches = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return [
          Math.sin(angle) * (BOSS.arenaRadius + 1.2),
          0,
          Math.cos(angle) * (BOSS.arenaRadius + 1.2),
        ] as [number, number, number];
      }),
    [],
  );
  const spikes = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => {
        const angle = (i / 48) * Math.PI * 2;
        return { angle, h: 1.4 + ((i * 7) % 5) * 0.25 };
      }),
    [],
  );
  const flames = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    flames.current?.children.forEach((flame, i) => {
      flame.scale.setScalar(1 + Math.sin(t * 11 + i * 2.1) * 0.15 + Math.sin(t * 17 + i) * 0.08);
    });
  });
  return (
    <>
      <color attach="background" args={["#3a1d2a"]} />
      <fog attach="fog" args={["#4a2230", 30, 90]} />
      <hemisphereLight args={["#ffc9a8", "#2a1418", 1.3]} />
      <directionalLight
        castShadow
        color="#ffd1a0"
        intensity={2.2}
        position={[-10, 24, 12]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-normalBias={0.03}
      />
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[1, BOSS.arenaRadius + 2]} position={[0, -1, 0]} />
      </RigidBody>
      <mesh position={[0, -1, 0]} receiveShadow>
        <cylinderGeometry args={[BOSS.arenaRadius + 2, BOSS.arenaRadius + 1, 2, 64]} />
        <meshStandardMaterial color="#6e5a4c" roughness={0.95} />
      </mesh>
      <group position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        {[3, 7, 11].map((r) => (
          <mesh key={r}>
            <ringGeometry args={[r - 0.12, r + 0.12, 64]} />
            <meshStandardMaterial color="#54443a" roughness={1} />
          </mesh>
        ))}
      </group>
      {/* Lava moat beyond the rim. */}
      <mesh position={[0, -1.6, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[BOSS.arenaRadius + 1.5, 90, 64]} />
        <meshStandardMaterial
          color="#ff5a1a"
          emissive="#ff3a0a"
          emissiveIntensity={1.6}
          roughness={0.5}
        />
      </mesh>
      {spikes.map(({ angle, h }) => (
        <mesh
          key={angle}
          position={[
            Math.sin(angle) * (BOSS.arenaRadius + 1.6),
            h / 2,
            Math.cos(angle) * (BOSS.arenaRadius + 1.6),
          ]}
          castShadow
        >
          <coneGeometry args={[0.35, h, 6]} />
          <meshStandardMaterial color="#3a302c" roughness={0.8} flatShading />
        </mesh>
      ))}
      <group ref={flames}>
        {torches.map((position, i) => (
          <group key={i} position={position}>
            <mesh position={[0, 1.4, 0]} castShadow>
              <cylinderGeometry args={[0.12, 0.18, 2.8, 8]} />
              <meshStandardMaterial color="#3b2a20" />
            </mesh>
            <mesh position={[0, 3, 0]}>
              <coneGeometry args={[0.28, 0.8, 8]} />
              <meshBasicMaterial color={[3, 1.3, 0.3]} toneMapped={false} />
            </mesh>
            {i % 2 === 0 && (
              <pointLight
                position={[0, 3.2, 0]}
                color="#ff8a3a"
                intensity={16}
                distance={12}
                decay={2}
              />
            )}
          </group>
        ))}
      </group>
    </>
  );
}

interface TinyTuskProps {
  fight: MutableRefObject<BossFight>;
  link: MutableRefObject<PlatformerLink>;
  onEvents: (events: BossEvent[]) => void;
}

const ringScratch = new THREE.Object3D();

/** The boss: a hulking warthog. Leaps, pounds, gets dazed, and falls. */
export function TinyTusk({ fight, link, onEvents }: TinyTuskProps) {
  const body = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const warning = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Group>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const flash = useEcsRef("flash", () => 0);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const f = fight.current;
    const l = link.current;
    const events = stepBoss(
      f,
      { x: l.x, y: l.y, z: l.z, vy: l.vy, grounded: l.grounded, spinning: l.spinTime > 0 },
      dt,
    );
    for (const event of events) {
      switch (event.type) {
        case "leap":
          playSound("bossWindup");
          break;
        case "slam":
          playSound("bossImpact");
          break;
        case "pound":
          playSound("boom");
          break;
        case "dazed":
          playSound("roar");
          break;
        case "hit":
          flash.current = 1;
          playSound("bossHit");
          break;
        case "bounce":
          l.bounce = event.speed;
          playSound("boing");
          break;
        case "defeated":
          playSound("bossDeath");
          break;
        case "maskLost":
          playSound("hurt");
          break;
        case "dead":
          l.frozen = true;
          playSound("whoa");
          break;
      }
    }
    if (events.length) onEvents(events);

    const g = body.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const lift = bossLift(f);
    g.position.set(f.x, lift, f.z);
    // Face the player, except while dazed or down.
    if (f.mode !== "dazed" && f.mode !== "defeated") {
      const yaw = Math.atan2(l.x - f.x, l.z - f.z);
      g.rotation.y = THREE.MathUtils.damp(g.rotation.y, yaw, 6, dt);
    }
    const progress = f.duration > 0 ? 1 - f.timer / f.duration : 1;
    let squashY = 1;
    let tilt = 0;
    if (f.mode === "leap") squashY = 1 + Math.sin(progress * Math.PI) * 0.15;
    else if (f.mode === "land") {
      // Rear up, then pound: matches the ring's start.
      const rear = BOSS.poundDelay / BOSS.landRest;
      tilt =
        progress < rear
          ? -(progress / rear) * 0.45
          : -0.45 * Math.max(0, 1 - (progress - rear) * 6);
      squashY = progress < 0.12 ? 0.8 : 1;
    } else if (f.mode === "dazed") {
      squashY = BOSS.dazedHeadHeight / BOSS.headHeight;
      tilt = 0.25 + Math.sin(t * 3) * 0.08;
    } else if (f.mode === "defeated") {
      tilt = THREE.MathUtils.damp(g.rotation.x, 1.45, 3, dt);
    } else if (f.mode === "intro") {
      squashY = 1 + Math.sin(t * 8) * 0.04;
    }
    g.rotation.x = f.mode === "defeated" ? tilt : THREE.MathUtils.damp(g.rotation.x, tilt, 14, dt);
    g.scale.set(1 / Math.sqrt(squashY), squashY, 1 / Math.sqrt(squashY));
    flash.current = Math.max(0, flash.current - dt * 3);
    g.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.skin) {
        (child.material as THREE.MeshStandardMaterial).emissiveIntensity = flash.current * 2;
      }
    });
    if (stars.current) {
      stars.current.visible = f.mode === "dazed";
      stars.current.rotation.y = t * 4;
    }

    // Landing shadow: grows through the leap so you can read where he'll hit.
    const s = shadow.current;
    const w = warning.current;
    if (s && w) {
      const leaping = f.mode === "leap";
      s.position.set(leaping ? f.toX : f.x, 0.03, leaping ? f.toZ : f.z);
      const size = leaping ? 0.4 + progress * 0.6 : 0.9;
      s.scale.setScalar(size * BOSS.crushRadius);
      w.visible = leaping;
      w.position.set(f.toX, 0.04, f.toZ);
      w.scale.setScalar(BOSS.crushRadius);
      (w.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 20) * 0.2;
    }

    const r = rings.current;
    if (r) {
      f.rings.forEach((ring, i) => {
        ringScratch.position.set(ring.x, 0.2, ring.z);
        ringScratch.rotation.set(-Math.PI / 2, 0, 0);
        ringScratch.scale.set(ring.radius, ring.radius, 1);
        ringScratch.updateMatrix();
        r.setMatrixAt(i, ringScratch.matrix);
      });
      r.count = f.rings.length;
      r.instanceMatrix.needsUpdate = true;
    }
  });

  const skin = (color = SKIN) => (
    <meshStandardMaterial color={color} roughness={0.75} emissive="#ff2a1a" emissiveIntensity={0} />
  );
  const tusk = <meshStandardMaterial color="#f3ead2" roughness={0.4} />;

  return (
    <>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh ref={warning} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial
          color={[3, 0.4, 0.2]}
          transparent
          opacity={0.5}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <instancedMesh ref={rings} args={[undefined, undefined, 8]} frustumCulled={false}>
        <torusGeometry args={[1, 0.035, 6, 72]} />
        <meshBasicMaterial color={[3, 1.6, 0.6]} toneMapped={false} />
      </instancedMesh>
      <group ref={body}>
        {/* Barrel body. */}
        <mesh position={[0, 1.15, 0]} scale={[1.15, 1, 1.05]} castShadow userData={{ skin: true }}>
          <sphereGeometry args={[0.95, 20, 16]} />
          {skin()}
        </mesh>
        <mesh
          position={[0, 1.45, -0.1]}
          scale={[0.9, 0.7, 0.9]}
          castShadow
          userData={{ skin: true }}
        >
          <sphereGeometry args={[0.95, 16, 12]} />
          {skin(HIDE)}
        </mesh>
        {/* Head, snout, tusks, ears, angry brows. */}
        <group position={[0, 1.55, 0.85]}>
          <mesh castShadow userData={{ skin: true }}>
            <sphereGeometry args={[0.55, 18, 14]} />
            {skin()}
          </mesh>
          <mesh
            position={[0, -0.12, 0.45]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
            userData={{ skin: true }}
          >
            <cylinderGeometry args={[0.28, 0.32, 0.35, 16]} />
            {skin("#b07a5a")}
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * 0.1, -0.12, 0.63]}>
                <sphereGeometry args={[0.06, 8, 6]} />
                <meshStandardMaterial color="#2a1a12" />
              </mesh>
              <mesh position={[side * 0.3, -0.2, 0.45]} rotation={[0.4, 0, side * -0.5]} castShadow>
                <coneGeometry args={[0.08, 0.55, 8]} />
                {tusk}
              </mesh>
              <mesh position={[side * 0.42, 0.42, -0.05]} rotation={[0, 0, side * -0.6]} castShadow>
                <coneGeometry args={[0.16, 0.4, 6]} />
                {skin(HIDE)}
              </mesh>
              <mesh position={[side * 0.2, 0.14, 0.45]}>
                <sphereGeometry args={[0.08, 10, 8]} />
                <meshStandardMaterial color="#ffe65a" emissive="#ff9a1a" emissiveIntensity={0.8} />
              </mesh>
              <mesh position={[side * 0.2, 0.26, 0.46]} rotation={[0, 0, side * 0.45]}>
                <boxGeometry args={[0.24, 0.05, 0.06]} />
                <meshStandardMaterial color="#2a1a12" />
              </mesh>
            </group>
          ))}
          {/* Mohawk. */}
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} position={[0, 0.5 - i * 0.05, -0.1 - i * 0.22]} rotation={[-0.4, 0, 0]}>
              <coneGeometry args={[0.1, 0.4, 5]} />
              <meshStandardMaterial color="#2a1a12" />
            </mesh>
          ))}
          <group ref={stars} position={[0, 0.75, 0]} visible={false}>
            {[0, 1, 2, 3, 4].map((i) => (
              <mesh
                key={i}
                position={[
                  Math.cos((i / 5) * Math.PI * 2) * 0.6,
                  0,
                  Math.sin((i / 5) * Math.PI * 2) * 0.6,
                ]}
              >
                <octahedronGeometry args={[0.12, 0]} />
                <meshBasicMaterial color={[3, 2.6, 0.6]} toneMapped={false} />
              </mesh>
            ))}
          </group>
        </group>
        {/* Arms and legs. */}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              position={[side * 1.1, 1.1, 0.25]}
              rotation={[0.5, 0, side * 0.5]}
              castShadow
              userData={{ skin: true }}
            >
              <capsuleGeometry args={[0.24, 0.8, 4, 10]} />
              {skin()}
            </mesh>
            <mesh position={[side * 1.35, 0.62, 0.55]} castShadow userData={{ skin: true }}>
              <sphereGeometry args={[0.3, 12, 10]} />
              {skin(HIDE)}
            </mesh>
            <mesh position={[side * 0.5, 0.25, 0]} castShadow userData={{ skin: true }}>
              <cylinderGeometry args={[0.24, 0.3, 0.5, 10]} />
              {skin(HIDE)}
            </mesh>
          </group>
        ))}
        {/* Spiked belt. */}
        <mesh position={[0, 0.85, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.02, 0.08, 6, 24]} />
          <meshStandardMaterial color="#2f2a28" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>
    </>
  );
}
