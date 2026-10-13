import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { GameContext, readSettings, settingsKey, type GameSettings } from "./gameSettings";
import { setControlsPaused } from "./hooks/usePlayerControls";
import { configureSound, unlockSound } from "./gameplay/sound";
import { patchGraphicsSettings } from "./gameplay/graphicsSettings";

export function GameProvider({ children }: { children: ReactNode }) {
  const [paused, setPauseState] = useState(false);
  const [freeCamera, setFreeCameraState] = useState(false);
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => {
    configureSound(settings.soundVolume, paused || freeCamera);
  }, [settings.soundVolume, paused, freeCamera]);
  useEffect(() => {
    window.addEventListener("pointerdown", unlockSound);
    window.addEventListener("keydown", unlockSound);
    return () => {
      window.removeEventListener("pointerdown", unlockSound);
      window.removeEventListener("keydown", unlockSound);
      configureSound(0, true);
    };
  }, []);
  const setPaused = useCallback(
    (next: boolean) => {
      setControlsPaused(next || freeCamera);
      setPauseState(next);
      if (next && document.pointerLockElement) document.exitPointerLock();
    },
    [freeCamera],
  );
  const setFreeCamera = useCallback(
    (next: boolean) => {
      setControlsPaused(next || paused);
      setFreeCameraState(next);
    },
    [paused],
  );
  const updateSettings = useCallback((patch: Partial<GameSettings>) => {
    setSettings((current) => patchGraphicsSettings(current, patch));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch {
      /* Session settings still work. */
    }
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
  }, [settings]);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [setPaused]);
  const value = useMemo(
    () => ({ paused, setPaused, freeCamera, setFreeCamera, settings, updateSettings }),
    [paused, setPaused, freeCamera, setFreeCamera, settings, updateSettings],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
