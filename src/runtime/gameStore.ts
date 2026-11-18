import { readSettings, settingsKey, type GameSettings } from "../gameSettings.ts";
import { patchGraphicsSettings } from "../gameplay/graphicsSettings.ts";

export type GameState = {
  paused: boolean;
  freeCamera: boolean;
  settings: GameSettings;
};

/** Shared state for native views and the temporary React scene adapter. */
export function createGameStore(settings = readSettings()) {
  let manualPause = false;
  let editorPause = false;
  let state: GameState = { paused: false, freeCamera: false, settings };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<GameState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setPaused(this: void, next: boolean) {
      manualPause = next;
      const paused = manualPause || editorPause;
      if (state.paused !== paused) publish({ paused });
    },
    setEditorPaused(this: void, next: boolean) {
      editorPause = next;
      const paused = manualPause || editorPause;
      if (state.paused !== paused) publish({ paused });
    },
    setFreeCamera(this: void, next: boolean) {
      if (state.freeCamera !== next) publish({ freeCamera: next });
    },
    updateSettings(this: void, patch: Partial<GameSettings>) {
      publish({ settings: patchGraphicsSettings(state.settings, patch) });
    },
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
export const gameStore = createGameStore();

/** Browser effects have an explicit lifetime, independent of the view framework. */
export function mountGameState(
  store: GameStore,
  effects: {
    setControlsPaused: (paused: boolean) => void;
    configureSound: (volume: number, muted: boolean) => void;
    unlockSound: () => void;
    audioMuted: () => boolean;
  },
) {
  let previous: GameState | undefined;
  const sync = () => {
    const state = store.getSnapshot();
    if (
      !previous ||
      (previous.paused || previous.freeCamera) !== (state.paused || state.freeCamera)
    )
      effects.setControlsPaused(state.paused || state.freeCamera);
    effects.configureSound(
      state.settings.soundVolume,
      state.paused || state.freeCamera || effects.audioMuted(),
    );
    if (state.paused && !previous?.paused && document.pointerLockElement)
      document.exitPointerLock();
    if (state.settings !== previous?.settings) {
      try {
        localStorage.setItem(settingsKey, JSON.stringify(state.settings));
      } catch {
        /* Session preferences still work. */
      }
      document.documentElement.dataset.reducedMotion = String(state.settings.reducedMotion);
    }
    previous = state;
  };
  const visibility = () => {
    if (document.hidden) store.setPaused(true);
  };
  const unsubscribe = store.subscribe(sync);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pointerdown", effects.unlockSound);
  window.addEventListener("keydown", effects.unlockSound);
  sync();
  return () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pointerdown", effects.unlockSound);
    window.removeEventListener("keydown", effects.unlockSound);
    effects.configureSound(0, true);
  };
}
