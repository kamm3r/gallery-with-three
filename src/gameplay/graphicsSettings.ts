export type Detail = "low" | "medium" | "high";
export type EffectDetail = "off" | Detail;
export type GraphicsPreset = Detail | "ultra" | "custom";
export type GraphicsSettings = {
  graphicsPreset: GraphicsPreset;
  resolution: number;
  adaptiveResolution: boolean;
  frameTarget: 30 | 60;
  shadows: EffectDetail;
  ambientOcclusion: EffectDetail;
  bloom: boolean;
  environmentDetail: Detail;
  particleDetail: EffectDetail;
};
export const graphicsPresets: Record<Exclude<GraphicsPreset, "custom">, GraphicsSettings> = {
  low: {
    graphicsPreset: "low",
    resolution: 0.75,
    adaptiveResolution: true,
    frameTarget: 60,
    shadows: "low",
    ambientOcclusion: "off",
    bloom: false,
    environmentDetail: "low",
    particleDetail: "low",
  },
  medium: {
    graphicsPreset: "medium",
    resolution: 1,
    adaptiveResolution: true,
    frameTarget: 60,
    shadows: "medium",
    ambientOcclusion: "low",
    bloom: true,
    environmentDetail: "medium",
    particleDetail: "medium",
  },
  high: {
    graphicsPreset: "high",
    resolution: 1.5,
    adaptiveResolution: true,
    frameTarget: 60,
    shadows: "high",
    ambientOcclusion: "medium",
    bloom: true,
    environmentDetail: "high",
    particleDetail: "high",
  },
  ultra: {
    graphicsPreset: "ultra",
    resolution: 2,
    adaptiveResolution: false,
    frameTarget: 60,
    shadows: "high",
    ambientOcclusion: "high",
    bloom: true,
    environmentDetail: "high",
    particleDetail: "high",
  },
};
export const shadowSizes: Record<EffectDetail, number> = {
  off: 0,
  low: 512,
  medium: 1024,
  high: 2048,
};
export const detailFraction: Record<EffectDetail, number> = {
  off: 0,
  low: 0.35,
  medium: 0.65,
  high: 1,
};
const details: readonly string[] = ["low", "medium", "high"];
const effects: readonly string[] = ["off", ...details];
const graphicsKeys = Object.keys(graphicsPresets.medium) as Array<keyof GraphicsSettings>;

/** Validate persisted values, retaining the resolution from the older settings format. */
export function readGraphicsSettings(saved: Record<string, unknown>): GraphicsSettings {
  const preset =
    typeof saved.graphicsPreset === "string" && Object.hasOwn(graphicsPresets, saved.graphicsPreset)
      ? (saved.graphicsPreset as Exclude<GraphicsPreset, "custom">)
      : "medium";
  const result = { ...graphicsPresets[preset] };
  if (typeof saved.resolution === "number" && Number.isFinite(saved.resolution))
    result.resolution = Math.max(0.75, Math.min(2, saved.resolution));
  if (typeof saved.adaptiveResolution === "boolean")
    result.adaptiveResolution = saved.adaptiveResolution;
  if (saved.frameTarget === 30 || saved.frameTarget === 60) result.frameTarget = saved.frameTarget;
  for (const key of ["shadows", "ambientOcclusion", "particleDetail"] as const)
    if (typeof saved[key] === "string" && effects.includes(saved[key]))
      result[key] = saved[key] as EffectDetail;
  if (typeof saved.environmentDetail === "string" && details.includes(saved.environmentDetail))
    result.environmentDetail = saved.environmentDetail as Detail;
  if (typeof saved.bloom === "boolean") result.bloom = saved.bloom;
  if (
    saved.graphicsPreset === "custom" ||
    graphicsKeys.some(
      (key) => key !== "graphicsPreset" && result[key] !== graphicsPresets[preset][key],
    )
  )
    result.graphicsPreset = "custom";
  return result;
}

/** Selecting a preset updates all its controls; changing one control marks it Custom. */
export function patchGraphicsSettings<T extends GraphicsSettings>(
  current: T,
  patch: Partial<T>,
): T {
  const preset: GraphicsPreset | undefined = patch.graphicsPreset;
  if (preset && preset !== "custom") return { ...current, ...patch, ...graphicsPresets[preset] };
  const next = { ...current, ...patch };
  if (
    graphicsKeys.some(
      (key) => key !== "graphicsPreset" && patch[key] !== undefined && patch[key] !== current[key],
    )
  )
    next.graphicsPreset = "custom";
  return next;
}
