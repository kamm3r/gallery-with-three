import { createContext, useContext } from "react";
import { defaultBindings, readBindings, readSprintKey } from "./gameplay/controlBindings";
import { graphicsPresets, readGraphicsSettings } from "./gameplay/graphicsSettings";

export const defaultSettings = {
  soundVolume: 60,
  brightness: 100,
  ...graphicsPresets.medium,
  sensitivity: 100,
  invertY: false,
  showHints: true,
  reducedMotion: false,
  bindings: defaultBindings,
  sprintKey: null as string | null,
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
    for (const key of ["invertY", "showHints", "reducedMotion", "adaptiveResolution"] as const) {
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
    settings.bindings = readBindings(saved?.bindings);
    settings.sprintKey = readSprintKey(saved?.sprintKey, settings.bindings);
    return settings;
  } catch {
    return { ...defaultSettings };
  }
}

export const GameContext = createContext<{
  paused: boolean;
  setPaused: (paused: boolean) => void;
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
}>({ paused: false, setPaused: () => {}, settings: defaultSettings, updateSettings: () => {} });

export function useGame() {
  return useContext(GameContext);
}
