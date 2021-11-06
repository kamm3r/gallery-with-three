import { Canvas } from '@react-three/fiber';
import { Suspense, useState } from 'react';
import type { NextPage } from 'next';
import { OrbitControls, Plane } from '@react-three/drei';
import Front from '../components/home';
import { TwoColumn } from '../components/twoColumn';

const Home: NextPage = () => {
  const [, setPages] = useState(0);

  return (
    <section className='h-screen w-screen'>
      <Canvas shadows camera={{ position: [0, 4, 10], fov: 120 }}>
        <ambientLight />
        <pointLight position={[10, 10, 10]} />
        <Suspense fallback={null}>
          <Front onReflow={setPages} />
          {/* <TwoColumn /> */}
        </Suspense>
        <Plane
          args={[100, 100]}
          position={[0, -1, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshPhongMaterial attach='material' color='yellow' />
        </Plane>
        <OrbitControls />
      </Canvas>
    </section>
  );
};

export default Home;
