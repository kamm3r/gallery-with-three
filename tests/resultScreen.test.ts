import test from "node:test";
import assert from "node:assert/strict";
import { isResultScreenActive, setResultScreenActive } from "../src/gameplay/resultScreen.ts";

test("results release the cursor with the pause-suppression flag already set", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  let released = false;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      pointerLockElement: {},
      exitPointerLock() {
        assert.equal(isResultScreenActive(), true);
        released = true;
      },
    },
  });
  try {
    setResultScreenActive(true);
    assert.equal(released, true);
    setResultScreenActive(false);
    assert.equal(isResultScreenActive(), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
