import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import Custom404 from "./pages/404";
import ForestHub from "./pages/index";
import { GameProvider } from "./GameProvider";
import { PauseMenu } from "./components/PauseMenu";

const GalleryLevel = lazy(() => import("./pages/gallery"));
const PlaygroundLevel = lazy(() => import("./pages/playground"));
const RealmLevel = lazy(() => import("./pages/realm"));
const SeasonsLevel = lazy(() => import("./pages/seasons"));
const WarpRoom = lazy(() => import("./pages/warp"));
const WarpLevel = lazy(() => import("./pages/warpLevel"));
const WarpBoss = lazy(() => import("./pages/warpBoss"));

export function App() {
  return (
    <GameProvider>
      <Suspense
        fallback={
          <main className="experience">
            <p role="status">Loading world…</p>
          </main>
        }
      >
        <Routes>
          <Route path="/" element={<ForestHub />} />
          <Route path="/gallery" element={<GalleryLevel />} />
          <Route path="/playground" element={<PlaygroundLevel />} />
          <Route path="/seasons" element={<SeasonsLevel />} />
          <Route path="/boss" element={<RealmLevel />} />
          <Route path="/warp" element={<WarpRoom />} />
          <Route path="/warp/boss" element={<WarpBoss />} />
          <Route path="/warp/:levelId" element={<WarpLevel />} />
          <Route path="/pageTwo" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Custom404 />} />
        </Routes>
      </Suspense>
      <PauseMenu />
    </GameProvider>
  );
}
