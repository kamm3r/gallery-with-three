import assert from "node:assert/strict";
import test from "node:test";
import {
  createResolutionBudget,
  stepResolutionBudget,
} from "../src/gameplay/adaptiveResolution.ts";
void test("sustained slow frames lower pixel cost within limits and recover gradually", () => {
  const budget = createResolutionBudget(1.5);
  for (let i = 0; i < 180; i++) stepResolutionBudget(budget, 33, 1.5);
  assert.ok(budget.scale < 1.5);
  for (let i = 0; i < 800; i++) stepResolutionBudget(budget, 33, 1.5);
  assert.equal(budget.scale, 0.75);
  for (let i = 0; i < 220; i++) stepResolutionBudget(budget, 16, 1.5);
  assert.equal(budget.scale, 0.75, "brief recovery must not oscillate");
  for (let i = 0; i < 4000; i++) stepResolutionBudget(budget, 16, 1.5);
  assert.equal(budget.scale, 1.5);
});
void test("background gaps, invalid samples and low-quality settings do not push resolution out of bounds", () => {
  const budget = createResolutionBudget(0.75);
  for (const ms of [2000, Infinity, NaN, 0, 1]) stepResolutionBudget(budget, ms, 0.75);
  assert.deepEqual(budget, createResolutionBudget(0.75));
  for (let i = 0; i < 300; i++) stepResolutionBudget(budget, 40, 0.75);
  assert.equal(budget.scale, 0.75);
});
void test("sustained very slow visible frames still reduce pixel cost", () => {
  const budget = createResolutionBudget(1.5);
  for (let i = 0; i < 60; i++) stepResolutionBudget(budget, 150, 1.5);
  assert.ok(budget.scale < 1.5, "visible 150ms frames must not be discarded as background gaps");
});
void test("the selectable 30fps target tolerates work that exceeds a 60fps budget", () => {
  const thirty = createResolutionBudget(1.5),
    sixty = createResolutionBudget(1.5);
  for (let i = 0; i < 300; i++) {
    stepResolutionBudget(thirty, 30, 1.5, 30);
    stepResolutionBudget(sixty, 30, 1.5, 60);
  }
  assert.equal(thirty.scale, 1.5);
  assert.ok(sixty.scale < thirty.scale);
});
