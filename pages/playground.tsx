import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ExperienceHud } from '../components/ExperienceHud';
import { PlaygroundWorld } from '../components/PlaygroundWorld';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function PlaygroundLevel() {
  const router = useRouter();
  const [nearPortal, setNearPortal] = useState(false);
  const [portalImpact, setPortalImpact] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();
  const markReady = useCallback(() => setReady(true), []);

  const returnToForest = useCallback(() => {
    if (transitionTimer.current) return;
    setPortalImpact(true);
    transitionTimer.current = setTimeout(() => {
      setLeaving(true);
      routeTimer.current = setTimeout(() => void router.push('/'), 240);
    }, reducedMotion ? 40 : 620);
  }, [reducedMotion, router]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      if (routeTimer.current) clearTimeout(routeTimer.current);
    };
  }, []);

  return (
    <main className='experience'>
      <Head>
        <title>The proving grounds | The painted forest</title>
      </Head>
      <Canvas shadows camera={{ position: [0, 3.9, 12], fov: 52 }}>
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <PlaygroundWorld
              nearPortal={nearPortal}
              portalImpact={portalImpact}
              onNearPortal={setNearPortal}
              onExit={returnToForest}
              onReady={markReady}
            />
          </Physics>
        </Suspense>
      </Canvas>
      <ExperienceHud
        chapter='Movement study'
        title='The proving grounds'
        prompt={nearPortal ? 'Jump through to return' : undefined}
        leaving={leaving}
        ready={ready}
      />
    </main>
  );
}
