import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import { newParishProgress } from "../src/gameplay/ashenParish.ts";
import { capitalWorld, capitalShrines } from "../src/gameplay/capitalLayout.ts";
import { beginCapitalBoss, claimCapitalCache } from "../src/gameplay/capitalProgress.ts";
import {
  createParishEncounter,
  resetParishEncounter,
  restAtParishShrine,
  stepParishEncounter,
} from "../src/gameplay/parishEncounter.ts";
import {
  PARISH_SAVE_KEY,
  createParishAutosave,
  newParishSave,
  readParishSave,
  writeParishSave,
} from "../src/gameplay/parishSave.ts";

function memoryStore(value: string | null = null) {
  return {
    value,
    writes: 0,
    getItem(key: string) {
      assert.equal(key, PARISH_SAVE_KEY);
      return this.value;
    },
    setItem(key: string, next: string) {
      assert.equal(key, PARISH_SAVE_KEY);
      this.value = next;
      this.writes++;
    },
  };
}

test("shortcut, offering and shrine survive reload, death and re-entry without duplicate rewards", () => {
  const store = memoryStore();
  const progress = newParishProgress();
  const state = createParishEncounter(progress, capitalWorld);
  state.enemies = [];
  assert.equal(restAtParishShrine(state), true);
  progress.checkpoint = "kiln";
  progress.court = true;
  state.flasks = 1;
  assert.equal(claimCapitalCache(state, progress, "town-key"), true);
  assert.equal(state.flasks, 2);
  const reward = state.embers;
  writeParishSave(progress, reward, store);
  const saved = readParishSave(store);
  const resumed = Object.assign(createParishEncounter(saved.progress, capitalWorld), {
    embers: saved.embers,
  });
  const shrine = capitalShrines.find((s) => s.id === "kiln")!;
  assert.deepEqual(
    [resumed.combat.playerX, resumed.combat.playerY, resumed.combat.playerZ],
    shrine.spawn,
  );
  assert.equal(saved.progress.court, true);
  assert.equal(resumed.flasks, 3);
  assert.equal(claimCapitalCache(resumed, saved.progress, "town-key"), false);
  assert.equal(resumed.embers, reward);
  resumed.combat.health = 0;
  resumed.flasks = 0;
  resumed.enemies[0]!.health = 0;
  resetParishEncounter(resumed, saved.progress);
  assert.ok(resumed.combat.health > 0);
  assert.equal(resumed.flasks, 3);
  assert.ok(resumed.enemies.every((e) => e.health > 0));
  assert.equal(resumed.embers, reward);
  assert.equal(saved.progress.court, true);
  assert.equal(claimCapitalCache(resumed, saved.progress, "town-key"), false);
  writeParishSave(saved.progress, resumed.embers, store);
  assert.deepEqual(readParishSave(store), saved);
});

test("boss victories persist and cannot be restarted after reload", () => {
  const store = memoryStore();
  const p = newParishProgress();
  const s = createParishEncounter(p, capitalWorld);
  beginCapitalBoss(s, "cathedral", p);
  s.combat.bossHealth = 0;
  stepParishEncounter(s, 0.05, p);
  assert.equal(p.cathedralFelled, true);
  p.fogCleared = true;
  beginCapitalBoss(s, "colosseum", p);
  s.combat.bossHealth = 0;
  stepParishEncounter(s, 0.05, p);
  assert.equal(p.finalFelled, true);
  writeParishSave(p, s.embers, store);
  const loaded = readParishSave(store);
  const resumed = createParishEncounter(loaded.progress, capitalWorld);
  assert.equal(resumed.bossFelled, true);
  assert.equal(resumed.enemies.length, 0);
  assert.equal(beginCapitalBoss(resumed, "cathedral", loaded.progress), null);
  assert.equal(beginCapitalBoss(resumed, "colosseum", loaded.progress), null);
});

test("invalid saves recover; only known, typed durable fields are restored", () => {
  for (const value of [null, "{", "null", "[]", '{"version":99}', '{"version":1,"progress":null}'])
    assert.deepEqual(readParishSave(memoryStore(value)), newParishSave());
  const loaded = readParishSave(
    memoryStore(
      JSON.stringify({
        version: 1,
        embers: -20,
        progress: {
          checkpoint: "missing",
          refuge: "true",
          court: true,
          caches: ["town-key", "town-key", "unknown"],
          finalFelled: true,
          townLift: true,
        },
        health: 1,
        bossActive: true,
      }),
    ),
  );
  assert.equal(loaded.progress.checkpoint, "refuge");
  assert.equal(loaded.progress.refuge, false);
  assert.deepEqual(loaded.progress.caches, ["town-key"]);
  assert.equal(loaded.progress.fogCleared, true);
  assert.equal(loaded.progress.cathedralFelled, true);
  assert.equal(loaded.embers, 0);
});

test("autosave writes only on changes, retries failures, and new run replaces progress", () => {
  const store = memoryStore();
  const save = createParishAutosave(store);
  const p = newParishProgress();
  save(p, 0);
  save(p, 0);
  assert.equal(store.writes, 1);
  p.court = true;
  save(p, 100);
  assert.equal(store.writes, 2);
  assert.equal(readParishSave(store).embers, 100);
  const fresh = newParishSave();
  Object.assign(p, fresh.progress);
  save(p, fresh.embers);
  assert.deepEqual(readParishSave(store), fresh);
  let attempts = 0;
  const retry = createParishAutosave({
    getItem: () => null,
    setItem: () => {
      if (++attempts === 1) throw Error("quota");
    },
  });
  retry(p, 0);
  retry(p, 0);
  retry(p, 0);
  assert.equal(attempts, 2);
  assert.deepEqual(
    readParishSave({
      getItem: () => {
        throw Error("blocked");
      },
      setItem() {},
    }),
    fresh,
  );
});
