import { CuboidCollider, RigidBody } from '@react-three/rapier';

interface PortalFrameColliderProps {
  position: [number, number, number];
  rotation?: [number, number, number];
}

export function PortalFrameCollider({
  position,
  rotation = [0, 0, 0],
}: PortalFrameColliderProps) {
  return (
    <RigidBody
      type='fixed'
      colliders={false}
      position={position}
      rotation={rotation}
    >
      <CuboidCollider args={[2.28, 0.14, 0.18]} position={[0, 1.56, 0]} />
      <CuboidCollider args={[2.28, 0.14, 0.18]} position={[0, -1.56, 0]} />
      <CuboidCollider args={[0.14, 1.7, 0.18]} position={[-2.14, 0, 0]} />
      <CuboidCollider args={[0.14, 1.7, 0.18]} position={[2.14, 0, 0]} />
    </RigidBody>
  );
}
