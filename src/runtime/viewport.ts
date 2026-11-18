import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from "postprocessing";
import { AtmosphereEffect, type AtmosphereSettings } from "../components/AtmosphereEffect";
import { GradeEffect, type GradeSettings } from "../components/GradeEffect";
import {
  HalfFloatType,
  NoToneMapping,
  WebGLRenderer,
  type PerspectiveCamera,
  type Scene,
} from "three";
import { Ps2Effect } from "../components/Ps2Effect";
import { createResolutionBudget, stepResolutionBudget } from "../gameplay/adaptiveResolution";
import { ps2PixelRatio } from "../gameplay/ps2Style";
import type { GameSettings } from "../gameSettings";

/** Per-world look: height haze and shafts, plus the colour grade and finish. */
export type ViewportPost = {
  atmosphere?: AtmosphereSettings;
  grade?: Partial<
    GradeSettings & { bloomIntensity: number; vignetteDarkness: number; grain: number }
  >;
};

const DEFAULT_GRADE = {
  exposure: 1.12,
  contrast: 0.32,
  lift: 0.025,
  saturation: 1.08,
  vibrance: 0.3,
  split: 0.18,
  shadowTint: "#35584f",
  highlightTint: "#ffd08a",
  bloomIntensity: 0.35,
  vignetteDarkness: 0.5,
  grain: 0.045,
};

export function createViewport(
  host: HTMLElement,
  scene: Scene,
  camera: PerspectiveCamera,
  post: ViewportPost = {},
) {
  const grade = { ...DEFAULT_GRADE, ...post.grade };
  const renderer = new WebGLRenderer({ powerPreference: "high-performance" });
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  host.append(renderer.domElement);
  let composer: EffectComposer | undefined;
  let current: GameSettings | undefined;
  let budget = createResolutionBudget(1);
  let width = 0;
  let height = 0;
  let ratio = 0;

  function render(settings: GameSettings, frameMs: number) {
    if (
      !composer ||
      current?.ps2Style !== settings.ps2Style ||
      current.bloom !== settings.bloom ||
      current.shadows !== settings.shadows ||
      current.reducedMotion !== settings.reducedMotion
    ) {
      composer?.dispose();
      composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
      composer.addPass(new RenderPass(scene, camera));
      const effects: Effect[] = [];
      if (post.atmosphere) {
        const air = new AtmosphereEffect(camera, scene);
        air.configure({
          ...post.atmosphere,
          shafts: settings.shadows === "off" ? 0 : post.atmosphere.shafts,
        });
        effects.push(air);
      }
      if (settings.bloom)
        effects.push(
          new BloomEffect({
            mipmapBlur: true,
            intensity: grade.bloomIntensity,
            luminanceThreshold: 1.1,
            luminanceSmoothing: 0.3,
            radius: 0.75,
          }),
        );
      const grading = new GradeEffect();
      grading.configure(grade);
      effects.push(
        new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
        grading,
        new VignetteEffect({ darkness: grade.vignetteDarkness, offset: 0.28 }),
      );
      if (!settings.reducedMotion && !settings.ps2Style && grade.grain > 0) {
        const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT });
        noise.blendMode.opacity.value = grade.grain;
        effects.push(noise);
      }
      if (settings.ps2Style) effects.push(new Ps2Effect());
      else effects.push(new SMAAEffect());
      composer.addPass(new EffectPass(camera, ...effects));
      width = 0;
    }
    if (
      current?.resolution !== settings.resolution ||
      current.adaptiveResolution !== settings.adaptiveResolution
    )
      budget = createResolutionBudget(settings.resolution);
    current = settings;
    const nextWidth = Math.max(1, host.clientWidth);
    const nextHeight = Math.max(1, host.clientHeight);
    const nextRatio = settings.ps2Style
      ? ps2PixelRatio(nextHeight)
      : settings.adaptiveResolution
        ? stepResolutionBudget(budget, frameMs, settings.resolution, settings.frameTarget)
        : settings.resolution;
    if (width !== nextWidth || height !== nextHeight || ratio !== nextRatio) {
      width = nextWidth;
      height = nextHeight;
      ratio = nextRatio;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(ratio);
      composer.setSize(width, height);
    }
    host.classList.toggle("ps2-style", settings.ps2Style);
    host.style.filter = `brightness(${settings.brightness / 100})`;
    composer.render(frameMs / 1000);
  }

  return {
    canvas: renderer.domElement,
    render,
    dispose() {
      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
