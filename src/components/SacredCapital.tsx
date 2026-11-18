import { memo, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CuboidCollider,
  TrimeshCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
  type RapierCollider,
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
  capitalGardenGate,
  capitalBeaconSeal,
  type CapitalLiftId,
} from "../gameplay/capitalLayout";
import { stepCapitalLift, type CapitalLiftsState } from "../gameplay/capitalProgress";
import type { ParishProgress } from "../gameplay/ashenParish";
import type { ParishEncounter } from "../gameplay/parishEncounter";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useGame } from "../hooks/useGame";
import { sunlight } from "../gameplay/sunlight";
import { capitalLiftGeometry } from "../gameplay/capitalLiftGeometry";
import { CapitalSky } from "./CapitalSky";
import { playSound } from "../gameplay/sound";

/** How far below its place the ground city waits while the sky city floats. */
const GROUND_DROP = 240;
/** Seconds the sky city takes to settle onto the ground once the switch is thrown. */
const GROUND_SETTLE = 7;
import {
  capitalKitGeometry,
  capitalKitUv,
  type CapitalKitModel,
} from "../gameplay/capitalBuildingKit";

type KitMaterials = ReturnType<typeof buildCapitalEnvironment>["kitMaterials"];

/** Moving and interactive props are assembled from the same kit as the static city. */
function KitPiece({
  model,
  size,
  material,
  position,
  rotation,
}: {
  model: CapitalKitModel;
  size: readonly [number, number, number];
  material: THREE.Material;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const [w, h, d] = size;
  const geometry = useMemo(
    () => capitalKitUv(capitalKitGeometry(model, [w, h, d])),
    [model, w, h, d],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
    />
  );
}

function CapitalLift({
  id,
  states,
  resetVersion,
  kit,
}: {
  id: CapitalLiftId;
  states: MutableRefObject<CapitalLiftsState>;
  resetVersion: number;
  kit: KitMaterials;
}) {
  const spec = capitalLifts.find((l) => l.id === id)!;
  const body = useRef<RapierRigidBody>(null);
  const blockingColliders = useMemo(() => new Set<number>(), []);
  const colliderRefs = useRef<Array<RapierCollider | null>>([]);
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
      rotation={[0, spec.yaw, 0]}
      name={`capital-${id}-lift`}
      userData={{ rideBlockingColliders: blockingColliders }}
    >
      {capitalLiftGeometry.map(({ size, position }, index) => (
        <group key={index}>
          <CuboidCollider
            ref={(collider) => {
              const previous = colliderRefs.current[index];
              if (previous) blockingColliders.delete(previous.handle);
              colliderRefs.current[index] = collider;
              if (index > 0 && collider) blockingColliders.add(collider.handle);
            }}
            args={[size[0] / 2, size[1] / 2, size[2] / 2]}
            position={position}
          />
          <KitPiece
            model="block"
            size={size}
            position={position}
            material={index === 0 ? kit.floor : kit.wall}
          />
        </group>
      ))}
      <KitPiece model="post" size={[1.2, 0.9, 1.2]} material={kit.floor} position={[0, 0.3, 0]} />
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
        <boxGeometry args={[width, 6, 0.05]} />
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
    const environment = useMemo(() => {
      const built = buildCapitalEnvironment();
      // A run resumed past the switch starts with the fog already gone.
      built.fogReveal.value = progress.fogCleared ? 1 : 0;
      return built;
      // Built once per scene; later fog changes are eased in the frame loop.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const kit = environment.kitMaterials;
    // PS2 style gives the city low-resolution, shading-baked, dithered surfaces.
    const { settings } = useGame();
    useEffect(() => environment.setPs2(settings.ps2Style), [environment, settings.ps2Style]);
    const sun = useRef<THREE.DirectionalLight>(null);
    const lanterns = useRef<(THREE.PointLight | null)[]>([]);
    const reduced = useReducedMotion();
    const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
    // 0 while the sky city floats, 1 once it has come down onto the ground city.
    const settled = useRef(progress.fogCleared ? 1 : 0);
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
      // The switch brings the sky city down: seen from the sky city, the missing ground
      // city rises out of the depths and locks beneath it, as the camera shakes.
      const target = progress.fogCleared ? 1 : 0;
      if (reduced) settled.current = target;
      else if (settled.current !== target) {
        if (settled.current === 0 && target === 1) playSound("rumble", { intensity: 1 });
        const step = Math.min(delta, 0.05) / GROUND_SETTLE;
        settled.current =
          target > settled.current
            ? Math.min(target, settled.current + step)
            : Math.max(target, settled.current - step);
        // The shake only decays during boss fights, so it is set outright and cleared here.
        if (target === 1)
          state.current.combat.shake = settled.current < 1 ? 0.35 * (1 - settled.current) : 0;
      }
      const t = settled.current,
        eased = 1 - (1 - t) ** 3;
      environment.ground.position.y = -GROUND_DROP * (1 - eased);
      environment.ground.visible = t > 0;
      // The reference's golden hour: a low sun in the south-west over a warm haze.
      sunlight.fogColor.value.set("#d9aa8e");
      sunlight.color.value.set("#ffcf9e");
      sunlight.direction.value.set(-0.62, 0.3, 0.72).normalize();
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
        sun.current.position.set(c.playerX - 40, c.playerY + 19, c.playerZ + 46);
        sun.current.target.position.set(c.playerX, c.playerY, c.playerZ);
        sun.current.target.updateMatrixWorld();
      }
    });
    return (
      <>
        <color attach="background" args={["#e3b08f"]} />
        <CapitalSky />
        <fog attach="fog" args={["#d9aa8e", 200, 880]} />
        <hemisphereLight args={["#f4d3b4", "#4f4250", 1.05]} />
        <directionalLight
          ref={sun}
          position={[-25, 65, 28]}
          intensity={3.6}
          color="#ffb47c"
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
          { id: "garden" as const, gate: capitalGardenGate },
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
              {id === "court" ? (
                <>
                  <KitPiece model="arch-panel" size={[gate.width, 5, 0.28]} material={kit.iron} />
                  <KitPiece
                    model="block"
                    size={[0.08, 4.6, 0.12]}
                    material={kit.floor}
                    position={[0, 2.3, 0.2]}
                  />
                  {[-0.65, 0.65].map((x) => (
                    <KitPiece
                      key={x}
                      model="ring"
                      size={[0.45, 0.08, 0.45]}
                      material={kit.iron}
                      position={[x, 2.2, 0.23]}
                      rotation={[Math.PI / 2, 0, 0]}
                    />
                  ))}
                </>
              ) : (
                Array.from(
                  { length: Math.ceil(gate.width / 0.9) },
                  (_, i) =>
                    -gate.width / 2 +
                    0.3 +
                    (i * (gate.width - 0.6)) / (Math.ceil(gate.width / 0.9) - 1),
                ).map((x) => (
                  <KitPiece
                    key={x}
                    model="block"
                    size={[0.16, 5, 0.22]}
                    material={kit.iron}
                    position={[x, 2.5, 0]}
                  />
                ))
              )}
              {id !== "court" && (
                <KitPiece
                  model="block"
                  size={[gate.width, 0.22, 0.3]}
                  material={kit.floor}
                  position={[0, 4.5, 0]}
                />
              )}
            </RigidBody>
          ))}
        {!progress.caches.includes("town-key") && (
          <CapitalSeal
            position={capitalTownGate.position}
            width={capitalTownGate.width}
            yaw={capitalTownGate.yaw}
          />
        )}
        <group position={capitalBeacon.position} name="crown-beacon-switch">
          <KitPiece model="crate" size={[1.4, 1, 1.4]} material={kit.wall} />
          <KitPiece
            model="block"
            size={[0.12, 1.3, 0.12]}
            material={kit.floor}
            position={[0, 1.25, 0]}
            rotation={[0, 0, progress.fogCleared ? -0.7 : 0.7]}
          />
          <KitPiece
            model="block"
            size={[0.45, 0.45, 0.45]}
            material={progress.fogCleared ? kit.marker : kit.glow}
            position={[0, 1.7, 0]}
            rotation={[Math.PI / 4, 0, Math.PI / 4]}
          />
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
            <KitPiece
              model="crate"
              size={[0.6, 1.5, 0.6]}
              material={n.id === "sage" ? kit.wall : kit.floor}
            />
            <KitPiece
              model="crate"
              size={[0.42, 0.42, 0.42]}
              material={kit.floor}
              position={[0, 1.5, 0]}
            />
            <KitPiece
              model="post"
              size={[0.2, 1.8, 0.2]}
              material={kit.iron}
              position={[0.4, 0, 0]}
            />
          </RigidBody>
        ))}
        {!progress.finalFelled && (
          <CapitalSeal
            position={capitalBosses.colosseum.entry}
            width={capitalBosses.colosseum.entryWidth}
            yaw={capitalBosses.colosseum.yaw}
          />
        )}
        {!progress.fogCleared && (
          <CapitalSeal
            position={capitalBeaconSeal.position}
            width={capitalBeaconSeal.width}
            yaw={capitalBeaconSeal.yaw}
          />
        )}
        {capitalLifts.map((l) => (
          <CapitalLift key={l.id} id={l.id} states={lifts} resetVersion={resetVersion} kit={kit} />
        ))}
        {capitalCaches
          .filter((c) => !progress.caches.includes(c.id))
          .map((c) => (
            <KitPiece
              key={c.id}
              model="block"
              size={[0.36, 0.36, 0.36]}
              material={kit.glow}
              position={[c.position[0], c.position[1] + 0.65, c.position[2]]}
              rotation={[Math.PI / 4, 0, Math.PI / 4]}
            />
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
