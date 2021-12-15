import { Canvas } from '@react-three/fiber';
import { Suspense, useState } from 'react';
import type { NextPage } from 'next';
import { OrbitControls, Plane, Sky, useTexture } from '@react-three/drei';
import Gallery from '../components/gallery';

const Home: NextPage = () => {
  const [, setPages] = useState(0);

  return (
    <section className='h-screen w-screen'>
      <Canvas shadows camera={{ position: [0, 0, 10], fov: 120 }}>
        <Sky sunPosition={[7, 5, 1]} />
        <pointLight intensity={2} position={[7, 5, 1]} castShadow />
        <Suspense fallback={null}>
          <Gallery onReflow={setPages} />
        </Suspense>
        <Plane
          args={[300, 300, 0]}
          position={[0, -4, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <shadowMaterial attach='material' opacity={0.4} />
        </Plane>
        <OrbitControls
          makeDefault
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 1.75}
        />
      </Canvas>
    </section>
  );
};
useTexture.preload('/assets/text.jpg');
useTexture.preload('/assets/sweesh.jpg');
useTexture.preload('/assets/hands.jpg');
useTexture.preload('/assets/mankey.jpg');
useTexture.preload('/assets/oilpainting.jpg');
useTexture.preload('/assets/plaster.jpg');
useTexture.preload('/assets/tree.jpg');
useTexture.preload('/assets/fieldhouse.jpg');

export default Home;
