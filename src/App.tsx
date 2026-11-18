import { Navigate, useLocation } from "./hooks/useRoute";
import { lazy, Suspense } from "react";
import Custom404 from "./pages/404";
import ForestHub from "./pages/index";
import { GameProvider } from "./GameProvider";
import { isPlaygroundEditor } from "./gameplay/editorMode";
import { PauseMenu } from "./components/PauseMenu";

const GalleryLevel = lazy(() => import("./pages/gallery"));
const PlaygroundLevel = lazy(() => import("./pages/playground"));
const CapitalKit = lazy(() => import("./pages/capitalKit"));
const RealmLevel = lazy(() => import("./pages/realm"));
const SeasonsLevel = lazy(() => import("./pages/seasons"));
const WarpRoom = lazy(() => import("./pages/warp"));
const WarpLevel = lazy(() => import("./pages/warpLevel"));
const WarpBoss = lazy(() => import("./pages/warpBoss"));

export function App() {
  const location = useLocation();
  const editor = import.meta.env.DEV && isPlaygroundEditor(location.pathname, location.search);
  const views = {
    forest: ForestHub,
    gallery: GalleryLevel,
    playground: PlaygroundLevel,
    seasons: SeasonsLevel,
    capitalKit: CapitalKit,
    capital: RealmLevel,
    warp: WarpRoom,
    warpBoss: WarpBoss,
    warpLevel: WarpLevel,
    notFound: Custom404,
  };
  const View = location.route === "legacy" ? null : views[location.route];
  return (
    <GameProvider>
      <Suspense
        fallback={
          <main className="experience">
            <p role="status">Loading world…</p>
          </main>
        }
      >
        {View ? <View key={location.pathname} /> : <Navigate to="/" replace />}
      </Suspense>
      {!editor && <PauseMenu />}
    </GameProvider>
  );
}
