import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "../hooks/useRoute";
import { gameStore } from "../runtime/gameStore";
import { mountPauseMenu } from "../ui/pauseMenu";
import { isResultScreenActive } from "../gameplay/resultScreen";
import { playSound } from "../gameplay/sound";

/** Temporary mount bridge; the menu itself is native DOM and TypeScript. */
export function PauseMenu() {
  const navigate = useNavigate();
  const location = useLocation();
  const route = useRef({ navigate, pathname: location.pathname });
  route.current = { navigate, pathname: location.pathname };
  useEffect(
    () =>
      mountPauseMenu(document.body, {
        store: gameStore,
        pathname: () => route.current.pathname,
        navigate: (path, state) => {
          route.current.navigate(path, { state });
        },
        playSound: () => playSound("ui"),
        resultScreenActive: isResultScreenActive,
      }),
    [],
  );
  return null;
}
