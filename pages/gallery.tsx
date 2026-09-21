import { GameCanvas } from '../components/GameCanvas';
import { useGame } from '../app/gameSettings';
import { useGameTimeout } from '../hooks/useGameTimeout';
import { Physics } from '@react-three/rapier';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExperienceHud } from '../components/ExperienceHud';
import { GalleryLabyrinth as GalleryWorld } from '../components/GalleryLabyrinth';
import { useDocumentMetadata } from '../hooks/useDocumentMetadata';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function GalleryLevel() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { paused } = useGame();
  const { schedule, cancel } = useGameTimeout();
  const [nearPortal, setNearPortal] = useState(false);
  const [portalImpact, setPortalImpact] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [hanging, setHanging] = useState(false);
  const [puzzleProgress, setPuzzleProgress] = useState(0);
  const transitionTimer = useRef<number | null>(null);
  const routeTimer = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();
  const markReady = useCallback(() => setReady(true), []);
  useDocumentMetadata('The collection | The painted forest');

  const returnToForest = useCallback(() => {
    if (transitionTimer.current) return;
    setPortalImpact(true);
    transitionTimer.current = schedule(() => {
      setLeaving(true);
      routeTimer.current = schedule(() => navigate('/', { state: { returnPortal: state?.fromPortal } }), 240);
    }, reducedMotion ? 40 : 620);
  }, [navigate, reducedMotion, schedule, state]);

  useEffect(() => {
    return () => {
      if (transitionTimer.current) cancel(transitionTimer.current);
      if (routeTimer.current) cancel(routeTimer.current);
    };
  }, [cancel]);

  return (
    <main className='experience'>
      <GameCanvas
        shadows='percentage'
        camera={{ position: [0, 3.9, 11.2], fov: 52 }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]} paused={paused}>
            <GalleryWorld
              nearPortal={nearPortal}
              portalImpact={portalImpact}
              onNearPortal={setNearPortal}
              onExit={returnToForest}
              onReady={markReady}
              onHangChange={setHanging}
              onPuzzleProgress={setPuzzleProgress}
            />
          </Physics>
        </Suspense>
      </GameCanvas>
      <ExperienceHud
        chapter='Beyond the frame'
        title='The collection'
        prompt={
          hanging
            ? undefined
            : nearPortal
              ? 'Jump through to return'
              : puzzleProgress === 5
                ? 'The painting is open'
                : undefined
        }
        leaving={leaving}
        ready={ready}
      />
    </main>
  );
}
