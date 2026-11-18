import { test } from "vite-plus/test";
import assert from "node:assert/strict";
import {
  defaultBindings,
  readBindings,
  rebind,
  readSprintKey,
} from "../src/gameplay/controlBindings.ts";

test("saved bindings reject reserved or duplicate keys and rebinding swaps conflicts", () => {
  const swapped = rebind(defaultBindings, "jump", "Space");
  assert.equal(swapped.jump, "Space");
  assert.equal(swapped.dodge, "KeyF");
  assert.deepEqual(readBindings(swapped), swapped);
  for (const malformed of [{}, { ...swapped, jump: "Escape" }, { ...swapped, jump: swapped.dodge }])
    assert.deepEqual(readBindings(malformed), defaultBindings);
});

test("dedicated sprint cannot shadow a gameplay action or a reserved key", () => {
  assert.equal(readSprintKey("ShiftLeft", defaultBindings), "ShiftLeft");
  for (const code of ["KeyW", "KeyR", "ArrowUp", "Escape", null])
    assert.equal(readSprintKey(code, defaultBindings), null);
});
