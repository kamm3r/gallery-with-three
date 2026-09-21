import { CuboidCollider, RigidBody } from '@react-three/rapier';

interface PortalFrameColliderProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

export function PortalFrameCollider({
  position,
  rotation = [0, 0, 0],
  scale = 1,
}: PortalFrameColliderProps) {
  return (
    <RigidBody
      type='fixed'
      colliders={false}
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <CuboidCollider args={[2.88, 0.15, 0.18]} position={[0, 2.02, 0]} />
      <CuboidCollider args={[2.88, 0.15, 0.18]} position={[0, -2.02, 0]} />
      <CuboidCollider args={[0.15, 2.17, 0.18]} position={[-2.72, 0, 0]} />
      <CuboidCollider args={[0.15, 2.17, 0.18]} position={[2.72, 0, 0]} />
    </RigidBody>
  );
}
