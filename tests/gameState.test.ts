import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import { createGameStore } from "../src/runtime/gameStore.ts";
import { defaultSettings } from "../src/gameSettings.ts";
import { matchRoute } from "../src/runtime/router.ts";

test("game store keeps editor pause independent and applies graphics presets", () => {
  const store = createGameStore({ ...defaultSettings });
  const initial = store.getSnapshot();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  store.setPaused(false);
  assert.equal(store.getSnapshot(), initial);
  store.setEditorPaused(true);
  store.setPaused(true);
  store.setEditorPaused(false);
  assert.equal(store.getSnapshot().paused, true);
  store.setPaused(false);
  store.updateSettings({ graphicsPreset: "ultra" });
  assert.equal(store.getSnapshot().settings.resolution, 2);
  store.updateSettings({ shadows: "low" });
  assert.equal(store.getSnapshot().settings.graphicsPreset, "custom");
  const before = notifications;
  unsubscribe();
  store.setFreeCamera(true);
  assert.equal(notifications, before);
});

test("route matching distinguishes Warp levels, the boss and malformed URLs", () => {
  assert.deepEqual(matchRoute("/warp/turtle"), {
    route: "warpLevel",
    params: { levelId: "turtle" },
  });
  assert.equal(matchRoute("/warp/boss/").route, "warpBoss");
  assert.equal(matchRoute("/warp/%").route, "notFound");
});
