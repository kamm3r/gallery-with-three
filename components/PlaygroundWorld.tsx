import { Sky } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useRef } from 'react';
import * as THREE from 'three';
import { PortalFrameCollider } from './PortalFrameCollider';
import { PortalPainting } from './PortalPainting';
import { ThirdPersonPlayer } from './ThirdPersonPlayer';

interface PlaygroundWorldProps {
  nearPortal: boolean;
  portalImpact: boolean;
  onNearPortal: (near: boolean) => void;
  onExit: () => void;
  onReady: () => void;
}

interface MovingPlatformProps {
  position: [number, number, number];
  axis: 'x' | 'y';
  distance: number;
  speed: number;
  color: string;
}

function MovingPlatform({
  position,
  axis,
  distance,
  speed,
  color,
}: MovingPlatformProps) {
  const body = useRef<RapierRigidBody>(null);

  useFrame((state) => {
    const offset = Math.sin(state.clock.elapsedTime * speed) * distance;
    body.current?.setNextKinematicTranslation({
      x: position[0] + (axis === 'x' ? offset : 0),
      y: position[1] + (axis === 'y' ? offset : 0),
      z: position[2],
    });
  });

  return (
    <RigidBody
      ref={body}
      type='kinematicPosition'
      colliders='cuboid'
      position={position}
      friction={1}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.35, 2.6]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
    </RigidBody>
  );
}

const ramps = [
  { x: -6.5, angle: 10, color: '#6681a3' },
  { x: 0, angle: 20, color: '#8a6f9f' },
  { x: 6.5, angle: 35, color: '#aa6b62' },
];

export function PlaygroundWorld({
  nearPortal,
  portalImpact,
  onNearPortal,
  onExit,
  onReady,
}: PlaygroundWorldProps) {
  return (
    <>
      <color attach='background' args={['#b9cad3']} />
      <fog attach='fog' args={['#b9cad3', 24, 48]} />
      <Sky distance={450000} sunPosition={[5, 7, 3]} turbidity={5} rayleigh={2} />
      <hemisphereLight args={['#edf4f0', '#3a4650', 1.7]} />
      <directionalLight
        castShadow
        color='#fff0ce'
        intensity={2.3}
        position={[-8, 16, 8]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />

      <RigidBody type='fixed' colliders={false}>
        <CuboidCollider args={[18, 0.3, 15]} position={[0, -0.3, 0]} />
        <mesh position={[0, -0.3, 0]} receiveShadow>
          <boxGeometry args={[36, 0.6, 30]} />
          <meshStandardMaterial color='#667b74' roughness={0.95} />
        </mesh>
      </RigidBody>

      {ramps.map(({ x, angle, color }) => {
        const radians = THREE.MathUtils.degToRad(angle);
        const rise = Math.sin(radians) * 6;
        return (
          <group key={angle}>
            <RigidBody
              type='fixed'
              colliders='cuboid'
              position={[x, rise / 2 - 0.1, 3]}
              rotation={[radians, 0, 0]}
              friction={1}
            >
              <mesh castShadow receiveShadow>
                <boxGeometry args={[3.2, 0.24, 6]} />
                <meshStandardMaterial color={color} roughness={0.82} />
              </mesh>
            </RigidBody>
            <RigidBody
              type='fixed'
              colliders='cuboid'
              position={[x, rise - 0.13, -0.8]}
            >
              <mesh castShadow receiveShadow>
                <boxGeometry args={[3.2, 0.3, 1.6]} />
                <meshStandardMaterial color={color} roughness={0.82} />
              </mesh>
            </RigidBody>
          </group>
        );
      })}

      <group position={[-10.5, 0, -4]}>
        {Array.from({ length: 7 }, (_, index) => (
          <RigidBody
            key={index}
            type='fixed'
            colliders='cuboid'
            position={[0, 0.08 + index * 0.09, -index * 0.68]}
            friction={1}
          >
            <mesh castShadow receiveShadow>
              <boxGeometry args={[3.4, 0.16 + index * 0.18, 0.7]} />
              <meshStandardMaterial color='#7d8d9a' roughness={0.86} />
            </mesh>
          </RigidBody>
        ))}
      </group>

      <MovingPlatform
        position={[-4.5, 1.1, -6.5]}
        axis='y'
        distance={0.9}
        speed={1.25}
        color='#d49b58'
      />
      <MovingPlatform
        position={[4.5, 1.4, -6.5]}
        axis='x'
        distance={2.4}
        speed={0.85}
        color='#5f91a4'
      />

      {[-6, -2, 2, 6].map((x, index) => (
        <RigidBody
          key={x}
          type='fixed'
          colliders='cuboid'
          position={[x, 0.45 + index * 0.38, -11]}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2.5, 0.9 + index * 0.76, 2.5]} />
            <meshStandardMaterial color='#586971' roughness={0.9} />
          </mesh>
        </RigidBody>
      ))}

      <RigidBody type='fixed' colliders='cuboid' position={[12.5, 1.6, -3]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.8, 3.2, 8]} />
          <meshStandardMaterial color='#40545c' roughness={0.88} />
        </mesh>
      </RigidBody>

      <PortalPainting
        image='/assets/plaster.jpg'
        position={[0, 2.2, 13.3]}
        rotation={[0, Math.PI, 0]}
        active={nearPortal || portalImpact}
        impact={portalImpact}
      />
      <PortalFrameCollider
        position={[0, 2.2, 13.3]}
        rotation={[0, Math.PI, 0]}
      />
      <ThirdPersonPlayer
        start={[0, 0, 7.2]}
        portals={[{ id: 'forest', position: [0, 0, 13.3] }]}
        bounds={[17, 14]}
        cameraDistance={4.8}
        onNearPortal={(portalId) => onNearPortal(Boolean(portalId))}
        onEnterPortal={() => onExit()}
        onReady={onReady}
      />
    </>
  );
}
