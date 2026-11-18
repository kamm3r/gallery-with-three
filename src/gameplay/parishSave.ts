import { newParishProgress, type ParishProgress } from "./ashenParish.ts";
import { capitalCaches } from "./capitalLayout.ts";

export const PARISH_SAVE_KEY = "painted-forest.parish";
export type ParishSave = { version: 1; progress: ParishProgress; embers: number };
type Store = Pick<Storage, "getItem" | "setItem">;
const browserStore = (): Store | undefined => {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

/** Only durable campaign facts belong here, never position or combat state. */
export function newParishSave(): ParishSave {
  return { version: 1, progress: newParishProgress(), embers: 0 };
}

export function readParishSave(store = browserStore()): ParishSave {
  const fresh = newParishSave();
  try {
    const saved: unknown = JSON.parse(store?.getItem(PARISH_SAVE_KEY) ?? "null");
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1)
      return fresh;
    const data = saved as Record<string, unknown>;
    if (!data.progress || typeof data.progress !== "object") return fresh;
    const p = data.progress as Record<string, unknown>;
    const progress = fresh.progress;
    for (const key of [
      "refuge",
      "court",
      "garden",
      "cathedralFelled",
      "fogCleared",
      "beaconLift",
      "arenaLift",
      "townLift",
      "finalFelled",
    ] as const)
      progress[key] = p[key] === true;
    progress.checkpoint = p.checkpoint === "kiln" ? "kiln" : "refuge";
    progress.caches = capitalCaches
      .filter((cache) => Array.isArray(p.caches) && p.caches.includes(cache.id))
      .map((cache) => cache.id);
    // Later milestones imply their prerequisites, including for partially damaged saves.
    if (progress.finalFelled) progress.fogCleared = true;
    if (progress.fogCleared) progress.cathedralFelled = true;
    if (!progress.fogCleared) progress.beaconLift = progress.arenaLift = false;
    if (!progress.caches.includes("town-key")) progress.townLift = false;
    fresh.embers =
      typeof data.embers === "number" && Number.isSafeInteger(data.embers)
        ? Math.max(0, data.embers)
        : 0;
    return fresh;
  } catch {
    return fresh;
  }
}

/** Storage failures leave the in-memory run playable. Returns false so writes can retry. */
export function writeParishSave(progress: ParishProgress, embers: number, store = browserStore()) {
  try {
    if (!store) return false;
    store.setItem(PARISH_SAVE_KEY, JSON.stringify({ version: 1, progress, embers }));
    return true;
  } catch {
    return false;
  }
}

/** Called after simulation; unchanged frames never write to storage. */
export function createParishAutosave(store = browserStore()) {
  let previous = "";
  return (progress: ParishProgress, embers: number) => {
    const signature = JSON.stringify({ progress, embers });
    if (signature !== previous && writeParishSave(progress, embers, store)) previous = signature;
  };
}
