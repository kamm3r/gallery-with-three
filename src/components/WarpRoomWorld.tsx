import { Stars } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, RigidBody } from "@react-three/rapier";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { WARP_LEVELS, type Vec3 } from "../gameplay/warpLevels";
import { bossUnlocked, type WarpProgress } from "../gameplay/warpProgress";
import { BOSS_PAD, WARP_ROOM_PORTALS, WARP_ROOM_RADIUS } from "../gameplay/warpRoom";
import { PortalFrameCollider } from "./PortalFrameCollider";
import { PortalPainting } from "./PortalPainting";
import { ThirdPersonPlayer, type PlayerPortal } from "./ThirdPersonPlayer";
import { Gem, PowerCrystal } from "./warpProps";

interface WarpRoomWorldProps {
  progress: WarpProgress;
  spawn: { position: Vec3; yaw: number };
  nearPortal: string | null;
  portalImpact: string | null;
  onNearPortal: (id: string | null) => void;
  onEnterPortal: (id: string) => void;
  onReady: () => void;
}

/** Concentric glowing rings inlaid in the floor, slowly pulsing. */
function FloorRings() {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    if (material.current)
      material.current.color.setScalar(0.6 + Math.sin(state.clock.elapsedTime * 1.4) * 0.25);
  });
  return (
    <group position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {[4.2, 8.5, 15.8].map((radius) => (
        <mesh key={radius}>
          <ringGeometry args={[radius - 0.08, radius + 0.08, 96]} />
          <meshBasicMaterial
            ref={radius === 8.5 ? material : undefined}
            color="#7fb6ff"
            toneMapped={false}
          />
        </mesh>
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} rotation={[0, 0, (i * Math.PI) / 6]} position={[0, 0, 0.001]}>
          <planeGeometry args={[0.1, 31.6]} />
          <meshBasicMaterial color="#3d4f86" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Tilted halo rings orbiting over the room, like the Warp Room's machinery. */
function Halos() {
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((child, i) => {
      child.rotation.set(0.5 + i * 0.3, t * (0.1 + i * 0.05) * (i % 2 ? -1 : 1), 0.2 * i);
    });
  });
  return (
    <group ref={group} position={[0, 16, 0]}>
      {[22, 27, 33].map((radius, i) => (
        <mesh key={radius}>
          <torusGeometry args={[radius, 0.18 + i * 0.05, 8, 128]} />
          <meshBasicMaterial color={["#8a6bff", "#4fb6ff", "#ff7ad9"][i]} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Floating rock islands drifting far out in the void. */
function Islands() {
  const islands = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * Math.PI * 2 + 0.3;
        const distance = 45 + ((i * 37) % 30);
        return {
          position: [
            Math.sin(angle) * distance,
            -8 + ((i * 13) % 18),
            Math.cos(angle) * distance,
          ] as Vec3,
          scale: 2 + ((i * 7) % 5),
          phase: i,
        };
      }),
    [],
  );
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    group.current?.children.forEach((child, i) => {
      child.position.y = islands[i].position[1] + Math.sin(state.clock.elapsedTime * 0.4 + i) * 0.8;
    });
  });
  return (
    <group ref={group}>
      {islands.map((island) => (
        <group key={island.phase} position={island.position} scale={island.scale}>
          <mesh rotation={[Math.PI, island.phase, 0]}>
            <coneGeometry args={[1, 1.8, 7]} />
            <meshStandardMaterial color="#5b5070" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, -0.85, 0]}>
            <cylinderGeometry args={[1, 1, 0.3, 7]} />
            <meshStandardMaterial color="#4f8a5a" roughness={1} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** The center pad: sockets fill with crystals; a full set opens the way to the boss. */
function BossPad({
  progress,
  active,
  impact,
}: {
  progress: WarpProgress;
  active: boolean;
  impact: boolean;
}) {
  const open = bossUnlocked(progress);
  const beam = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (beam.current) {
      const t = state.clock.elapsedTime;
      beam.current.scale.set(1 + Math.sin(t * 3) * 0.05, 1, 1 + Math.sin(t * 3) * 0.05);
      (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(t * 2) * 0.03;
    }
  });
  return (
    <group>
      <mesh position={[0, BOSS_PAD.top / 2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[BOSS_PAD.radius, BOSS_PAD.radius + 0.2, BOSS_PAD.top, 40]} />
        <meshStandardMaterial
          color={open ? "#4b3d7a" : "#2f3140"}
          metalness={0.6}
          roughness={0.35}
        />
      </mesh>
      {Object.values(WARP_LEVELS).map((level) => {
        const angle = (level.index / 5) * Math.PI * 2;
        const x = Math.sin(angle) * (BOSS_PAD.radius + 1.1);
        const z = Math.cos(angle) * (BOSS_PAD.radius + 1.1);
        const owned = progress.crystals.includes(level.id);
        return (
          <group key={level.id} position={[x, 0, z]}>
            <mesh position={[0, 0.35, 0]} castShadow>
              <cylinderGeometry args={[0.32, 0.42, 0.7, 10]} />
              <meshStandardMaterial color="#3c4260" metalness={0.5} roughness={0.4} />
            </mesh>
            <PowerCrystal
              position={[0, 1.25, 0]}
              collected={() => false}
              scale={0.55}
              dim={!owned}
            />
          </group>
        );
      })}
      {open ? (
        <>
          <PortalPainting
            image="/assets/tree.jpg"
            variant="warp"
            position={[0, BOSS_PAD.top + 0.04, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={0.9}
            active={active || impact}
            impact={impact}
          />
          <PortalFrameCollider
            position={[0, BOSS_PAD.top + 0.04, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={0.9}
          />
          <mesh ref={beam} position={[0, 14, 0]}>
            <cylinderGeometry args={[1.6, 2.4, 28, 32, 1, true]} />
            <meshBasicMaterial
              color={[1.6, 0.9, 2.6]}
              transparent
              opacity={0.2}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <pointLight position={[0, 3, 0]} color="#b48aff" intensity={30} distance={14} decay={2} />
        </>
      ) : (
        <mesh position={[0, BOSS_PAD.top + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[BOSS_PAD.radius - 0.4, 40]} />
          <meshStandardMaterial color="#1b1d2a" metalness={0.8} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

export function WarpRoomWorld({
  progress,
  spawn,
  nearPortal,
  portalImpact,
  onNearPortal,
  onEnterPortal,
  onReady,
}: WarpRoomWorldProps) {
  const open = bossUnlocked(progress);
  const portals = useMemo<PlayerPortal[]>(() => {
    const list: PlayerPortal[] = WARP_ROOM_PORTALS.map((portal) => ({
      id: portal.id,
      position: portal.position,
      yaw: portal.yaw,
      scale: 1,
    }));
    if (open)
      list.push({ id: "boss", position: [0, BOSS_PAD.top, 0], yaw: 0, scale: 0.9, flat: true });
    return list;
  }, [open]);

  return (
    <>
      <color attach="background" args={["#0d0b1f"]} />
      <fog attach="fog" args={["#140f2e", 40, 120]} />
      <Stars radius={120} depth={50} count={2500} factor={4} fade speed={0.6} />
      <hemisphereLight args={["#b9b0ff", "#1d1830", 1.4]} />
      <directionalLight
        castShadow
        color="#e6dcff"
        intensity={1.8}
        position={[-12, 26, 14]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-normalBias={0.03}
      />
      <Halos />
      <Islands />

      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[1, WARP_ROOM_RADIUS]} position={[0, -1, 0]} />
        <CylinderCollider
          args={[BOSS_PAD.top / 2, BOSS_PAD.radius]}
          position={[0, BOSS_PAD.top / 2, 0]}
        />
      </RigidBody>
      <mesh position={[0, -1, 0]} receiveShadow>
        <cylinderGeometry args={[WARP_ROOM_RADIUS, WARP_ROOM_RADIUS - 1.5, 2, 72]} />
        <meshStandardMaterial color="#353a5c" metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, -6, 0]}>
        <coneGeometry args={[WARP_ROOM_RADIUS - 1.5, 9, 72]} />
        <meshStandardMaterial color="#231f3a" roughness={0.9} />
      </mesh>
      <FloorRings />
      <BossPad
        progress={progress}
        active={nearPortal === "boss"}
        impact={portalImpact === "boss"}
      />

      {WARP_ROOM_PORTALS.map((portal) => {
        const level = portal.id === "forest" ? null : WARP_LEVELS[portal.id];
        return (
          <group key={portal.id} position={portal.position} rotation={[0, portal.yaw, 0]}>
            <mesh position={[0, 0.1, -0.2]} receiveShadow>
              <boxGeometry args={[6.4, 0.2, 2.6]} />
              <meshStandardMaterial color="#474d78" metalness={0.5} roughness={0.4} />
            </mesh>
            <PortalPainting
              image={level ? level.image : "/assets/tree.jpg"}
              variant={level ? "warp" : "gilded"}
              position={[0, 2.17, 0]}
              beacon={!level}
              active={nearPortal === portal.id || portalImpact === portal.id}
              impact={portalImpact === portal.id}
            />
            <PortalFrameCollider position={[0, 2.17, 0]} />
            {/* Solid backing so the camera never ends up behind a painting. */}
            <RigidBody type="fixed" colliders={false}>
              <CuboidCollider args={[2.62, 2.07, 0.17]} position={[0, 2.17, -0.18]} />
            </RigidBody>
            {level && (
              <>
                <PowerCrystal
                  position={[-0.6, 5.1, 0.2]}
                  collected={() => false}
                  scale={0.5}
                  dim={!progress.crystals.includes(level.id)}
                />
                <Gem position={[0.6, 5.0, 0.2]} owned={progress.gems.includes(level.id)} />
                {/* Level number studs on the dais. */}
                {Array.from({ length: level.index + 1 }, (_, i) => (
                  <mesh key={i} position={[(i - level.index / 2) * 0.45, 0.24, 0.9]}>
                    <sphereGeometry args={[0.12, 10, 8]} />
                    <meshBasicMaterial color={[1.6, 1.3, 0.5]} toneMapped={false} />
                  </mesh>
                ))}
              </>
            )}
          </group>
        );
      })}

      <ThirdPersonPlayer
        portals={portals}
        start={spawn.position}
        startYaw={spawn.yaw}
        boundary={WARP_ROOM_RADIUS - 0.8}
        cameraDistance={7}
        onNearPortal={onNearPortal}
        onEnterPortal={onEnterPortal}
        onHangChange={() => {}}
        onReady={onReady}
      />
    </>
  );
}
