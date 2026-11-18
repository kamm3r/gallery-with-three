import { startFrameLoop } from "../runtime/frameLoop";
import { Canvas, useThree, type CanvasProps } from "@react-three/fiber";
import { useLayoutEffect, useState } from "react";
import { Leva, useControls } from "leva";
import { useGame } from "../hooks/useGame";
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
import { FreeCamera, FreeCameraTools } from "./FreeCamera";
import { ps2PixelRatio } from "../gameplay/ps2Style";

/** PS2 style renders a fixed number of lines, so the ratio follows the window height. */
function usePs2PixelRatio(enabled: boolean) {
  const [ratio, setRatio] = useState(() => ps2PixelRatio(window.innerHeight));
  useLayoutEffect(() => {
    if (!enabled) return;
    const update = () => setRatio(ps2PixelRatio(window.innerHeight));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [enabled]);
  return ratio;
}

function PauseRenderLoop({ preparing }: { preparing: boolean }) {
  const { paused, freeCamera } = useGame();
  const clock = useThree((state) => state.clock);
  const advance = useThree((state) => state.advance);
  const gl = useThree((state) => state.gl);
  const telemetry = useEcsRef("frame-telemetry", createFrameTelemetry);
  useLayoutEffect(() => {
    if (paused || preparing) return;
    // Drive the whole scene with game time. No frames or physics steps pass
    // during pause, and resuming never adds the time spent in the menu.
    return startFrameLoop(({ now, interval, delta }) => {
      telemetry.current.previous = now;
      gl.info.reset();
      const begin = performance.now();
      advance(clock.elapsedTime + (freeCamera ? 0 : delta));
      if (!document.hidden) recordFrame(telemetry.current, interval, performance.now() - begin);
    });
  }, [advance, clock, gl, paused, preparing, freeCamera, telemetry]);
  return null;
}

function Diagnostics() {
  const { perf } = useControls("Diagnostics", {
    perf: { value: false, label: "Performance overlay" },
  });
  // Live root state for the dev-browser checks in scripts/.
  const state = useThree();
  useLayoutEffect(() => {
    (window as { __r3f?: typeof state }).__r3f = state;
    state.gl.info.autoReset = false;
    const host = window as typeof window & { __graphics?: unknown };
    const graphics = {
      summary: () => {
        const telemetry = runtimeWorld
          .query(GameplayState)
          .find((e) => e.get(GameplayState)!.domain === "frame-telemetry")
          ?.get(GameplayState)!.value as FrameTelemetry | undefined;
        return {
          ...summarizeFrames(telemetry ?? createFrameTelemetry()),
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
    host.__graphics = graphics;
    const overlay = perf ? document.createElement("output") : null;
    let timer: number | undefined;
    if (overlay) {
      overlay.style.cssText =
        "position:fixed;top:8px;left:8px;z-index:20;pointer-events:none;background:#171717;color:white;padding:6px 8px;font:12px monospace";
      document.body.append(overlay);
      const update = () => {
        const { fps, p95Ms, calls, triangles } = graphics.summary();
        overlay.textContent = `${fps.toFixed(0)} FPS · p95 ${p95Ms.toFixed(1)} ms · ${calls} draws · ${triangles.toLocaleString()} triangles`;
      };
      update();
      timer = window.setInterval(update, 500);
    }
    return () => {
      window.clearInterval(timer);
      overlay?.remove();
      delete host.__graphics;
    };
  }, [state, perf]);
  return null;
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
  const { paused, freeCamera, settings } = useGame();
  const [renderScale, setRenderScale] = useState(settings.resolution);
  const [preparing, setPreparing] = useState(false);
  const ps2 = settings.ps2Style;
  const ps2Ratio = usePs2PixelRatio(ps2);
  useLayoutEffect(() => {
    setControlsPaused(paused || preparing || freeCamera);
    return () => setControlsPaused(paused || freeCamera);
  }, [paused, preparing, freeCamera]);
  return (
    <>
      <div
        className={ps2 ? "game-viewport ps2-style" : "game-viewport"}
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
          dpr={ps2 ? ps2Ratio : adaptiveResolution ? renderScale : settings.resolution}
          gl={{ antialias: false, stencil: false, powerPreference: "high-performance" }}
        >
          <WorldProvider world={runtimeWorld}>
            <PauseRenderLoop preparing={preparing} />
            {adaptiveResolution && !ps2 && (
              <AdaptiveResolution
                maximum={settings.resolution}
                enabled={settings.adaptiveResolution}
                suspended={paused || preparing}
                targetFps={settings.frameTarget}
                onChange={setRenderScale}
              />
            )}
            <RuntimeSystems />
            <FreeCamera />
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
      <FreeCameraTools unavailable={preparing} />
      {preparing && (
        <div className="graphics-preparing" role="status">
          Preparing graphics…
        </div>
      )}
      {import.meta.env.DEV && (
        <Leva
          hidden={
            !tuningInitiallyOpen && !new URLSearchParams(window.location.search).has("tuning")
          }
          collapsed={!tuningInitiallyOpen}
          titleBar={{ title: "Tuning", drag: true }}
        />
      )}
    </>
  );
}
