import { useEffect, type ReactNode } from "react";
import { useLocation } from "./hooks/useRoute";
import { isPlaygroundEditor } from "./gameplay/editorMode";
import { useEditorPlayback, useEditorPaused } from "./dev/editorPlayback";
import { setControlsPaused } from "./runtime/playerInput";
import { configureSound, unlockSound } from "./gameplay/sound";
import { gameStore, mountGameState } from "./runtime/gameStore";

/** Lifecycle bridge until the scene router moves off React. State lives in gameStore. */
export function GameProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const editor = import.meta.env.DEV && isPlaygroundEditor(location.pathname, location.search);
  const editorPlaying = useEditorPlayback();
  const editorPaused = useEditorPaused();
  useEffect(() => {
    if (editor && editorPlaying) gameStore.setPaused(false);
    gameStore.setEditorPaused(editor && editorPaused);
  }, [editor, editorPlaying, editorPaused]);
  useEffect(
    () =>
      mountGameState(gameStore, {
        setControlsPaused,
        configureSound,
        unlockSound,
        audioMuted: () => editor && !editorPlaying,
      }),
    [editor, editorPlaying],
  );
  return children;
}
