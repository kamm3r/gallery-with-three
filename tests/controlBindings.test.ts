import { createRuntimeWorld } from "../src/gameplay/ecs/world.ts";
import { PlayerInput, ControlStatus } from "../src/gameplay/ecs/gameplayTraits.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  defaultBindings,
  readBindings,
  rebind,
  releaseDodges,
  SPRINT_HOLD_MS,
  readSprintKey,
} from "../src/gameplay/controlBindings.ts";

void test("Elden Ring defaults, saved swaps, and malformed bindings", () => {
  assert.equal(defaultBindings.jump, "KeyF");
  assert.equal(defaultBindings.dodge, "Space");
  const custom = rebind(defaultBindings, "jump", "Space");
  assert.equal(custom.jump, "Space");
  assert.equal(custom.dodge, "KeyF");
  assert.deepEqual(readBindings(JSON.parse(JSON.stringify(custom))), custom);
  assert.deepEqual(readBindings({ ...custom, jump: "Escape" }), defaultBindings);
  assert.deepEqual(readBindings({ ...custom, jump: custom.dodge }), defaultBindings);
  assert.deepEqual(readBindings({ jump: "KeyQ" }), defaultBindings);
  assert.deepEqual(rebind(defaultBindings, "jump", "KeyR"), defaultBindings);
  assert.equal(releaseDodges(10, 10 + SPRINT_HOLD_MS - 1), true);
  assert.equal(releaseDodges(10, 10 + SPRINT_HOLD_MS), false);
});

// Run the actual input hook with deterministic browser events and time.
function inputHarness(bindings = defaultBindings, sprintKey: string | null = null) {
  const source = readFileSync(
    new URL("../src/hooks/usePlayerControls.ts", import.meta.url),
    "utf8",
  );
  const js = ts
    .transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "");
  const handlers = new Map<string, Set<(event: unknown) => void>>();
  let now = 0;
  let timer: (() => void) | undefined;
  let cleanup: (() => void) | undefined;
  class Element {
    closest() {
      return this;
    }
  }
  const runtimeWorld = createRuntimeWorld();
  const args = {
    runtimeWorld,
    PlayerInput,
    ControlStatus,
    useEffect: (fn: () => () => void) => {
      cleanup = fn();
    },
    useRef: (current: unknown) => ({ current }),
    useGame: () => ({ settings: { bindings, sprintKey } }),
    SPRINT_HOLD_MS,
    readSprintKey,
    releaseDodges,
    window: {
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: (event: unknown) => void) =>
        handlers.get(type)?.delete(fn),
    },
    document: { pointerLockElement: null },
    HTMLElement: Element,
    performance: { now: () => now },
    setTimeout: (fn: () => void) => {
      timer = fn;
      return 1;
    },
    clearTimeout: () => {
      timer = undefined;
    },
  };
  // The harness executes only the checked-in hook source with isolated browser mocks.
  // oxlint-disable-next-line typescript/no-implied-eval
  const api = new Function(
    ...Object.keys(args),
    `${js}\nreturn {usePlayerControls, heldControls, setControlsPaused};`,
  )(...Object.values(args));
  api.usePlayerControls();
  return {
    state: api.heldControls,
    pause: api.setControlsPaused,
    event(type: string, code = "", repeat = false, focused = false) {
      handlers
        .get(type)
        ?.forEach((fn) =>
          fn({ code, repeat, target: focused ? new Element() : null, preventDefault() {} }),
        );
    },
    advance(ms: number) {
      now += ms;
      if (ms >= SPRINT_HOLD_MS) {
        const fn = timer;
        timer = undefined;
        fn?.();
      }
    },
    cleanup: () => {
      cleanup?.();
      runtimeWorld.destroy();
    },
  };
}

void test("tap dodges on release; holding sprints and releasing never dodges", () => {
  const h = inputHarness();
  h.event("keydown", "Space");
  assert.equal(h.state().rollPress, 0);
  h.advance(70);
  h.event("keyup", "Space");
  assert.equal(h.state().rollPress, 1);
  h.event("keydown", "Space");
  h.advance(SPRINT_HOLD_MS);
  assert.equal(h.state().run, true);
  h.event("keydown", "Space", true);
  h.event("keyup", "Space");
  assert.equal(h.state().run, false);
  assert.equal(h.state().rollPress, 1);
  h.cleanup();
});

void test("jump is separate, bindings apply, alias releases and focus changes do not stick", () => {
  const h = inputHarness(rebind(defaultBindings, "jump", "KeyQ"));
  h.event("keydown", "KeyF");
  assert.equal(h.state().jump, false);
  h.event("keydown", "KeyQ");
  assert.equal(h.state().jumpPress, 1);
  h.event("keyup", "KeyQ", false, true);
  assert.equal(h.state().jump, false);
  h.event("keydown", "KeyW");
  h.event("keydown", "ArrowUp");
  h.event("keyup", "KeyW");
  assert.equal(h.state().forward, true);
  h.event("keyup", "ArrowUp");
  assert.equal(h.state().forward, false);
  h.event("keydown", "KeyE", false, true);
  assert.equal(h.state().interactPress, 0);
  h.cleanup();
});

void test("blur and pause cancel pending dodge/sprint without a release action", () => {
  for (const reset of ["blur", "pause"]) {
    const h = inputHarness();
    h.event("keydown", "Space");
    if (reset === "blur") h.event("blur");
    else {
      h.pause(true);
      h.pause(false);
    }
    h.advance(300);
    h.event("keyup", "Space");
    assert.equal(h.state().run, false);
    assert.equal(h.state().rollPress, 0);
    h.cleanup();
  }
});

void test("a dedicated sprint key works independently, and dodge fires on press", () => {
  const h = inputHarness(defaultBindings, "ShiftLeft");
  h.event("keydown", "ShiftLeft");
  assert.equal(h.state().run, true);
  h.event("keydown", "Space");
  assert.equal(h.state().rollPress, 1);
  h.advance(300);
  h.event("keyup", "Space");
  assert.equal(h.state().run, true);
  assert.equal(h.state().rollPress, 1);
  h.event("keyup", "ShiftLeft");
  assert.equal(h.state().run, false);
  h.cleanup();
});
void test("dedicated sprint settings validate saved keys without shadowing actions", () => {
  assert.equal(readSprintKey("ShiftLeft", defaultBindings), "ShiftLeft");
  assert.equal(readSprintKey("KeyC", defaultBindings), "KeyC");
  for (const code of [null, "KeyF", "Space", "ArrowUp", "Escape", "KeyR", 123])
    assert.equal(readSprintKey(code, defaultBindings), null);
});
