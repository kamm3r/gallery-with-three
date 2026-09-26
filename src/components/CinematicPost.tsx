import {
  Bloom,
  EffectComposer,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { useFrame, useThree } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { useEffect, useMemo } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { AtmosphereEffect, FOREST_ATMOSPHERE, type AtmosphereSettings } from "./AtmosphereEffect";
import { GradeEffect } from "./GradeEffect";

// Painted-cinematic grade (Ghibli backgrounds / Elden Ring / Tsushima refs):
// contact AO grounds the foliage, levels with an atmosphere get height haze
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

export function CinematicPost({ atmosphere }: { atmosphere?: AtmosphereSettings }) {
  const reducedMotion = useReducedMotion();
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const controls = useControls("Post / Cinematic", {
    enabled: { value: true, label: "Enabled" },
    multisampling: {
      options: { Off: 0, "2x": 2, "4x": 4, "8x": 8 },
      value: 4,
      label: "MSAA",
    },
    smaa: { value: true, label: "SMAA" },
    Occlusion: folder({
      ao: { value: true, label: "AO" },
      aoRadius: { value: 1.6, min: 0.2, max: 6, step: 0.1, label: "AO radius" },
      aoIntensity: { value: 2.2, min: 0, max: 8, step: 0.1, label: "AO intensity" },
      aoColor: { value: "#17220f", label: "AO tint" },
    }),
    Light: folder({
      toneMapping: { options: TONE_MAPPING, value: ToneMappingMode.AGX, label: "Tone map" },
      bloomIntensity: { value: 0.35, min: 0, max: 2, step: 0.05, label: "Bloom" },
      luminanceThreshold: { value: 1.1, min: 0, max: 1.5, step: 0.05, label: "Bloom threshold" },
      luminanceSmoothing: { value: 0.3, min: 0, max: 1, step: 0.05, label: "Bloom smoothing" },
      bloomRadius: { value: 0.75, min: 0, max: 1, step: 0.01, label: "Bloom radius" },
    }),
    Grade: folder({
      exposure: { value: 1.12, min: 0.5, max: 2, step: 0.01, label: "Exposure" },
      contrast: { value: 0.32, min: 0, max: 1, step: 0.01, label: "S-curve" },
      lift: { value: 0.025, min: 0, max: 0.2, step: 0.005, label: "Lift" },
      saturation: { value: 1.08, min: 0, max: 2, step: 0.01, label: "Saturation" },
      vibrance: { value: 0.3, min: -1, max: 1, step: 0.01, label: "Vibrance" },
      split: { value: 0.18, min: 0, max: 1, step: 0.01, label: "Split tone" },
      shadowTint: { value: "#35584f", label: "Shadow tint" },
      highlightTint: { value: "#ffd08a", label: "Highlight tint" },
    }),
    Finish: folder({
      vignetteDarkness: { value: 0.5, min: 0, max: 1, step: 0.05, label: "Vignette" },
      vignetteOffset: { value: 0.28, min: 0, max: 1, step: 0.01, label: "Vignette offset" },
      grain: { value: 0.045, min: 0, max: 0.3, step: 0.005, label: "Grain" },
    }),
  });
  const baseAir = atmosphere ?? FOREST_ATMOSPHERE;
  const air = useControls("Post / Atmosphere", {
    density: { value: baseAir.density, min: 0, max: 0.06, step: 0.001 },
    falloff: { value: baseAir.falloff, min: 0, max: 0.3, step: 0.005 },
    fogStart: { value: baseAir.fogStart, min: 0, max: 40, step: 0.5 },
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
  });

  const atmosphereEffect = useMemo(() => new AtmosphereEffect(camera, scene), [camera, scene]);
  const grade = useMemo(() => new GradeEffect(), []);
  useEffect(() => () => atmosphereEffect.dispose(), [atmosphereEffect]);
  useEffect(() => () => grade.dispose(), [grade]);
  atmosphereEffect.configure(air);
  grade.configure(controls);

  const grain = reducedMotion ? 0 : controls.grain;
  // The composer renders the scene itself; only draw directly without it, so
  // the scene (and its shadow maps) is never rendered twice per frame.
  useFrame(({ gl, scene, camera }) => {
    if (!controls.enabled) gl.render(scene, camera);
  }, 1);

  return (
    <EffectComposer multisampling={controls.multisampling} enabled={controls.enabled}>
      {controls.ao && (
        <N8AO
          halfRes
          quality="medium"
          aoRadius={controls.aoRadius}
          intensity={controls.aoIntensity}
          distanceFalloff={1}
          color={controls.aoColor}
        />
      )}
      {atmosphere && <primitive object={atmosphereEffect} />}
      <Bloom
        intensity={controls.bloomIntensity}
        luminanceThreshold={controls.luminanceThreshold}
        luminanceSmoothing={controls.luminanceSmoothing}
        mipmapBlur
        radius={controls.bloomRadius}
      />
      <ToneMapping mode={controls.toneMapping} />
      <primitive object={grade} />
      <Vignette darkness={controls.vignetteDarkness} offset={controls.vignetteOffset} />
      {grain > 0 && <Noise opacity={grain} blendFunction={BlendFunction.SOFT_LIGHT} />}
      {controls.smaa && <SMAA />}
    </EffectComposer>
  );
}
