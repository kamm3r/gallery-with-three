export type RouteState = {
  fromPortal?: string;
  returnPortal?: string;
  bossBeaten?: boolean;
  cleared?: { level: string; crystal: boolean; gem: boolean };
};
export type RouteId =
  | "forest"
  | "gallery"
  | "playground"
  | "seasons"
  | "capitalKit"
  | "capital"
  | "warp"
  | "warpBoss"
  | "warpLevel"
  | "legacy"
  | "notFound";
export type RouteLocation = {
  pathname: string;
  search: string;
  hash: string;
  state: RouteState | null;
  key: string;
  route: RouteId;
  params: Record<string, string | undefined>;
};
export type NavigateOptions = { replace?: boolean; state?: RouteState };

export function matchRoute(pathname: string): Pick<RouteLocation, "route" | "params"> {
  const path = pathname.replace(/\/+$/, "") || "/";
  const routes: Record<string, RouteId> = {
    "/": "forest",
    "/gallery": "gallery",
    "/playground": "playground",
    "/seasons": "seasons",
    "/capital-kit": "capitalKit",
    "/boss": "capital",
    "/warp": "warp",
    "/warp/boss": "warpBoss",
    "/pageTwo": "legacy",
  };
  if (Object.hasOwn(routes, path)) return { route: routes[path], params: {} };
  const level = /^\/warp\/([^/]+)$/.exec(path);
  if (level) {
    try {
      return { route: "warpLevel", params: { levelId: decodeURIComponent(level[1]) } };
    } catch {
      /* Malformed URLs use the missing-route view. */
    }
  }
  return { route: "notFound", params: {} };
}

/** Browser history owns navigation; renderers only subscribe to route snapshots. */
export function createGameRouter(browser: Window) {
  const listeners = new Set<() => void>();
  let sequence = 0;
  let mounted = false;
  const read = (): RouteLocation => {
    const { pathname, search, hash } = browser.location;
    const entry = browser.history.state as { usr?: RouteState; key?: string } | null;
    return {
      pathname,
      search,
      hash,
      state: entry?.usr ?? null,
      key: entry?.key ?? "initial",
      ...matchRoute(pathname),
    };
  };
  let location = read();
  const update = () => {
    location = read();
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => location,
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    navigate(this: void, to: string, options: NavigateOptions = {}) {
      const url = new URL(to, browser.location.href);
      if (url.origin !== browser.location.origin)
        throw new Error("Game navigation must stay on the same origin");
      const state = { usr: options.state ?? null, key: `game-${++sequence}` };
      browser.history[options.replace ? "replaceState" : "pushState"](state, "", url);
      update();
    },
    mount() {
      if (mounted) throw new Error("Game router already mounted");
      mounted = true;
      browser.addEventListener("popstate", update);
      update();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        mounted = false;
        browser.removeEventListener("popstate", update);
      };
    },
  };
}

let sharedRouter: ReturnType<typeof createGameRouter> | undefined;
export function getGameRouter() {
  return (sharedRouter ??= createGameRouter(window));
}
