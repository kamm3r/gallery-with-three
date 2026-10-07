import { Canvas, useThree, type CanvasProps } from "@react-three/fiber";
import { lazy, Suspense, useLayoutEffect, useState } from "react";
import { Leva, useControls } from "leva";
import { useGame } from "../gameSettings";
import { WorldProvider } from "koota/react";
import { runtimeWorld } from "../gameplay/ecs/world";
import { RuntimeSystems } from "./RuntimeSystems";
import { PointLightBudget } from "./PointLightBudget";
import { AdaptiveResolution } from "./AdaptiveResolution";
import { CinematicPost, type CinematicProfile } from "./CinematicPost";
import type { AtmosphereSettings } from "./AtmosphereEffect";
import { GraphicsQuality } from "./GraphicsQuality";
import { ScenePreparation } from "./ScenePreparation";
import { useEcsRef } from "../hooks/useEcsRef";
import {
  createFrameTelemetry,
  recordFrame,
  summarizeFrames,
  type FrameTelemetry,
} from "../gameplay/frameTelemetry";
import { GameplayState } from "../gameplay/ecs/stateBinding";
import { setControlsPaused } from "../hooks/usePlayerControls";

function PauseRenderLoop({ preparing }: { preparing: boolean }) {
  const { paused } = useGame();
  const clock = useThree((state) => state.clock);
  const advance = useThree((state) => state.advance);
  const gl = useThree((state) => state.gl);
  const telemetry = useEcsRef("frame-telemetry", createFrameTelemetry);
  useLayoutEffect(() => {
    if (paused || preparing) return;
    // Drive the whole scene with game time. No frames or physics steps pass
    // during pause, and resuming never adds the time spent in the menu.
    telemetry.current.previous = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const interval = now - telemetry.current.previous;
      const delta = Math.min(interval / 1000, 0.05);
      telemetry.current.previous = now;
      frame = requestAnimationFrame(tick);
      gl.info.reset();
      const begin = performance.now();
      advance(clock.elapsedTime + delta);
      if (!document.hidden) recordFrame(telemetry.current, interval, performance.now() - begin);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [advance, clock, gl, paused, preparing, telemetry]);
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
    state.gl.info.autoReset = false;
    const host = window as typeof window & { __graphics?: unknown };
    host.__graphics = {
      summary: () => {
        const telemetry = runtimeWorld
          .query(GameplayState)
          .find((e) => e.get(GameplayState)!.domain === "frame-telemetry")
          ?.get(GameplayState)!.value as FrameTelemetry | undefined;
        return {
          ...(telemetry ? summarizeFrames(telemetry) : {}),
          dpr: state.gl.getPixelRatio(),
          calls: state.gl.info.render.calls,
          triangles: state.gl.info.render.triangles,
          programs: state.gl.info.programs?.length,
        };
      },
      reset: () => {
        const entity = runtimeWorld
          .query(GameplayState)
          .find((e) => e.get(GameplayState)!.domain === "frame-telemetry");
        if (entity) {
          const value = createFrameTelemetry();
          value.previous = (entity.get(GameplayState)!.value as FrameTelemetry).previous;
          entity.set(GameplayState, { domain: "frame-telemetry", value });
        }
      },
    };
    return () => {
      delete host.__graphics;
    };
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
  tuningInitiallyOpen = false,
  pointLightBudget,
  postMultisampling,
  postProfile,
  adaptiveResolution = true,
  prepareScene = false,
  ...props
}: CanvasProps & {
  atmosphere?: AtmosphereSettings;
  tuningInitiallyOpen?: boolean;
  pointLightBudget?: number;
  postMultisampling?: number;
  postProfile?: CinematicProfile;
  adaptiveResolution?: boolean;
  prepareScene?: boolean;
}) {
  const { paused, settings } = useGame();
  const [renderScale, setRenderScale] = useState(settings.resolution);
  const [preparing, setPreparing] = useState(false);
  useLayoutEffect(() => {
    setControlsPaused(paused || preparing);
    return () => setControlsPaused(paused);
  }, [paused, preparing]);
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
          shadows={settings.shadows === "off" ? false : (props.shadows ?? "percentage")}
          flat
          frameloop="never"
          dpr={adaptiveResolution ? renderScale : settings.resolution}
          gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }}
        >
          <WorldProvider world={runtimeWorld}>
            <PauseRenderLoop preparing={preparing} />
            {adaptiveResolution && (
              <AdaptiveResolution
                maximum={settings.resolution}
                enabled={settings.adaptiveResolution}
                suspended={paused || preparing}
                targetFps={settings.frameTarget}
                onChange={setRenderScale}
              />
            )}
            <RuntimeSystems />
            {children}
            <GraphicsQuality />
            {pointLightBudget !== undefined && <PointLightBudget limit={pointLightBudget} />}
            <CinematicPost
              atmosphere={atmosphere}
              defaultMultisampling={postMultisampling}
              profile={postProfile}
            />
            {import.meta.env.DEV && <Diagnostics />}
            <ScenePreparation ready={prepareScene} onPreparing={setPreparing} />
          </WorldProvider>
        </Canvas>
      </div>
      {preparing && (
        <div className="graphics-preparing" role="status">
          Preparing graphics…
        </div>
      )}
      {import.meta.env.DEV && (
        <Leva collapsed={!tuningInitiallyOpen} titleBar={{ title: "Tuning", drag: true }} />
      )}
    </>
  );
}
