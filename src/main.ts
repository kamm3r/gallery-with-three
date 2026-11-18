import { configureSound, playSound, unlockSound } from "./gameplay/sound";
import { isResultScreenActive } from "./gameplay/resultScreen";
import { gameStore, mountGameState } from "./runtime/gameStore";
import { setControlsPaused } from "./runtime/playerInput";
import { getGameRouter } from "./runtime/router";
import { mountPauseMenu } from "./ui/pauseMenu";
import { button, element } from "./ui/dom";
import { isWarpLevelId, WARP_LEVELS } from "./gameplay/warpLevels";
import { bossUnlocked, readWarpProgress } from "./gameplay/warpProgress";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
const outlet = root;
const router = getGameRouter();
const unmountRouter = router.mount();
const cleanupState = mountGameState(gameStore, {
  setControlsPaused,
  configureSound,
  unlockSound,
  audioMuted: () => false,
});
const cleanupMenu = mountPauseMenu(document.body, {
  store: gameStore,
  pathname: () => router.getSnapshot().pathname,
  navigate: (path, state) => router.navigate(path, { state }),
  playSound: () => playSound("ui"),
  resultScreenActive: isResultScreenActive,
});

let routeLifetime: AbortController | undefined;
let disposeScene: (() => void) | undefined;
const menu = button("Menu", () => gameStore.setPaused(true), "pause-trigger");

function notice(title: string, detail: string, retry?: () => void) {
  const home = element("a", "", "Return to the forest");
  home.href = "/";
  const returnPortal = router.getSnapshot().state?.fromPortal;
  home.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    router.navigate("/", { state: { returnPortal } });
  });
  outlet.replaceChildren(
    element(
      "main",
      "error-page",
      element(
        "div",
        "",
        element("p", "", detail),
        element("h1", "", title),
        retry ? button("Try again", retry) : home,
      ),
    ),
  );
}

function showRoute() {
  routeLifetime?.abort();
  disposeScene?.();
  disposeScene = undefined;
  const { route, state } = router.getSnapshot();
  if (route === "legacy") {
    router.navigate("/", { replace: true });
    return;
  }
  const native = [
    "forest",
    "capitalKit",
    "warp",
    "capital",
    "warpLevel",
    "warpBoss",
    "gallery",
    "playground",
  ];
  if (!native.includes(route)) {
    notice(
      route === "notFound" ? "This path leaves the forest." : "This world is unavailable",
      route === "notFound" ? "Lost trail" : "This world still needs its native runtime.",
    );
    return;
  }
  const { signal } = (routeLifetime = new AbortController());
  const host = element("main", "experience");
  const loading = element("p", "loading-screen", "Loading world");
  loading.setAttribute("role", "status");
  host.append(loading, menu);
  outlet.replaceChildren(host);
  const mount =
    route === "playground"
      ? import("./runtime/worlds/playground").then(({ mountPlayground }) =>
          mountPlayground(
            host,
            state,
            (path, next) => router.navigate(path, { state: next }),
            signal,
          ),
        )
      : route === "gallery"
        ? import("./runtime/worlds/gallery").then(({ mountGallery }) =>
            mountGallery(
              host,
              state,
              (path, next) => router.navigate(path, { state: next }),
              signal,
            ),
          )
        : route === "warpBoss"
          ? import("./runtime/worlds/warpBoss").then(({ mountWarpBoss }) => {
              if (!bossUnlocked(readWarpProgress())) {
                router.navigate("/warp", { replace: true });
                return undefined;
              }
              return mountWarpBoss(
                host,
                (path, next) => router.navigate(path, { state: next }),
                showRoute,
                signal,
              );
            })
          : route === "warpLevel"
            ? import("./runtime/worlds/warpLevel").then(({ mountWarpLevel }) => {
                const id = router.getSnapshot().params.levelId;
                if (!isWarpLevelId(id)) {
                  router.navigate("/warp", { replace: true });
                  return undefined;
                }
                return mountWarpLevel(
                  host,
                  WARP_LEVELS[id],
                  (path, next) => router.navigate(path, { state: next }),
                  signal,
                );
              })
            : route === "capital"
              ? import("./runtime/worlds/capital").then(({ mountCapital }) =>
                  mountCapital(
                    host,
                    () => router.navigate("/", { state: { returnPortal: "north" } }),
                    signal,
                  ),
                )
              : route === "warp"
                ? import("./runtime/worlds/warpRoom").then(({ mountWarpRoom }) =>
                    mountWarpRoom(
                      host,
                      state,
                      (path, next) => router.navigate(path, { state: next }),
                      signal,
                    ),
                  )
                : route === "capitalKit"
                  ? import("./runtime/capitalKit").then(({ mountCapitalKit }) =>
                      mountCapitalKit(host, signal),
                    )
                  : import("./runtime/forest").then(({ mountForest }) =>
                      mountForest(
                        host,
                        state?.returnPortal,
                        (portal) => {
                          router.navigate(portal.destination, { state: { fromPortal: portal.id } });
                        },
                        signal,
                      ),
                    );
  void mount
    .then((dispose) => {
      if (signal.aborted) {
        dispose?.();
        return;
      }
      disposeScene = dispose;
      loading.remove();
    })
    .catch((error: unknown) => {
      if (signal.aborted) return;
      console.error(error);
      notice("Unable to load this scene", "The game could not start.", showRoute);
    });
}

const unsubscribe = router.subscribe(showRoute);
showRoute();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    unsubscribe();
    routeLifetime?.abort();
    disposeScene?.();
    cleanupMenu();
    cleanupState();
    unmountRouter();
  });
