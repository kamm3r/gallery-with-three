import { useTexture } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';

type PortalPaintingProps = ThreeElements['group'] & {
  image: string;
  active?: boolean;
  onEnter?: () => void;
};

export function PortalPainting({
  image,
  active = false,
  onEnter,
  ...props
}: PortalPaintingProps) {
  const texture = useTexture(image);
  const glow = active ? 1.15 : 0.45;

  return (
    <group {...props}>
      <mesh position={[0, 0, -0.18]} castShadow>
        <boxGeometry args={[4.15, 3.25, 0.34]} />
        <meshStandardMaterial color='#51381f' roughness={0.72} />
      </mesh>
      <mesh position={[0, 0, 0.02]} castShadow onClick={onEnter}>
        <planeGeometry args={[3.56, 2.66]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.56, 0.12]} castShadow>
        <boxGeometry args={[4.55, 0.28, 0.26]} />
        <meshStandardMaterial color='#b78945' metalness={0.62} roughness={0.3} />
      </mesh>
      <mesh position={[0, -1.56, 0.12]} castShadow>
        <boxGeometry args={[4.55, 0.28, 0.26]} />
        <meshStandardMaterial color='#b78945' metalness={0.62} roughness={0.3} />
      </mesh>
      <mesh position={[-2.14, 0, 0.12]} castShadow>
        <boxGeometry args={[0.28, 3.4, 0.26]} />
        <meshStandardMaterial color='#b78945' metalness={0.62} roughness={0.3} />
      </mesh>
      <mesh position={[2.14, 0, 0.12]} castShadow>
        <boxGeometry args={[0.28, 3.4, 0.26]} />
        <meshStandardMaterial color='#b78945' metalness={0.62} roughness={0.3} />
      </mesh>
      <pointLight
        color='#e6bb71'
        intensity={active ? 24 : 9}
        distance={7}
        position={[0, 0.25, 2]}
      />
    </group>
  );
}
