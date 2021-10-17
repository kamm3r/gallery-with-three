import * as THREE from 'three';
import { Painting } from '../components/painting';
import state from './../utils/store';
import { Flex } from '@react-three/flex';
import { useRef } from 'react';
import { useThree } from '@react-three/fiber';

const Front = () => {
  const group = useRef<THREE.Group>(null!);
  const { viewport, size } = useThree();
  const sizesRef = useRef<any>([]);

  return (
    <group ref={group}>
      <Flex
        dir='column'
        position={[-viewport.width / 2, viewport.height / 2, 0]}
        size={[viewport.width, viewport.height, 0]}
      >
        {state.content.map((props, i: number) => (
          <Painting
            key={i}
            left={!(i % 2)}
            onReflow={(w: number, h: number) => {
              sizesRef.current[i] = h;
              state.threshold = Math.max(
                4,
                (4 / (15.8 * 3)) *
                  sizesRef.current.reduce((acc: any, e: any) => acc + e, 0)
              );
            }}
            {...props}
          />
        ))}
      </Flex>
    </group>
  );
};

export default Front;
