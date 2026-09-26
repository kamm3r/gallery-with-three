import test from "node:test";
import assert from "node:assert/strict";
import {
  CRATE_SIZE,
  enemyPosition,
  solidTop,
  WARP_LEVEL_IDS,
  WARP_LEVELS,
  type WarpLevel,
} from "../src/gameplay/warpLevels.ts";
import {
  createRun,
  RUN,
  stepRun,
  type PlayerSample,
  type RunEvent,
} from "../src/gameplay/warpRun.ts";
import {
  bossUnlocked,
  readWarpProgress,
  recordBoss,
  recordLevel,
} from "../src/gameplay/warpProgress.ts";

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}

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

test("landing on a crate breaks it and bounces; walking beside it does not", () => {
  const run = createRun(sandbox);
  assert.deepEqual(stepRun(run, standing(0.7, 0, 0), 1 / 60), []);
  const events = stepRun(
    run,
    { ...standing(0.1, CRATE_SIZE + 0.02, 0), vy: -6, grounded: false },
    1 / 60,
  );
  assert.ok(events.some((e) => e.type === "crate" && e.index === 0));
  assert.ok(events.some((e) => e.type === "bounce" && e.speed === RUN.crateBounce));
  assert.equal(run.fruit, 1);
});

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

test("TNT lights on a stomp, blows after its fuse and takes the neighbors with it", () => {
  const run = createRun(sandbox);
  const lit = stepRun(run, { ...standing(6, CRATE_SIZE, 0), vy: -4, grounded: false }, 1 / 60);
  assert.ok(lit.some((e) => e.type === "fuse"));
  let boom: RunEvent[] = [];
  for (let t = 0; t < RUN.tntFuse + 0.1; t += 1 / 60)
    boom = boom.concat(stepRun(run, standing(20, 0, 0), 1 / 60));
  assert.ok(boom.some((e) => e.type === "explode"));
  assert.equal(run.crates[3].broken, true, "neighbor cleared");
  assert.equal(run.dying, 0, "out of range, alive");

  const close = createRun(sandbox);
  stepRun(close, { ...standing(6, 0, 1), spinning: true }, 1 / 60);
  assert.ok(close.dying > 0, "spinning a TNT at point blank kills");
});

test("a mask soaks one hit; nitro kills on touch", () => {
  const run = createRun(sandbox);
  stepRun(run, { ...standing(-3, CRATE_SIZE, 0), vy: -4, grounded: false }, 1 / 60);
  assert.equal(run.masks, 1);
  const touched = stepRun(run, standing(-6 + 0.8, 0, 0), 1 / 60);
  assert.ok(touched.some((e) => e.type === "explode"));
  assert.ok(touched.some((e) => e.type === "maskLost"));
  assert.equal(run.dying, 0);
  assert.equal(run.masks, 0);
});

test("stomping an enemy kills it; walking into it hurts", () => {
  const run = createRun(sandbox);
  const stomp = stepRun(
    run,
    { x: 10, y: 0.7, z: 0, vy: -5, grounded: false, spinning: false },
    1 / 60,
  );
  assert.ok(stomp.some((e) => e.type === "enemy" && e.stomped));
  const again = createRun(sandbox);
  const bump = stepRun(again, standing(10.5, 0, 0), 1 / 60);
  assert.ok(bump.some((e) => e.type === "death" && e.cause === "enemy"));
});

