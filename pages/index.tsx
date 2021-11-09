import { Canvas } from '@react-three/fiber';
import { Suspense, useState } from 'react';
import type { NextPage } from 'next';
import { OrbitControls, Plane, Sky } from '@react-three/drei';
import Gallery from '../components/gallery';
import { TwoColumn } from '../components/twoColumn';

const Home: NextPage = () => {
  const [, setPages] = useState(0);

  return (
    <section className='h-screen w-screen'>
      <Canvas shadows camera={{ position: [0, 0, 10], fov: 120 }}>
        <Sky sunPosition={[7, 5, 1]} />
        <pointLight intensity={2} position={[7, 5, 1]} castShadow />
        <Suspense fallback={null}>
          <Gallery onReflow={setPages} />
          {/* <TwoColumn /> */}
        </Suspense>
        <Plane
          args={[300, 300, 0]}
          position={[0, -4, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          {/* <meshPhongMaterial attach='material' color='yellow' /> */}
          <shadowMaterial attach='material' opacity={0.4} />
        </Plane>
        <OrbitControls />
      </Canvas>
    </section>
  );
};

export default Home;

// enableRotate={false}
