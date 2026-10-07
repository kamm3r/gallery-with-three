import { useEffect, useRef } from "react";
import {
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from "@react-three/rapier";
import { useWorld } from "koota/react";
import { PlatformBody, PlatformMotion, SimulationTime } from "../gameplay/ecs/traits";
import { updatePlatforms } from "../gameplay/ecs/updatePlatforms";
import type { Tuple3 } from "../gameplay/collisionCourse";

export function PlatformSystem() {
  const world = useWorld();
  useEffect(() => {
    world.set(SimulationTime, { elapsed: 0 });
  }, [world]);
  useBeforePhysicsStep((physics) => updatePlatforms(world, physics.timestep));
  return null;
}

const KINEMATIC_BLUE = "#3b6fe0";

export function KinematicPlatform({
  position,
  axis = "x",
  distance = 0,
  speed = 1,
  phase = 0,
  spin = 0,
  tiltAmp = 0,
  tiltSpeed = 1,
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
  shape?: "box" | "cylinder";
  radius?: number;
  color?: string;
  size?: Tuple3;
  name?: string;
}) {
  const world = useWorld();
  const body = useRef<RapierRigidBody>(null);
  const [x, y, z] = position;
  useEffect(() => {
    const entity = world.spawn(
      PlatformBody({ body: body.current }),
      PlatformMotion({ x, y, z, axis, distance, speed, phase, spin, tiltAmp, tiltSpeed }),
    );
    return () => entity.destroy();
  }, [world, x, y, z, axis, distance, speed, phase, spin, tiltAmp, tiltSpeed]);
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
      <mesh castShadow receiveShadow>
        {shape === "box" ? (
          <boxGeometry args={size} />
        ) : (
          <cylinderGeometry args={[radius, radius, size[1], 28]} />
        )}
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </RigidBody>
  );
}

function CuboidColliderAuto({ size }: { size: Tuple3 }) {
  return <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />;
}

function CylinderColliderAuto({ radius, height }: { radius: number; height: number }) {
  return <CylinderCollider args={[height / 2, radius]} />;
}
