import { Vector3, type Mesh } from "three";
import { SceneNodeContext } from "./SceneObject";
import { useContext, useEffect, useMemo, useRef } from "react";
import {
  CuboidCollider,
  ConvexHullCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useWorld } from "koota/react";
import { PlatformBody, PlatformMotion, SimulationTime } from "../gameplay/ecs/traits";
import { updatePlatforms } from "../gameplay/ecs/updatePlatforms";
import type { Tuple3 } from "../gameplay/collisionCourse";
import { playgroundMaterial, unitGeometry } from "../gameplay/playgroundResources";

export function PlatformSystem() {
  const world = useWorld();
  useEffect(() => {
    world.set(SimulationTime, { elapsed: 0 });
  }, [world]);
  useBeforePhysicsStep((physics) => updatePlatforms(world, physics.timestep));
  return null;
}

const KINEMATIC_BLUE = "#3b6fe0";
const MATERIAL_NAMES: Record<string, string> = {
  [KINEMATIC_BLUE]: "Kinematic blue",
  "#e09543": "Animated orange",
  "#d63c2f": "Sweeper red",
};

export function KinematicPlatform({
  position,
  axis = "x",
  distance = 0,
  speed = 1,
  phase = 0,
  spin = 0,
  tiltAmp = 0,
  tiltSpeed = 1,
  orbitRadius = 0,
  orbitSpeed = 0,
  shape = "box",
  radius = 4,
  color = KINEMATIC_BLUE,
  size = [3.2, 0.35, 2.6],
  name,
}: {
  position: Tuple3;
  axis?: "x" | "y" | "z";
  distance?: number;
  speed?: number;
  phase?: number;
  spin?: number;
  /** Pitch oscillation amplitude in radians (animated decks). */
  tiltAmp?: number;
  tiltSpeed?: number;
  /** Circle the authored position at this radius (m) and angular speed (rad/s). */
  orbitRadius?: number;
  orbitSpeed?: number;
  shape?: "box" | "cylinder";
  radius?: number;
  color?: string;
  size?: Tuple3;
  name?: string;
}) {
  const world = useWorld();
  const authored = useContext(SceneNodeContext);
  const pathDistance = distance * (authored?.scale[axis === "x" ? 0 : axis === "y" ? 1 : 2] ?? 1);
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<Mesh>(null);
  const [x, y, z] = position;
  useEffect(() => {
    const origin = body.current?.translation() ?? { x, y, z };
    const orientation = body.current?.rotation() ?? { x: 0, y: 0, z: 0, w: 1 };
    const scaledDistance = visual.current
      ? distance *
        visual.current
          .getWorldScale(new Vector3())
          .getComponent(axis === "x" ? 0 : axis === "y" ? 1 : 2)
      : pathDistance;
    const entity = world.spawn(
      PlatformBody({ body: body.current }),
      PlatformMotion({
        ...origin,
        qx: orientation.x,
        qy: orientation.y,
        qz: orientation.z,
        qw: orientation.w,
        axis,
        distance: scaledDistance,
        speed,
        phase,
        spin,
        tiltAmp,
        tiltSpeed,
        orbitRadius,
        orbitSpeed,
      }),
    );
    return () => entity.destroy();
  }, [
    world,
    x,
    y,
    z,
    axis,
    distance,
    pathDistance,
    speed,
    phase,
    spin,
    tiltAmp,
    tiltSpeed,
    orbitRadius,
    orbitSpeed,
  ]);
  return (
    <RigidBody
      name={name ?? `platform-${axis}`}
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={position}
      friction={1}
    >
      {shape === "box" ? (
        <CuboidColliderAuto size={size} />
      ) : (
        <CylinderColliderAuto radius={radius} height={size[1]} />
      )}
      <mesh
        name="platform-mesh"
        geometry={shape === "box" ? unitGeometry.box : unitGeometry.disc}
        material={playgroundMaterial(
          MATERIAL_NAMES[color.toLowerCase()] ?? `Platform ${color}`,
          color,
          { roughness: 0.6 },
        )}
        scale={shape === "box" ? size : [radius * 2, size[1], radius * 2]}
        castShadow
        receiveShadow
        dispose={null}
      />
    </RigidBody>
  );
}

function CuboidColliderAuto({ size }: { size: Tuple3 }) {
  return <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />;
}

function CylinderColliderAuto({ radius, height }: { radius: number; height: number }) {
  const points = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: 56 }, (_, i) => {
          const angle = ((i % 28) / 28) * Math.PI * 2;
          return [
            Math.cos(angle) * radius,
            i < 28 ? -height / 2 : height / 2,
            Math.sin(angle) * radius,
          ];
        }).flat(),
      ),
    [radius, height],
  );
  return <ConvexHullCollider args={[points]} />;
}
