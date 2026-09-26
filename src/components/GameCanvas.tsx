import { Canvas, useThree, type CanvasProps } from "@react-three/fiber";
import { lazy, Suspense, useLayoutEffect } from "react";
import { Leva, useControls } from "leva";
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

// Dev only: the dynamic import keeps r3f-perf out of production bundles.
const Perf = import.meta.env.DEV
  ? lazy(() => import("r3f-perf").then((module) => ({ default: module.Perf })))
  : () => null;

function Diagnostics() {
  const { perf } = useControls("Diagnostics", {
    perf: { value: false, label: "r3f-perf overlay" },
  });
  // Live root state for the dev-browser checks in scripts/.
  const state = useThree();
  useLayoutEffect(() => {
    (window as { __r3f?: typeof state }).__r3f = state;
  }, [state]);
  return perf ? (
    <Suspense fallback={null}>
      <Perf position="top-left" />
    </Suspense>
  ) : null;
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
            {import.meta.env.DEV && <Diagnostics />}
          </WorldProvider>
        </Canvas>
      </div>
      {import.meta.env.DEV && <Leva collapsed titleBar={{ title: "Tuning", drag: true }} />}
    </>
  );
}
