import { Canvas, useThree, type CanvasProps } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { Leva } from "leva";
import { useGame } from "../gameSettings";
import { WorldProvider } from "koota/react";
import { runtimeWorld } from "../gameplay/ecs/world";
import { RuntimeSystems } from "./RuntimeSystems";
import { CinematicPost } from "./CinematicPost";
import type { AtmosphereSettings } from "./AtmosphereEffect";

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

export function GameCanvas({
  children,
  atmosphere,
  ...props
}: CanvasProps & { atmosphere?: AtmosphereSettings }) {
  const { paused, settings } = useGame();
  return (
    <>
      <div
        className="game-viewport"
        tabIndex={-1}
        aria-label="Game view"
        inert={paused}
        style={{ filter: `brightness(${settings.brightness / 100})` }}
      >
        <Canvas
          {...props}
          flat
          frameloop="never"
          dpr={settings.resolution}
          gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }}
        >
          <WorldProvider world={runtimeWorld}>
            <PauseRenderLoop />
            <RuntimeSystems />
            {children}
            <CinematicPost atmosphere={atmosphere} />
          </WorldProvider>
        </Canvas>
      </div>
      {import.meta.env.DEV && <Leva collapsed titleBar={{ title: "Tuning", drag: true }} />}
    </>
  );
}
