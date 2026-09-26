// Saved Warp Room progress: which crystals and gems you hold, and whether the
// boss is down. The boss portal opens once every level's crystal is in.

import { WARP_LEVEL_IDS, type WarpLevelId } from "./warpLevels.ts";

export interface WarpProgress {
  crystals: WarpLevelId[];
  gems: WarpLevelId[];
  boss: boolean;
}

export const warpProgressKey = "painted-forest.warp.v1";

type Store = Pick<Storage, "getItem" | "setItem">;
const browserStore = (): Store | undefined =>
  typeof localStorage === "undefined" ? undefined : localStorage;

const onlyLevels = (value: unknown): WarpLevelId[] =>
  Array.isArray(value) ? WARP_LEVEL_IDS.filter((id) => value.includes(id)) : [];

export function readWarpProgress(store = browserStore()): WarpProgress {
  try {
    const saved = JSON.parse(store?.getItem(warpProgressKey) ?? "{}");
    return {
      crystals: onlyLevels(saved?.crystals),
      gems: onlyLevels(saved?.gems),
      boss: saved?.boss === true,
    };
  } catch {
    return { crystals: [], gems: [], boss: false };
  }
}

export function saveWarpProgress(progress: WarpProgress, store = browserStore()) {
  try {
    store?.setItem(warpProgressKey, JSON.stringify(progress));
  } catch {
    /* Progress still holds for this session. */
  }
}

/** Adds a finished level's rewards and saves. Never takes anything away. */
export function recordLevel(
  id: WarpLevelId,
  result: { crystal: boolean; gem: boolean },
  store = browserStore(),
) {
  const progress = readWarpProgress(store);
  const next: WarpProgress = {
    crystals: onlyLevels(result.crystal ? [...progress.crystals, id] : progress.crystals),
    gems: onlyLevels(result.gem ? [...progress.gems, id] : progress.gems),
    boss: progress.boss,
  };
  saveWarpProgress(next, store);
  return next;
}

export function recordBoss(store = browserStore()) {
  const next = { ...readWarpProgress(store), boss: true };
  saveWarpProgress(next, store);
  return next;
}

export const bossUnlocked = (progress: WarpProgress) =>
  WARP_LEVEL_IDS.every((id) => progress.crystals.includes(id));
