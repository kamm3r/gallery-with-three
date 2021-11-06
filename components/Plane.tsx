import { BoxProps, usePlane } from '@react-three/cannon';

export const Plane = ({ ...props }: BoxProps) => {
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
    ...props,
  }));
  return (
    <mesh ref={ref} receiveShadow>
      <planeBufferGeometry args={[100, 100]} />
      <shadowMaterial attach='material' opacity={0.4} />
    </mesh>
  );
};
