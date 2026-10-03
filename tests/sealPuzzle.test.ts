import assert from "node:assert/strict";
import test from "node:test";
import { advanceSealPuzzle } from "../src/gameplay/sealPuzzle.ts";

test("the three seals unlock in the carved order", () => {
  let progress = 0;
  progress = advanceSealPuzzle(progress, "sun");
  progress = advanceSealPuzzle(progress, "leaf");
  progress = advanceSealPuzzle(progress, "moon");
  assert.equal(progress, 3);
});

test("a wrong seal resets the sequence", () => {
  const progress = advanceSealPuzzle(2, "sun");
  assert.equal(progress, 1);
});

test("a completed sequence stays complete", () => {
  assert.equal(advanceSealPuzzle(3, "moon"), 3);
});
