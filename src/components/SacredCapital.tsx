import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  TrimeshCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { buildCapitalEnvironment } from "../gameplay/capitalEnvironment";
import {
  capitalBosses,
  capitalBeacon,
  capitalNpcs,
  capitalTownGate,
  capitalLanterns,
  capitalLifts,
  capitalCaches,
  capitalShrines,
  capitalShortcut,
  capitalCathedralShortcut,
  type CapitalLiftId,
} from "../gameplay/capitalLayout";
import { stepCapitalLift, type CapitalLiftsState } from "../gameplay/capitalProgress";
import type { ParishProgress } from "../gameplay/ashenParish";
import type { ParishEncounter } from "../gameplay/parishEncounter";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { sunlight } from "../gameplay/sunlight";
import { CapitalSky } from "./CapitalSky";

function CapitalLift({
  id,
  states,
  resetVersion,
}: {
  id: CapitalLiftId;
  states: MutableRefObject<CapitalLiftsState>;
  resetVersion: number;
}) {
  const spec = capitalLifts.find((l) => l.id === id)!;
  const body = useRef<RapierRigidBody>(null);
  useEffect(() => {
    const y = states.current[id].y;
    body.current?.setTranslation({ x: spec.center[0], y: y - 0.3, z: spec.center[2] }, true);
    body.current?.setNextKinematicTranslation({ x: spec.center[0], y: y - 0.3, z: spec.center[2] });
  }, [id, states, spec, resetVersion]);
  useBeforePhysicsStep((world) => {
    const s = states.current[id];
    stepCapitalLift(s, world.timestep);
    body.current?.setNextKinematicTranslation({
      x: spec.center[0],
      y: s.y - 0.3,
      z: spec.center[2],
    });
  });
  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[spec.center[0], states.current[id].y - 0.3, spec.center[2]]}
      friction={1}
      name={`capital-${id}-lift`}
    >
      <CuboidCollider args={[3, 0.3, 3]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[6, 0.6, 6]} />
        <meshStandardMaterial color="#625e56" roughness={0.85} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 2.85, 1.5, 0]} castShadow>
          <boxGeometry args={[0.15, 3, 5.8]} />
          <meshStandardMaterial color="#404951" metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.45, 0.6, 0.9, 8]} />
        <meshStandardMaterial color="#bdab78" metalness={0.45} />
      </mesh>
    </RigidBody>
  );
}
function CapitalSeal({
  position,
  width = 9,
  yaw = 0,
}: {
  position: [number, number, number];
  width?: number;
  yaw?: number;
}) {
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[width / 2, 3, 0.25]} position={[0, 3, 0]} />
      </RigidBody>
      <mesh position={[0, 3, 0]}>
        <planeGeometry args={[width, 6]} />
        <meshBasicMaterial
          color="#c7e1e9"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
