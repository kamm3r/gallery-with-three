import { useTexture } from '@react-three/drei';
import { Box } from '@react-three/flex';

export const BigPainting = () => {
  const texture = useTexture({ map: '/assets/tree.jpg' });
  const boxProps = {
    centerAnchor: true,
    with: 'auto',
    height: 'auto',
    minWidth: 6,
    minHeight: 8,
    maxWidth: 12,
    maxHeight: 16,
  };

  return (
    <Box {...boxProps}>
      {(width, height) => (
        <mesh>
          <boxGeometry args={[width, height, 0.5]} />
          <meshBasicMaterial {...texture} toneMapped={false} />
        </mesh>
      )}
    </Box>
  );
};
