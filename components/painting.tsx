import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { Box } from '@react-three/flex';
import { useRef } from 'react';
import HeightReporter from './HeightReporter';

type Gudz = {
  images: any;
  onReflow: any;
  left: boolean | any;
};

export const Painting = ({ images, onReflow, left = false }: Gudz) => {
  const mesh = useRef<THREE.Mesh>();
  const textures: any = useTexture(images);
  const boxProps = {
    centerAnchor: true,
    grow: 1,
    marginTop: 1,
    marginLeft: left * 1,
    marginRight: left! * 1,
    width: 'auto',
    height: 'auto',
    minWidth: 3,
    minHeight: 3,
    maxWidth: 6,
    maxHeight: 6,
  };
  return (
    <Box
      dir='column'
      align={left ? 'flex-start' : 'flex-end'}
      justify='flex-start'
      width='100%'
      height='auto'
      minHeight='100%'
    >
      <HeightReporter onReflow={onReflow} />
      <Box
        dir='row'
        width='100%'
        height='auto'
        justify={left ? 'flex-end' : 'flex-start'}
        margin={0}
        grow={1}
        wrap='wrap'
      >
        {textures.map((texture: any, i: number) => (
          <Box key={i} {...boxProps}>
            {(width, height) => (
              <mesh ref={mesh}>
                <boxGeometry args={[width, height, 0.5]} />
                <meshBasicMaterial map={texture} toneMapped={false} />
              </mesh>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};