export const SacredCapital = memo(
  function SacredCapital({
    state,
    progress,
    lifts,
    resetVersion,
  }: {
    state: MutableRefObject<ParishEncounter>;
    progress: ParishProgress;
    lifts: MutableRefObject<CapitalLiftsState>;
    resetVersion: number;
    revision: string;
  }) {
    const environment = useMemo(() => buildCapitalEnvironment(), []);
    const sun = useRef<THREE.DirectionalLight>(null);
    const lanterns = useRef<(THREE.PointLight | null)[]>([]);
    const reduced = useReducedMotion();
    const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
      if (pending.current) clearTimeout(pending.current);
      return () => {
        pending.current = setTimeout(() => environment.dispose(), 0);
      };
    }, [environment]);
    useFrame(({ scene }, delta) => {
      environment.fogReveal.value = reduced
        ? progress.fogCleared
          ? 1
          : 0
        : THREE.MathUtils.damp(
            environment.fogReveal.value,
            progress.fogCleared ? 1 : 0,
            0.8,
            Math.min(delta, 0.05),
          );
      sunlight.fogColor.value.set("#adb3bf");
      sunlight.color.value.set("#cfdfeb");
      sunlight.direction.value.set(-0.6, 0.7, 0.4).normalize();
      if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(sunlight.fogColor.value);
      const c = state.current.combat;
      const nearest = [...capitalLanterns].sort(
        (a, b) =>
          Math.hypot(a[0] - c.playerX, a[1] - c.playerY, a[2] - c.playerZ) -
          Math.hypot(b[0] - c.playerX, b[1] - c.playerY, b[2] - c.playerZ),
      );
      lanterns.current.forEach((light, i) => {
        if (light) {
          const p = nearest[i];
          light.position.set(p[0], p[1] + 2.2, p[2]);
        }
      });
      if (sun.current) {
        sun.current.position.set(c.playerX - 30, c.playerY + 35, c.playerZ + 48);
        sun.current.target.position.set(c.playerX, c.playerY, c.playerZ);
        sun.current.target.updateMatrixWorld();
      }
    });
    return (
      <>
        <color attach="background" args={["#b58d70"]} />
        <CapitalSky />
        <fog attach="fog" args={["#adb3bf", 160, 700]} />
        <hemisphereLight args={["#a0b9d5", "#313541", 0.95]} />
        <directionalLight
          ref={sun}
          position={[-25, 65, 28]}
          intensity={2.5}
          color="#ffcf94"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-32}
          shadow-camera-right={32}
          shadow-camera-top={32}
          shadow-camera-bottom={-32}
          shadow-camera-far={100}
          shadow-bias={-0.0004}
        />
        <group name="sacred-capital">
          <primitive object={environment.root} dispose={null} />
        </group>
        <RigidBody type="fixed" colliders={false}>
          {environment.colliders.map((c, i) => (
            <TrimeshCollider
              key={i}
              args={[c.vertices, c.indices]}
              position={c.position}
              rotation={[0, c.yaw, 0]}
            />
          ))}
          {environment.solids.map((s, i) => (
            <CuboidCollider
              key={`solid:${i}`}
              args={[s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]}
              position={[s.position[0], s.position[1] + s.size[1] / 2, s.position[2]]}
              rotation={[0, s.yaw, 0]}
            />
          ))}
        </RigidBody>
        {!progress.cathedralFelled && (
          <CapitalSeal
            position={capitalBosses.cathedral.entry}
            width={capitalBosses.cathedral.entryWidth}
            yaw={capitalBosses.cathedral.yaw}
          />
        )}
        {[
          { id: "refuge" as const, gate: capitalShortcut },
          { id: "court" as const, gate: capitalCathedralShortcut },
        ]
          .filter(({ id }) => !progress[id])
          .map(({ id, gate }) => (
            <RigidBody
              key={id}
              type="fixed"
              colliders={false}
              position={gate.position}
              rotation={[0, gate.yaw, 0]}
            >
              <CuboidCollider args={[gate.width / 2, 2.5, 0.22]} position={[0, 2.5, 0]} />
              {Array.from(
                { length: Math.ceil(gate.width / 0.9) },
                (_, i) =>
                  -gate.width / 2 +
                  0.3 +
                  (i * (gate.width - 0.6)) / (Math.ceil(gate.width / 0.9) - 1),
              ).map((x) => (
                <mesh key={x} position={[x, 2.5, 0]} castShadow>
                  <boxGeometry args={[0.16, 5, 0.22]} />
                  <meshStandardMaterial color="#384552" metalness={0.7} roughness={0.5} />
                </mesh>
              ))}
              <mesh position={[0, 4.5, 0]} castShadow>
                <boxGeometry args={[gate.width, 0.22, 0.3]} />
                <meshStandardMaterial color="#807052" metalness={0.5} />
              </mesh>
            </RigidBody>
          ))}
        {!progress.caches.includes("town-key") && (
          <CapitalSeal position={capitalTownGate.position} width={6} />
        )}
        <group position={capitalBeacon.position} name="crown-beacon-switch">
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.65, 0.85, 1, 8]} />
            <meshStandardMaterial color="#6e6e68" />
          </mesh>
          <mesh position={[0, 1.25, 0]} rotation={[0, 0, progress.fogCleared ? -0.7 : 0.7]}>
            <boxGeometry args={[0.12, 1.3, 0.12]} />
            <meshStandardMaterial color="#c6b481" metalness={0.5} />
          </mesh>
          <mesh position={[0, 1.7, 0]}>
            <icosahedronGeometry args={[0.3, 1]} />
            <meshStandardMaterial
              color={progress.fogCleared ? "#89e5fa" : "#d5b96f"}
              emissive={progress.fogCleared ? "#39bee8" : "#bd7634"}
              emissiveIntensity={3}
            />
          </mesh>
        </group>
        {capitalNpcs.map((n) => (
          <RigidBody
            key={n.id}
            type="fixed"
            colliders={false}
            position={n.position}
            name={`capital-npc-${n.id}`}
          >
            <CuboidCollider args={[0.3, 0.9, 0.3]} position={[0, 0.9, 0]} />
            <mesh position={[0, 0.75, 0]} castShadow>
              <coneGeometry args={[0.42, 1.5, 8]} />
              <meshStandardMaterial color={n.id === "sage" ? "#5b7790" : "#706858"} />
            </mesh>
            <mesh position={[0, 1.7, 0]} castShadow>
              <sphereGeometry args={[0.23, 10, 8]} />
              <meshStandardMaterial color="#c4b390" />
            </mesh>
            <mesh position={[0.4, 0.9, 0]}>
              <cylinderGeometry args={[0.045, 0.06, 1.8, 6]} />
              <meshStandardMaterial color="#8e7a53" />
            </mesh>
          </RigidBody>
        ))}
        {!progress.finalFelled && (
          <CapitalSeal position={capitalBosses.colosseum.entry} width={8} />
        )}
        {!progress.fogCleared && (
          <CapitalSeal position={[26, 24, -29.33]} width={7} yaw={Math.atan2(24, 8)} />
        )}
        {capitalLifts.map((l) => (
          <CapitalLift key={l.id} id={l.id} states={lifts} resetVersion={resetVersion} />
        ))}
        {capitalCaches
          .filter((c) => !progress.caches.includes(c.id))
          .map((c) => (
            <mesh key={c.id} position={[c.position[0], c.position[1] + 0.65, c.position[2]]}>
              <icosahedronGeometry args={[0.24, 1]} />
              <meshStandardMaterial color="#efc994" emissive="#ffb661" emissiveIntensity={2.5} />
            </mesh>
          ))}
        {[0, 1].map((i) => (
          <pointLight
            key={`lantern:${i}`}
            ref={(v) => {
              lanterns.current[i] = v;
            }}
            color="#ffb36e"
            intensity={18}
            distance={14}
          />
        ))}
        {capitalShrines.map((s) => (
          <pointLight
            key={s.id}
            position={[s.position[0], s.position[1] + 2, s.position[2]]}
            color="#4cd5ea"
            intensity={12}
            distance={12}
          />
        ))}
      </>
    );
  },
  (a, b) => a.state === b.state && a.revision === b.revision && a.resetVersion === b.resetVersion,
);
