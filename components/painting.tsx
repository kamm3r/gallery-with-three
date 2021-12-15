import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { Box } from '@react-three/flex';
import { boxProps, smoxProps } from '../utils/store';
import { Description } from './Description';
import { useState } from 'react';

export const Painting = ({ images }: any) => {
  const [text, setText] = useState(false);
  const textures: any = useTexture(images);

  return (
    <Box
      dir='row'
      width='100%'
      height='auto'
      justifyContent='space-around'
      align='center'
      wrap='wrap'
    >
      {textures.map((texture: THREE.Texture, i: number) => {
        return i < 8 ? (
          <Box dir='column' justify='center' align='center' wrap='wrap'>
            <Box
              grow={1}
              shrink={1}
              basis={100}
              marginLeft={1}
              key={i}
              {...boxProps}
            >
              {(width, height) => (
                <mesh onClick={() => setText(!text)}>
                  <boxGeometry args={[width, height, 0.5]} />
                  <meshBasicMaterial map={texture} toneMapped={false} />
                </mesh>
              )}
            </Box>
            {text ? <Description /> : ''}
          </Box>
        ) : (
          <Box
            grow={1}
            shrink={1}
            basis={100}
            key={i}
            justify='center'
            {...smoxProps}
          >
            {(width, height) => (
              <mesh onClick={() => (window.location.href = '/pageTwo')}>
                <boxGeometry args={[width, height, 0.5]} />
                <meshStandardMaterial attach='material' color='black' />
              </mesh>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
