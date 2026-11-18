import { useFrame, useThree } from "@react-three/fiber";
import { folder, useControls } from "leva";
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
import { HalfFloatType, NoToneMapping, Vector2 } from "three";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { AtmosphereEffect, FOREST_ATMOSPHERE, type AtmosphereSettings } from "./AtmosphereEffect";
import { GradeEffect } from "./GradeEffect";
import { Ps2Effect } from "./Ps2Effect";
import { useGame } from "../hooks/useGame";

// Painted-cinematic grade (Ghibli backgrounds / Elden Ring / Tsushima refs):
// Levels with an atmosphere get height haze
// and volumetric sun shafts, a soft wide bloom lets light bleed into the
// haze, AgX keeps bright skies from clipping, and a split-tone grade pushes
// cool moss shadows against warm sunlit highlights. A whisper of grain and a
// soft vignette give the frame a canvas-like finish. Every knob is tunable at
// runtime via the Leva "Post" folders.
const TONE_MAPPING = {
  AgX: ToneMappingMode.AGX,
  ACES: ToneMappingMode.ACES_FILMIC,
  Neutral: ToneMappingMode.NEUTRAL,
};

export type CinematicProfile = {
  name: string;
  exposure?: number;
  contrast?: number;
  lift?: number;
  saturation?: number;
  vibrance?: number;
  split?: number;
  shadowTint?: string;
  highlightTint?: string;
  bloomIntensity?: number;
  grain?: number;
  vignetteDarkness?: number;
};

