import { useFrame } from '@react-three/fiber';
import {
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  advanceSealPuzzle,
  SEAL_ORDER,
  type SealName,
} from '../gameplay/sealPuzzle';
import { useReducedMotion } from '../hooks/useReducedMotion';

const SEALS: Array<{
  name: SealName;
  color: string;
  position: [number, number, number];
}> = [
  { name: 'moon', color: '#7896aa', position: [-3.5, 0.08, 1.8] },
  { name: 'sun', color: '#d5a94d', position: [3.5, 0.08, -1.5] },
  { name: 'leaf', color: '#83a36b', position: [-3.5, 0.08, -5.2] },
];

const SEAL_COLORS: Record<SealName, string> = {
  sun: '#d5a94d',
  leaf: '#83a36b',
  moon: '#7896aa',
};

function SealMark({ name, color }: { name: SealName; color: string }) {
  if (name === 'moon') {
    return (
      <mesh position={[0, 0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.07, 8, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} />
      </mesh>
    );
  }
  if (name === 'leaf') {
    return (
      <mesh position={[0, 0.11, 0]} rotation={[0, Math.PI / 4, 0]} scale={[0.72, 1, 1]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} />
      </mesh>
    );
  }
  return (
    <mesh position={[0, 0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.2, 0.2, 0.12, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} />
    </mesh>
  );
}

function PuzzleGate({ solved }: { solved: boolean }) {
  const body = useRef<RapierRigidBody>(null);
  const unlockedAt = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  useFrame((state) => {
    if (!solved) return;
    if (unlockedAt.current === null) {
      unlockedAt.current = state.clock.elapsedTime;
    }
    const age = state.clock.elapsedTime - unlockedAt.current;
    const progress = reducedMotion ? 1 : Math.min(age / 0.5, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    body.current?.setNextKinematicTranslation({
      x: 0,
      y: THREE.MathUtils.lerp(2.2, -2.2, eased),
      z: 12.2,
    });
  });

  return (
    <RigidBody
      ref={body}
      type='kinematicPosition'
      colliders='cuboid'
      position={[0, 2.2, 12.2]}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[4.9, 3.45, 0.34]} />
        <meshStandardMaterial color='#4e554a' roughness={0.96} />
      </mesh>
      {SEAL_ORDER.map((seal, index) => (
        <group key={seal} position={[(index - 1) * 1.05, 0, -0.2]} scale={0.7}>
          <SealMark name={seal} color={SEAL_COLORS[seal]} />
        </group>
      ))}
    </RigidBody>
  );
}

interface GallerySealPuzzleProps {
  onProgressChange: (progress: number) => void;
}

export function GallerySealPuzzle({
  onProgressChange,
}: GallerySealPuzzleProps) {
  const [progress, setProgress] = useState(0);
  const solved = progress === SEAL_ORDER.length;

  useEffect(() => {
    onProgressChange(progress);
  }, [onProgressChange, progress]);

  const pressSeal = useCallback((seal: SealName) => {
    setProgress((current) => advanceSealPuzzle(current, seal));
  }, []);

  return (
    <>
      <group position={[0, 0, 6.7]}>
        <RigidBody type='fixed' colliders='cuboid'>
          <mesh castShadow receiveShadow position={[0, 0.48, 0]}>
            <boxGeometry args={[4.3, 0.96, 1.2]} />
            <meshStandardMaterial color='#656959' roughness={0.94} />
          </mesh>
        </RigidBody>
        {SEAL_ORDER.map((seal, index) => {
          const lit = progress > index;
          const color = SEAL_COLORS[seal];
          return (
            <group key={seal} position={[(index - 1) * 1.15, 1.08, 0]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.25, 0.33, 0.75, 12]} />
                <meshStandardMaterial color='#3f433a' roughness={0.88} />
              </mesh>
              <mesh position={[0, 0.48, 0]}>
                <sphereGeometry args={[0.18, 12, 8]} />
                <meshStandardMaterial
                  color={lit ? color : '#282c27'}
                  emissive={lit ? color : '#000000'}
                  emissiveIntensity={lit ? 3.2 : 0}
                />
              </mesh>
              {lit && (
                <pointLight color={color} intensity={8} distance={3.5} />
              )}
              <group position={[0, 0.58, -0.27]} scale={0.55}>
                <SealMark name={seal} color={color} />
              </group>
            </group>
          );
        })}
      </group>

      {SEALS.map((seal) => (
        <RigidBody
          key={seal.name}
          type='fixed'
          colliders={false}
          position={seal.position}
        >
          <CuboidCollider
            sensor
            args={[0.72, 0.16, 0.72]}
            onIntersectionEnter={() => pressSeal(seal.name)}
          />
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.76, 0.86, 0.16, 20]} />
            <meshStandardMaterial
              color={seal.color}
              emissive={seal.color}
              emissiveIntensity={0.16}
              roughness={0.8}
            />
          </mesh>
          <SealMark name={seal.name} color='#ede4c8' />
        </RigidBody>
      ))}

      <PuzzleGate solved={solved} />
    </>
  );
}
