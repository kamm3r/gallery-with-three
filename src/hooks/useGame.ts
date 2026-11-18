import { useSyncExternalStore } from "react";
import { gameStore } from "../runtime/gameStore";

/** Temporary adapter for scenes that have not yet moved to the native runtime. */
export function useGame() {
  const state = useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot);
  return {
    ...state,
    setPaused: gameStore.setPaused,
    setFreeCamera: gameStore.setFreeCamera,
    updateSettings: gameStore.updateSettings,
  };
}
