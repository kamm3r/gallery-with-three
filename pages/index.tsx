import { Canvas } from '@react-three/fiber';
import React, { Suspense } from 'react';
import type { NextPage } from 'next';
// import { Painting } from '../components/painting';
import { OrbitControls, Plane } from '@react-three/drei';
// import { state } from './../utils/store';
// import { Flex, Box } from '@react-three/flex';
import Front from '../components/home';

const Home: NextPage = () => {
  return (
    <section className='h-screen w-screen'>
      <Canvas
        className='w-full h-full'
        shadows
        camera={{ position: [0, 2, 4], fov: 120 }}
      >
        <ambientLight />
        <pointLight position={[10, 10, 10]} />
        <Suspense fallback={null}>
          <Front />
        </Suspense>
        <OrbitControls />
        <Plane
          args={[100, 100]}
          position={[0, -1, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshPhongMaterial attach='material' color='yellow' />
        </Plane>
      </Canvas>
    </section>
  );
};

export default Home;
