import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import Custom404 from "./pages/404";
import ForestHub from "./pages/index";
import { GameProvider } from "./GameProvider";
import { PauseMenu } from "./components/PauseMenu";

const GalleryLevel = lazy(() => import("./pages/gallery"));
const PlaygroundLevel = lazy(() => import("./pages/playground"));
const RealmLevel = lazy(() => import("./pages/realm"));

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
          <Route path="/seasons" element={<RealmLevel />} />
          <Route path="/boss" element={<RealmLevel boss />} />
          <Route path="/pageTwo" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Custom404 />} />
        </Routes>
      </Suspense>
      <PauseMenu />
    </GameProvider>
  );
}
