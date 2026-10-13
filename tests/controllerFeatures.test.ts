import test from "node:test";
import assert from "node:assert/strict";
import { newParishProgress } from "../src/gameplay/ashenParish.ts";
import { stepEncounter } from "../src/gameplay/bossEncounter.ts";
import { defaultBindings, readBindings } from "../src/gameplay/controlBindings.ts";
import {
  createParishEncounter,
  drinkEmber,
  FLASK_DRINK_TIME,
} from "../src/gameplay/parishEncounter.ts";

function wounded() {
  const state = createParishEncounter(newParishProgress());
  state.combat.health = 40;
  return state;
}

void test("a flask commits the player for its whole drink", () => {
  const state = wounded();
  assert.equal(drinkEmber(state), true);
  assert.equal(state.combat.health, 85);
  assert.equal(state.combat.drinkTime, FLASK_DRINK_TIME);
  for (let t = 0; t < FLASK_DRINK_TIME - 0.1; t += 1 / 60) stepEncounter(state.combat, 1 / 60);
  assert.ok(state.combat.drinkTime > 0, "still drinking");
  for (let t = 0; t < 0.2; t += 1 / 60) stepEncounter(state.combat, 1 / 60);
  assert.equal(state.combat.drinkTime, 0);
});

void test("no flask mid-roll, mid-parry or mid-plunge", () => {
  for (const patch of [{ rolling: true }, { parryTime: 0.1 }, { plunging: true }]) {
    const state = wounded();
    Object.assign(state.combat, patch);
    assert.equal(drinkEmber(state), false, JSON.stringify(patch));
    assert.equal(state.flasks, 3);
  }
});

void test("a map saved before crouch keeps every custom key and finds crouch a free one", () => {
  const { crouch: _, ...old } = { ...defaultBindings, jump: "KeyC", forward: "KeyI" };
  const read = readBindings(old);
  assert.equal(read.jump, "KeyC");
  assert.equal(read.forward, "KeyI");
  assert.notEqual(read.crouch, "KeyC");
  assert.equal(new Set(Object.values(read)).size, Object.values(read).length);
  // It does not take the saved dedicated sprint key either.
  const { crouch: __, ...older } = defaultBindings;
  assert.equal(readBindings(older).crouch, "KeyC");
  assert.notEqual(readBindings(older, "KeyC").crouch, "KeyC");
});
