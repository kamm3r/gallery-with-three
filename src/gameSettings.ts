import { defaultBindings, readBindings, readSprintKey } from "./gameplay/controlBindings.ts";
import { graphicsPresets, readGraphicsSettings } from "./gameplay/graphicsSettings.ts";
import type { RollWeight } from "./gameplay/playerRules.ts";

export const defaultSettings = {
  soundVolume: 60,
  brightness: 100,
  /** 448-line, 15-bit dithered PS2 presentation. Independent of the quality preset. */
  ps2Style: true,
  ...graphicsPresets.medium,
  sensitivity: 100,
  invertY: false,
  /** The combat camera drifts round behind sideways travel, like Elden Ring's. */
  cameraAutoRotate: true,
  showHints: true,
  reducedMotion: false,
  bindings: defaultBindings,
  sprintKey: null as string | null,
  /** Stands in for equipment load until there is gear to carry. */
  rollWeight: "medium" as RollWeight,
};
export type GameSettings = typeof defaultSettings;
export const settingsKey = "painted-forest.settings.v1";

export function readSettings(): GameSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) ?? "{}");
    const settings = {
      ...defaultSettings,
      ...readGraphicsSettings(saved && typeof saved === "object" ? saved : {}),
    };
    for (const key of [
      "invertY",
      "cameraAutoRotate",
      "showHints",
      "reducedMotion",
      "adaptiveResolution",
      "ps2Style",
    ] as const) {
      if (typeof saved?.[key] === "boolean") settings[key] = saved[key];
    }
    for (const [key, min, max] of [
      ["brightness", 60, 140],
      ["resolution", 0.75, 2],
      ["sensitivity", 25, 200],
      ["soundVolume", 0, 100],
    ] as const) {
      if (typeof saved?.[key] === "number" && Number.isFinite(saved[key])) {
        settings[key] = Math.min(max, Math.max(min, saved[key]));
      }
    }
    settings.bindings = readBindings(saved?.bindings, saved?.sprintKey);
    settings.sprintKey = readSprintKey(saved?.sprintKey, settings.bindings);
    if (["light", "medium", "heavy"].includes(saved?.rollWeight))
      settings.rollWeight = saved.rollWeight;
    return settings;
  } catch {
    return { ...defaultSettings };
  }
}
