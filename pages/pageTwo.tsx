import { Physics } from '@react-three/cannon';
import { PointerLockControls, Sky } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { NextPage } from 'next';
import { Suspense } from 'react';
import { Casual } from '../components/Casual_Male';
import { Help } from '../components/Help';
import { Plane } from '../components/Plane';
import { Player } from '../components/player';
import Tree from '../components/Tree';
import Wizard from '../components/Wizard';

const PageTwo: NextPage = () => {
  return (
    <section className='h-screen w-screen'>
      <Canvas
        className='w-full h-full'
        camera={{ fov: 90 }}
        shadows
        gl={{ alpha: false }}
      >
        <Sky
          distance={450000}
          sunPosition={[100, 20, 100]}
          inclination={0}
          azimuth={0.25}
        />
        <ambientLight intensity={0.3} />
        <pointLight castShadow intensity={0.8} position={[100, 100, 100]} />
        <Physics gravity={[0, -30, 0]}>
          <Suspense fallback={null}>
            <Tree scale={2} position={[10, 0, 2]} />
            <Tree scale={3} position={[3, 0, -5]} />
            <Wizard scale={1} position={[10, 0, -5]} />
            <Casual scale={1} position={[6, 0, -2]} />
            <Player scale={2} position={[0, 5, 0]} />
          </Suspense>
          <Plane />
        </Physics>
        <PointerLockControls />
      </Canvas>
      <Help />
    </section>
  );
};

export default PageTwo;
