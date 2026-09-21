import { Canvas, useThree, type CanvasProps } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { useGame } from '../app/gameSettings';
import { WorldProvider } from 'koota/react';
import { runtimeWorld } from '../gameplay/ecs/world';
import { RuntimeSystems } from './RuntimeSystems';

function PauseRenderLoop() {
  const { paused } = useGame();
  const clock = useThree((state) => state.clock);
  const advance = useThree((state) => state.advance);
  useLayoutEffect(() => {
    if (paused) return;
    // Drive the whole scene with game time. No frames or physics steps pass
    // during pause, and resuming never adds the time spent in the menu.
    let previous = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      frame = requestAnimationFrame(tick);
      advance(clock.elapsedTime + delta);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [advance, clock, paused]);
  return null;
}

export function GameCanvas({ children, ...props }: CanvasProps) {
  const { paused, settings } = useGame();
  return (
    <div className='game-viewport' tabIndex={-1} aria-label='Game view' inert={paused} style={{ filter: `brightness(${settings.brightness / 100})` }}>
      <Canvas {...props} frameloop='never' dpr={settings.resolution}>
        <WorldProvider world={runtimeWorld}>
        <PauseRenderLoop />
        <RuntimeSystems />
        {children}
        </WorldProvider>
      </Canvas>
    </div>
  );
}
