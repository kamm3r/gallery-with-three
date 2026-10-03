import { useEffect, useRef } from "react";

export type ControlName =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "jump"
  | "run"
  | "roll"
  | "interact";

export type PlayerControls = Record<ControlName, boolean> & {
  jumpPress: number;
  rollPress: number;
  interactPress: number;
  attackPress: number;
};

const controlNames: ControlName[] = [
  "forward",
  "backward",
  "left",
  "right",
  "jump",
  "run",
  "roll",
  "interact",
];

const keyMap: Record<string, ControlName | undefined> = {
  ArrowDown: "backward",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "forward",
  KeyA: "left",
  KeyD: "right",
  KeyF: "roll",
  KeyS: "backward",
  KeyW: "forward",
  ShiftLeft: "run",
  ShiftRight: "run",
  Space: "jump",
};

const state: PlayerControls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  run: false,
  roll: false,
  interact: false,
  jumpPress: 0,
  rollPress: 0,
  interactPress: 0,
  attackPress: 0,
};

const listeners = new Set<(next: PlayerControls) => void>();
let controlsPaused = false;

// TEMP-PROOF: diagnose E-ignore. Revert.
if (typeof window !== "undefined") {
  (window as unknown as { __cpaused?: () => boolean }).__cpaused = () => controlsPaused;
}

/** Live, read-only view of the held controls, for per-frame game logic. */
export const heldControls = (): Readonly<PlayerControls> => state;

export function setControlsPaused(paused: boolean) {
  controlsPaused = paused;
  resetControls();
}

export function setPlayerControl(control: ControlName, active: boolean) {
  if (controlsPaused && active) return;
  if (control === "jump" && active && !state.jump) state.jumpPress += 1;
  if (control === "roll" && active && !state.roll) state.rollPress += 1;
  if (control === "interact" && active && !state.interact) state.interactPress += 1;
  state[control] = active;
  listeners.forEach((listener) => listener(state));
}

function resetControls() {
  controlNames.forEach((control) => {
    state[control] = false;
  });
  listeners.forEach((listener) => listener(state));
}

export function usePlayerControls(mouseAttack = false) {
  const controls = useRef<PlayerControls>({ ...state });

  useEffect(() => {
    const sync = (next: PlayerControls) => {
      controls.current = { ...next };
    };
    const handleKey = (active: boolean) => (event: KeyboardEvent) => {
      // Interact/attack are window-level verbs with no text-field use in game,
      // so they fire regardless of DOM focus (a focused menu or touch button
      // must never silently swallow E). Movement keys keep the focus filter
      // below so sliders and selects stay operable.
      if (controlsPaused) return;
      if (event.code === "KeyE") {
        // Pressed counts once; held stays true until release (hold-to-search).
        event.preventDefault();
        if (!event.repeat) setPlayerControl("interact", active);
        return;
      }
      if (event.code === "KeyJ" && active && !event.repeat) {
        event.preventDefault();
        state.attackPress++;
        listeners.forEach((listener) => listener(state));
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, select, textarea, button, [contenteditable="true"]')
      )
        return;
      const control = keyMap[event.code];
      if (!control) return;
      event.preventDefault();
      setPlayerControl(control, active);
    };

    const keyDown = handleKey(true);
    const keyUp = handleKey(false);
    const pointerDown = (event: MouseEvent) => {
      // A click to capture the pointer or operate a menu must not swing a sword.
      if (!mouseAttack || controlsPaused || event.button !== 0 || !document.pointerLockElement)
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, input, select, textarea, [role="dialog"]')
      )
        return;
      state.attackPress++;
      listeners.forEach((listener) => listener(state));
    };
    listeners.add(sync);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("mousedown", pointerDown);
    window.addEventListener("blur", resetControls);

    return () => {
      listeners.delete(sync);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("mousedown", pointerDown);
      window.removeEventListener("blur", resetControls);
      resetControls();
    };
  }, [mouseAttack]);

  return controls;
}
