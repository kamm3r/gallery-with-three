import assert from "node:assert/strict";
import test from "node:test";
import { action, condition, selector, sequence } from "../src/gameplay/behaviorTree.ts";

void test("running actions stop fallback branches, and higher priorities interrupt next tick", () => {
  const context = { interrupted: false, calls: [] as string[] };
  const tree = selector(
    "Priorities",
    sequence(
      "Interrupt",
      condition<typeof context>("Interrupted", (c) => c.interrupted),
      action<typeof context>("Handle interrupt", (c) => {
        c.calls.push("interrupt");
        return "running";
      }),
    ),
    action<typeof context>("Work", (c) => {
      c.calls.push("work");
      return "running";
    }),
    action<typeof context>("Fallback", (c) => {
      c.calls.push("fallback");
      return "success";
    }),
  );
  assert.equal(tree.tick(context), "running");
  context.interrupted = true;
  assert.equal(tree.tick(context), "running");
  assert.deepEqual(context.calls, ["work", "interrupt"]);
});

void test("failed sequence guards cause no effects and permit selector fallback", () => {
  let calls = 0;
  const tree = selector(
    "Choose",
    sequence(
      "Unavailable action",
      condition("Guard", () => false),
      action("Effect", () => {
        calls++;
        return "success";
      }),
    ),
    action("Fallback", () => {
      calls++;
      return "success";
    }),
  );
  assert.equal(tree.tick(undefined), "success");
  assert.equal(calls, 1);
  assert.equal(selector("Empty").tick(undefined), "failure");
  assert.equal(sequence("Empty").tick(undefined), "success");
});

void test("shared tree nodes do not retain another enemy's execution state", () => {
  const tree = sequence(
    "Ready work",
    condition<{ ready: boolean }>("Ready", (c) => c.ready),
    action<{ ready: boolean }>("Work", () => "running"),
  );
  assert.equal(tree.tick({ ready: true }), "running");
  assert.equal(tree.tick({ ready: false }), "failure");
  assert.equal(tree.tick({ ready: true }), "running");
});