test("breaking every counted crate awards the gem", () => {
  const level = WARP_LEVELS.turtle;
  const run = createRun(level);
  const events: RunEvent[] = [];
  level.crates.forEach((crate) => {
    if (crate.kind === "spring") return;
    events.push(
      ...stepRun(
        run,
        { ...standing(crate.x, crate.y + CRATE_SIZE, crate.z), vy: -5, grounded: false },
        1 / 60,
      ),
    );
    // Keep lit fuses from ending the test run.
    for (let i = 0; i < 20; i++) events.push(...stepRun(run, standing(100, 0, 100), 1 / 60));
  });
  for (let i = 0; i < 400; i++) events.push(...stepRun(run, standing(100, 0, 100), 1 / 60));
  assert.equal(run.cratesBroken, run.crateTotal);
  assert.ok(events.some((e) => e.type === "gem"));
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

// --- Boulder Dash, played by bots with human limits: they walk (no Shift),
// hesitate before every gap, react late to the boulder, and the greedy one
// detours to smash every crate on the way.

interface Runner {
  name: string;
  /** Fraction of walk speed actually held (imperfect steering, camera fiddling). */
  pace: number;
  /** Pause before each gap (s). */
  hesitate: number;
  /** Delay before running once the boulder starts (s). */
  reaction: number;
  /** Time lost per side crate detour (s); 0 skips crates. */
  detour: number;
}

function runBoulder(runner: Runner, seed: number) {
  const level = WARP_LEVELS.boulder;
  const random = seeded(seed);
  const run = createRun(level);
  const walk = 4.8 * runner.pace;
  let z = level.spawn[2];
  let pause = 0;
  let started = false;
  const gapsSeen = new Set<number>();
  const cratesSeen = new Set<number>();
  for (let t = 0; t < 90; t += 1 / 60) {
    // Walk up to the trigger line like a player getting their bearings.
    if (!started && run.boulder.active) {
      started = true;
      pause = runner.reaction * (0.8 + random() * 0.4);
    }
    if (pause > 0) pause -= 1 / 60;
    else {
      z -= walk * (0.9 + random() * 0.2) * (1 / 60);
      const ahead = Math.round(z - 1.2);
      if (!Number.isFinite(solidTop(level, 0, z - 1.2)) && !gapsSeen.has(ahead)) {
        for (let k = -3; k <= 3; k++) gapsSeen.add(ahead + k);
        pause = runner.hesitate * (0.7 + random() * 0.6);
      }
      level.crates.forEach((crate, i) => {
        if (runner.detour > 0 && !cratesSeen.has(i) && Math.abs(crate.z - z) < 0.5) {
          cratesSeen.add(i);
          pause = runner.detour * (0.8 + random() * 0.4);
          stepRun(run, { x: crate.x, y: 0, z: crate.z, vy: -1, grounded: true, spinning: true }, 0);
        }
      });
    }
    const events = stepRun(run, { x: 0, y: 0, z, vy: -1, grounded: true, spinning: false }, 1 / 60);
    if (events.some((e) => e.type === "death")) return { escaped: false, crystal: run.crystal };
    if (z <= level.exit[2]) return { escaped: true, crystal: run.crystal };
  }
  return { escaped: false, crystal: run.crystal };
}

for (const runner of [
  { name: "a steady walker", pace: 0.9, hesitate: 0.35, reaction: 0.6, detour: 0 },
  { name: "a nervous walker", pace: 0.82, hesitate: 0.6, reaction: 0.9, detour: 0 },
  { name: "a crate-greedy walker", pace: 0.9, hesitate: 0.35, reaction: 0.6, detour: 0.45 },
] satisfies Runner[]) {
  test(`Boulder Dash: ${runner.name} outruns the boulder without sprinting`, () => {
    let escapes = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const result = runBoulder(runner, seed);
      if (result.escaped) {
        escapes++;
        assert.ok(result.crystal, "the crystal is on the escape line");
      }
    }
    assert.ok(escapes >= 36, `${runner.name} escaped ${escapes}/40`);
  });
}

test("Boulder Dash: standing still gets you flattened", () => {
  const level = WARP_LEVELS.boulder;
  const run = createRun(level);
  let dead = false;
  for (let t = 0; t < 10 && !dead; t += 1 / 60)
    dead = stepRun(
      run,
      { x: 0, y: 0, z: -1, vy: -1, grounded: true, spinning: false },
      1 / 60,
    ).some((e) => e.type === "death" && e.cause === "boulder");
  assert.ok(dead);
});

test("every level's enemies can be walked past on their patrol lane", () => {
  for (const id of WARP_LEVEL_IDS) {
    for (const enemy of WARP_LEVELS[id].enemies) {
      // Each patrol spends at least half a loop away from any given point.
      const loop = (4 * enemy.range) / enemy.speed;
      let clear = 0;
      for (let t = 0; t < loop; t += loop / 200) {
        const at = enemyPosition(enemy, t);
        if (Math.hypot(at.x - enemy.x, at.z - enemy.z) > RUN.enemyRadius + RUN.playerRadius)
          clear++;
      }
      assert.ok(clear > 60, `${id} ${enemy.kind} at z=${enemy.z}`);
    }
  }
});
