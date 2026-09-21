import { useEffect, useRef } from 'react';
import { RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier';
import { useWorld } from 'koota/react';
import { PlatformBody, PlatformMotion, SimulationTime } from '../gameplay/ecs/traits';
import { updatePlatforms } from '../gameplay/ecs/updatePlatforms';
import type { Tuple3 } from '../gameplay/collisionCourse';

export function PlatformSystem() {
  const world = useWorld();
  useEffect(() => { world.set(SimulationTime, { elapsed: 0 }); }, [world]);
  useBeforePhysicsStep(physics => updatePlatforms(world, physics.timestep));
  return null;
}

export function KinematicPlatform({ position, axis = 'x', distance = 0, speed = 1, spin = 0, color = '#5f91a4', size = [3.2, .35, 2.6] }: {
  position: Tuple3; axis?: 'x' | 'y' | 'z'; distance?: number; speed?: number; spin?: number; color?: string; size?: Tuple3;
}) {
  const world = useWorld();
  const body = useRef<RapierRigidBody>(null);
  const [x, y, z] = position;
  useEffect(() => {
    const entity = world.spawn(PlatformBody({ body: body.current }), PlatformMotion({ x, y, z, axis, distance, speed, spin }));
    return () => entity.destroy();
  }, [world, x, y, z, axis, distance, speed, spin]);
  return <RigidBody name={`platform-${axis}`} ref={body} type='kinematicPosition' colliders='cuboid' position={position} friction={1}>
    <mesh castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={.72} /></mesh>
  </RigidBody>;
}
