import { Painting } from './painting';
import { state } from '../utils/store';
import { Flex } from '@react-three/flex';
import { useThree } from '@react-three/fiber';
import { Bounds, useHelper } from '@react-three/drei';
import SelectToZoom from './selectToZoom';
import { useCallback, useRef } from 'react';
import { BoxHelper } from 'three';

const Gallery = ({ onReflow }: any) => {
  const flex = useRef<any>();
  const { viewport } = useThree();

  const handleReflow = useCallback(
    (w, h) => onReflow((state.pages = h / viewport.height + 5.5)),
    [onReflow, viewport.height]
  );
  const sizesRef = useRef<any>([]);
  useHelper(flex, BoxHelper, 'red');

  return (
    <Bounds fit clip>
      <SelectToZoom>
        <group ref={flex}>
          <Flex
            plane='xz'
            dir='column'
            position={[-viewport.width / 2, viewport.height / 2, 0]}
            size={[viewport.width, viewport.height, 0]}
            onReflow={handleReflow}
          >
            {state.content.map((props, i: number) => (
              <Painting
                key={i}
                onReflow={(w: number, h: number) => {
                  sizesRef.current[i] = h;
                  state.threshold = Math.max(
                    4,
                    (4 / (15.8 * 3)) *
                      sizesRef.current.reduce(
                        (acc: number, e: any) => acc + e,
                        0
                      )
                  );
                }}
                {...props}
              />
            ))}
          </Flex>
        </group>
      </SelectToZoom>
    </Bounds>
  );
};

export default Gallery;
