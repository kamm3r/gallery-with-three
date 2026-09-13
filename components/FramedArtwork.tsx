import { useTexture } from '@react-three/drei';
import type { ThreeElements } from '@react-three/fiber';

type FramedArtworkProps = ThreeElements['group'] & {
  image: string;
};

export function FramedArtwork({ image, ...props }: FramedArtworkProps) {
  const texture = useTexture(image);

  return (
    <group {...props}>
      <mesh castShadow>
        <boxGeometry args={[2.8, 3.5, 0.24]} />
        <meshStandardMaterial color='#241d17' roughness={0.75} />
      </mesh>
      <mesh position={[0, 0, 0.14]}>
        <planeGeometry args={[2.42, 3.1]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, -2.05, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[1.05, 0.6, 0.8]} />
        <meshStandardMaterial color='#6c675e' roughness={0.9} />
      </mesh>
    </group>
  );
}
