import type { PivotMode } from "./transformPivot";
/** Editor-only preferences that survive reloads but never touch the saved scene. */
export type TransformSpace = "world" | "local";
export type SnapSettings = {
  enabled: boolean;
  position: number;
  rotation: number;
  scale: number;
};
export type EditorPreferences = {
  space: TransformSpace;
  pivot: PivotMode;
  snap: SnapSettings;
};

export const defaultEditorPreferences: EditorPreferences = {
  space: "world",
  pivot: "center",
  snap: { enabled: false, position: 0.5, rotation: 15, scale: 0.1 },
};

const storageKey = "painted-forest.editor-preferences.v1";

function finiteInRange(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

export function normalizeEditorPreferences(value: unknown): EditorPreferences {
  const data = value as Partial<EditorPreferences> | null | undefined;
  const snap = (data?.snap ?? {}) as Partial<SnapSettings>;
  return {
    space: data?.space === "local" ? "local" : "world",
    pivot: data?.pivot === "pivot" ? "pivot" : "center",
    snap: {
      enabled: snap.enabled === true,
      // Units are metres, degrees, and scale factors; keep edits meaningful.
      position: finiteInRange(snap.position, defaultEditorPreferences.snap.position, 0.01, 100),
      rotation: finiteInRange(snap.rotation, defaultEditorPreferences.snap.rotation, 1, 180),
      scale: finiteInRange(snap.scale, defaultEditorPreferences.snap.scale, 0.01, 10),
    },
  };
}

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export function readEditorPreferences(storage?: PreferenceStorage | null): EditorPreferences {
  if (storage === undefined) {
    if (typeof localStorage === "undefined") return defaultEditorPreferences;
    storage = localStorage;
  }
  if (!storage) return defaultEditorPreferences;
  try {
    return normalizeEditorPreferences(JSON.parse(storage.getItem(storageKey) ?? "null"));
  } catch {
    return defaultEditorPreferences;
  }
}

export function rememberEditorPreferences(
  preferences: EditorPreferences,
  storage?: PreferenceStorage | null,
) {
  if (storage === undefined) {
    if (typeof localStorage === "undefined") return;
    storage = localStorage;
  }
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(normalizeEditorPreferences(preferences)));
  } catch {
    /* The active session remains usable. */
  }
}
