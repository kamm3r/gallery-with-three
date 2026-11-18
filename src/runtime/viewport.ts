import {
  EffectComposer,
  EffectPass,
  RenderPass,
  BloomEffect,
  ToneMappingEffect,
} from "postprocessing";
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

export function createViewport(host: HTMLElement, scene: Scene, camera: PerspectiveCamera) {
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
    if (!composer || current?.ps2Style !== settings.ps2Style || current.bloom !== settings.bloom) {
      composer?.dispose();
      composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
      composer.addPass(new RenderPass(scene, camera));
      const effects = [];
      if (settings.bloom)
        effects.push(
          new BloomEffect({ mipmapBlur: true, intensity: 0.35, luminanceThreshold: 1.1 }),
        );
      effects.push(new ToneMappingEffect());
      if (settings.ps2Style) effects.push(new Ps2Effect());
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
