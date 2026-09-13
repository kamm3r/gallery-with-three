import { Canvas } from '@react-three/fiber';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ExperienceHud } from '../components/ExperienceHud';
import { GalleryWorld } from '../components/GalleryWorld';

export default function GalleryLevel() {
  const router = useRouter();
  const [nearPortal, setNearPortal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markReady = useCallback(() => setReady(true), []);

  const returnToForest = useCallback(() => {
    if (transitionTimer.current) return;
    setLeaving(true);
    transitionTimer.current = setTimeout(() => void router.push('/'), 240);
  }, [router]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, []);

  return (
    <main className='experience'>
      <Head><title>The collection | The painted forest</title></Head>
      <Canvas shadows camera={{ position: [0, 4, 13], fov: 52 }}>
        <Suspense fallback={null}>
          <GalleryWorld
            nearPortal={nearPortal}
            onNearPortal={setNearPortal}
            onExit={returnToForest}
            onReady={markReady}
          />
        </Suspense>
      </Canvas>
      <ExperienceHud
        chapter='Beyond the frame'
        title='The collection'
        prompt={nearPortal ? 'Walk through to return' : undefined}
        leaving={leaving}
        ready={ready}
      />
      <button className='return-link' type='button' onClick={returnToForest}>
        Return to the forest
      </button>
    </main>
  );
}
