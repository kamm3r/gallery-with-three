import test from "node:test";
import assert from "node:assert/strict";
import { waitForPreparationFrame } from "../src/gameplay/scenePreparation.ts";

void test("graphics preparation cannot wait forever when a preview stops delivering animation frames", async () => {
  const cancelled: number[] = [];
  const scheduler = {
    requestAnimationFrame: () => 42,
    cancelAnimationFrame: (id: number) => {
      cancelled.push(id);
    },
  };
  const result = await Promise.race([
    waitForPreparationFrame(scheduler).then(() => "continued"),
    new Promise<string>((resolve) => setTimeout(() => resolve("stalled"), 250)),
  ]);
  assert.equal(result, "continued");
  assert.deepEqual(cancelled, [42], "release an undelivered frame callback");
});
