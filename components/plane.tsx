import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { usePlane } from '@react-three/cannon';
import poap from '/poap_profile.png';

const Plane = (props: JSX.IntrinsicElements['mesh']) => {
  const [ref] = usePlane(() => ({ rotation: [-Math.PI / 2, 0, 0], ...props }));
  const texture = useLoader(THREE.TextureLoader, poap);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

  return (
    <mesh ref={ref} receiveShadow>
      <planeGeometry args={[1000, 1000]} />
      <meshStandardMaterial
        map={texture}
        map-repeat={[240, 240]}
        color='green'
      />
    </mesh>
  );
};

export default Plane;
