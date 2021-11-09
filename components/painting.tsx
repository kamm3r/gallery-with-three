import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { Box } from '@react-three/flex';

export const Painting = ({ images }: any) => {
  const textures: any = useTexture(images);

  const boxProps = {
    centerAnchor: true,
    width: 'auto',
    height: 'auto',
    minWidth: 4.5,
    minHeight: 8,
    maxWidth: 9,
    maxHeight: 16,
    marginLeft: 10,
    marginRight: 10,
  };
  const smoxProps = {
    centerAnchor: true,
    width: 'auto',
    height: 'auto',
    minWidth: 16,
    minHeight: 9,
    maxWidth: 32,
    maxHeight: 27,
    // marginLeft: 10,
    // marginRight: 10,
  };

  return (
    <Box
      dir='row'
      width='100%'
      height='auto'
      justifyContent='space-around'
      align='center'
      wrap='wrap'
      castShadow
    >
      {textures.map((texture: THREE.Texture, i: number) => {
        return i < 8 ? (
          <Box grow={1} shrink={1} basis={100} key={i} {...boxProps} castShadow>
            {(width, height) => (
              <mesh castShadow>
                <boxGeometry args={[width, height, 0.5]} />
                <meshBasicMaterial map={texture} toneMapped={false} />
              </mesh>
            )}
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
                <meshBasicMaterial
                  map={texture}
                  color='black'
                  toneMapped={false}
                />
              </mesh>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