export function CinematicPost({
  atmosphere,
  defaultMultisampling = 4,
  profile,
}: {
  atmosphere?: AtmosphereSettings;
  profile?: CinematicProfile;
  defaultMultisampling?: number;
}) {
  const reducedMotion = useReducedMotion();
  const { settings } = useGame();
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const controls = useControls(`Post / ${profile?.name ?? "Cinematic"}`, {
    enabled: { value: true, label: "Enabled" },
    multisampling: {
      options: { Off: 0, "2x": 2, "4x": 4, "8x": 8 },
      value: defaultMultisampling,
      label: "MSAA",
    },
    smaa: { value: true, label: "SMAA" },
    Light: folder({
      toneMapping: { options: TONE_MAPPING, value: ToneMappingMode.AGX, label: "Tone map" },
      bloomIntensity: {
        value: profile?.bloomIntensity ?? 0.35,
        min: 0,
        max: 2,
        step: 0.05,
        label: "Bloom",
      },
      luminanceThreshold: { value: 1.1, min: 0, max: 1.5, step: 0.05, label: "Bloom threshold" },
      luminanceSmoothing: { value: 0.3, min: 0, max: 1, step: 0.05, label: "Bloom smoothing" },
      bloomRadius: { value: 0.75, min: 0, max: 1, step: 0.01, label: "Bloom radius" },
    }),
    Grade: folder({
      exposure: {
        value: profile?.exposure ?? 1.12,
        min: 0.5,
        max: 2,
        step: 0.01,
        label: "Exposure",
      },
      contrast: { value: profile?.contrast ?? 0.32, min: 0, max: 1, step: 0.01, label: "S-curve" },
      lift: { value: profile?.lift ?? 0.025, min: 0, max: 0.2, step: 0.005, label: "Lift" },
      saturation: {
        value: profile?.saturation ?? 1.08,
        min: 0,
        max: 2,
        step: 0.01,
        label: "Saturation",
      },
      vibrance: { value: profile?.vibrance ?? 0.3, min: -1, max: 1, step: 0.01, label: "Vibrance" },
      split: { value: profile?.split ?? 0.18, min: 0, max: 1, step: 0.01, label: "Split tone" },
      shadowTint: { value: profile?.shadowTint ?? "#35584f", label: "Shadow tint" },
      highlightTint: { value: profile?.highlightTint ?? "#ffd08a", label: "Highlight tint" },
    }),
    Finish: folder({
      vignetteDarkness: {
        value: profile?.vignetteDarkness ?? 0.5,
        min: 0,
        max: 1,
        step: 0.05,
        label: "Vignette",
      },
      vignetteOffset: { value: 0.28, min: 0, max: 1, step: 0.01, label: "Vignette offset" },
      grain: { value: profile?.grain ?? 0.045, min: 0, max: 0.3, step: 0.005, label: "Grain" },
    }),
  });
  const baseAir = atmosphere ?? FOREST_ATMOSPHERE;
  const air = useControls(profile ? `Post / ${profile.name} Atmosphere` : "Post / Atmosphere", {
    density: { value: baseAir.density, min: 0, max: 0.06, step: 0.001 },
    falloff: { value: baseAir.falloff, min: 0, max: 0.3, step: 0.005 },
    fogStart: { value: baseAir.fogStart, min: 0, max: 160, step: 0.5 },
    skyFog: { value: baseAir.skyFog, min: 0, max: 1, step: 0.01 },
    scatter: { value: baseAir.scatter, min: 0, max: 1, step: 0.01 },
    shafts: { value: baseAir.shafts, min: 0, max: 3, step: 0.05 },
    shaftDensity: {
      value: baseAir.shaftDensity,
      min: 0,
      max: 0.2,
      step: 0.005,
    },
    shaftDistance: {
      value: baseAir.shaftDistance,
      min: 5,
      max: 90,
      step: 1,
    },
    shaftSteps: {
      value: baseAir.shaftSteps ?? 28,
      min: 8,
      max: 28,
      step: 1,
      label: "Shaft samples",
    },
  });

  const gl = useThree((state) => state.gl);
  const size = useMemo(() => new Vector2(), []);
  const pipeline = useRef<{
    composer: EffectComposer;
    width: number;
    height: number;
    dpr: number;
  } | null>(null);
  const ps2 = settings.ps2Style;
  const bloom = settings.bloom;
  const shadows = settings.shadows;

  useLayoutEffect(() => {
    if (!controls.enabled) return;
    const composer = new EffectComposer(gl, {
      multisampling: ps2 ? 0 : controls.multisampling,
      frameBufferType: HalfFloatType,
    });
    composer.addPass(new RenderPass(scene, camera));
    const effects: Effect[] = [];
    if (atmosphere) {
      const effect = new AtmosphereEffect(camera, scene);
      effect.configure({ ...air, shafts: shadows === "off" ? 0 : air.shafts });
      effects.push(effect);
    }
    if (bloom) {
      effects.push(
        new BloomEffect({
          intensity: controls.bloomIntensity,
          luminanceThreshold: controls.luminanceThreshold,
          luminanceSmoothing: controls.luminanceSmoothing,
          mipmapBlur: true,
          radius: controls.bloomRadius,
        }),
      );
    }
    const grade = new GradeEffect();
    grade.configure(controls);
    effects.push(
      new ToneMappingEffect({ mode: controls.toneMapping }),
      grade,
      new VignetteEffect({ darkness: controls.vignetteDarkness, offset: controls.vignetteOffset }),
    );
    if (!reducedMotion && !ps2 && controls.grain > 0) {
      const noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT });
      noise.blendMode.opacity.value = controls.grain;
      effects.push(noise);
    }
    if (ps2) effects.push(new Ps2Effect());
    if (controls.smaa && !ps2) effects.push(new SMAAEffect());
    composer.addPass(new EffectPass(camera, ...effects));
    pipeline.current = { composer, width: -1, height: -1, dpr: -1 };
    return () => {
      pipeline.current = null;
      composer.dispose();
    };
  }, [gl, scene, camera, size, ps2, bloom, shadows, reducedMotion, atmosphere, air, controls]);

  useFrame((_, delta) => {
    const active = pipeline.current;
    if (!active) {
      gl.render(scene, camera);
      return;
    }
    gl.getSize(size);
    const dpr = gl.getPixelRatio();
    if (active.width !== size.x || active.height !== size.y || active.dpr !== dpr) {
      active.composer.setSize(size.x, size.y);
      active.width = size.x;
      active.height = size.y;
      active.dpr = dpr;
    }
    const { autoClear, toneMapping } = gl;
    gl.autoClear = true;
    gl.toneMapping = NoToneMapping;
    try {
      active.composer.render(delta);
    } finally {
      gl.autoClear = autoClear;
      gl.toneMapping = toneMapping;
    }
  }, 1);
  return null;
}
