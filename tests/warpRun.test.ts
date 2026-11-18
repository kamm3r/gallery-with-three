import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import { WARP_LEVEL_IDS, WARP_LEVELS, type WarpLevel } from "../src/gameplay/warpLevels.ts";
import { createRun, stepRun, type PlayerSample, type RunEvent } from "../src/gameplay/warpRun.ts";
import {
  bossUnlocked,
  readWarpProgress,
  recordBoss,
  recordLevel,
} from "../src/gameplay/warpProgress.ts";

const standing = (x: number, y: number, z: number): PlayerSample => ({
  x,
  y,
  z,
  vy: -1,
  grounded: true,
  spinning: false,
});

/** A hand-made level so the rules are tested apart from the real layouts. */
const sandbox: WarpLevel = {
  ...WARP_LEVELS.turtle,
  enemies: [{ kind: "turtle", x: 10, y: 0, z: 0, axis: "x", range: 0.001, speed: 0.001 }],
  crates: [
    { x: 0, y: 0, z: 0, kind: "basic" },
    { x: 3, y: 0, z: 0, kind: "check" },
    { x: 6, y: 0, z: 0, kind: "tnt" },
    { x: 6, y: 0, z: 1.5, kind: "basic" },
    { x: -6, y: 0, z: 0, kind: "nitro" },
    { x: -3, y: 0, z: 0, kind: "aku" },
  ],
  fruit: [[0, 1, 5]],
};

test("a spin breaks crates in reach; the checkpoint moves the respawn", () => {
  const run = createRun(sandbox);
  stepRun(run, { ...standing(3, 0, 1.4), spinning: true }, 1 / 60);
  assert.equal(run.crates[1].broken, true);
  assert.deepEqual(run.checkpoint, [3, 0, 0]);
  // Die by falling: respawn at the checkpoint after the death beat.
  const events: RunEvent[] = [];
  events.push(...stepRun(run, standing(20, -10, 0), 1 / 60));
  for (let i = 0; i < 120; i++) events.push(...stepRun(run, standing(20, -10, 0), 1 / 60));
  assert.ok(events.some((e) => e.type === "death" && e.cause === "fall"));
  const respawn = events.find((e) => e.type === "respawn");
  assert.deepEqual(respawn && "position" in respawn ? respawn.position : null, [3, 0, 0]);
});

test("progress only grows and the boss opens with all five crystals", () => {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  assert.deepEqual(readWarpProgress(store), { crystals: [], gems: [], boss: false });
  recordLevel("snow", { crystal: true, gem: false }, store);
  recordLevel("snow", { crystal: false, gem: true }, store);
  assert.deepEqual(readWarpProgress(store), { crystals: ["snow"], gems: ["snow"], boss: false });
  for (const id of WARP_LEVEL_IDS.slice(0, 4))
    recordLevel(id, { crystal: true, gem: false }, store);
  assert.equal(bossUnlocked(readWarpProgress(store)), false);
  recordLevel("ruins", { crystal: true, gem: false }, store);
  assert.equal(bossUnlocked(readWarpProgress(store)), true);
  recordBoss(store);
  assert.equal(readWarpProgress(store).boss, true);
  data.set("painted-forest.warp.v1", "{not json");
  assert.deepEqual(readWarpProgress(store), { crystals: [], gems: [], boss: false });
});
