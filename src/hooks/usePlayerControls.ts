import { PlayerInput, ControlStatus } from "../gameplay/ecs/gameplayTraits";
import { runtimeWorld } from "../gameplay/ecs/world";
import { useEffect, useRef } from "react";
import { useGame } from "../gameSettings";
import { SPRINT_HOLD_MS, releaseDodges, type BindingAction } from "../gameplay/controlBindings";

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

const state: PlayerControls = runtimeWorld.get(PlayerInput)!;

const listeners = new Set<(next: PlayerControls) => void>();
const controlStatus = runtimeWorld.get(ControlStatus)!;
let cancelKeyboardDodge = () => {};

/** Live, read-only view of the held controls, for per-frame game logic. */
export const heldControls = (): Readonly<PlayerControls> => state;

export function pressPlayerAttack() {
  if (controlStatus.paused) return;
  state.attackPress++;
  listeners.forEach((listener) => listener(state));
}

export function setControlsPaused(paused: boolean) {
  controlStatus.paused = paused;
  resetControls();
}

export function setPlayerControl(control: ControlName, active: boolean) {
  if (controlStatus.paused && active) return;
  if (control === "jump" && active && !state.jump) state.jumpPress += 1;
  if (control === "roll" && active && !state.roll) state.rollPress += 1;
  if (control === "interact" && active && !state.interact) state.interactPress += 1;
  state[control] = active;
  listeners.forEach((listener) => listener(state));
}

function resetControls() {
  cancelKeyboardDodge();
  controlNames.forEach((control) => {
    state[control] = false;
  });
  listeners.forEach((listener) => listener(state));
}

export function usePlayerControls(mouseAttack = false) {
  const controls = useRef<PlayerControls>({ ...state });
  const { settings } = useGame();

  useEffect(() => {
    const sync = (next: PlayerControls) => {
      controls.current = { ...next };
    };
    const pressed = new Set<string>();
    let dodgeStartedAt: number | null = null;
    let sprintTimer: ReturnType<typeof setTimeout> | undefined;
    const cancelDodge = () => {
      clearTimeout(sprintTimer);
      dodgeStartedAt = null;
      pressed.clear();
    };
    cancelKeyboardDodge = cancelDodge;
    const aliases: Record<string, BindingAction | undefined> = {
      ArrowUp: "forward",
      ArrowDown: "backward",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const actionFor = (code: string): BindingAction | "run" | undefined =>
      code === settings.sprintKey
        ? "run"
        : ((Object.keys(settings.bindings) as BindingAction[]).find(
            (action) => settings.bindings[action] === code,
          ) ?? aliases[code]);
    const handleKey = (active: boolean) => (event: KeyboardEvent) => {
      if (controlStatus.paused) return;
      const action = actionFor(event.code);
      // Releases clear held keys even if focus changed. Interact and attack
      // also work from focused touch buttons; text fields keep normal typing.
      const focusSelector =
        action === "interact" || action === "attack"
          ? 'input, select, textarea, [contenteditable="true"]'
          : 'input, select, textarea, button, [contenteditable="true"]';
      if (active && event.target instanceof HTMLElement && event.target.closest(focusSelector))
        return;
      if (!action) return;
      event.preventDefault();
      if (event.repeat || (active && pressed.has(event.code))) return;
      if (!active && !pressed.has(event.code)) return;
      if (active) pressed.add(event.code);
      else pressed.delete(event.code);
      if (action === "dodge") {
        if (settings.sprintKey) {
          // With a dedicated sprint key, dodge can fire immediately on press.
          if (active) {
            setPlayerControl("roll", true);
            setPlayerControl("roll", false);
          }
          return;
        }
        if (active) {
          dodgeStartedAt = performance.now();
          sprintTimer = setTimeout(() => {
            if (dodgeStartedAt !== null && !controlStatus.paused) setPlayerControl("run", true);
          }, SPRINT_HOLD_MS);
        } else {
          clearTimeout(sprintTimer);
          setPlayerControl("run", false);
          if (dodgeStartedAt !== null && releaseDodges(dodgeStartedAt, performance.now())) {
            setPlayerControl("roll", true);
            setPlayerControl("roll", false);
          }
          dodgeStartedAt = null;
        }
      } else if (action === "attack") {
        if (active) pressPlayerAttack();
      } else {
        // Releasing one alias must not release another still-held movement key.
        setPlayerControl(action, active || [...pressed].some((code) => actionFor(code) === action));
      }
    };

    const keyDown = handleKey(true);
    const keyUp = handleKey(false);
    const pointerDown = (event: MouseEvent) => {
      // A click to capture the pointer or operate a menu must not swing a sword.
      if (
        !mouseAttack ||
        controlStatus.paused ||
        event.button !== 0 ||
        !document.pointerLockElement
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button, input, select, textarea, [role="dialog"]')
      )
        return;
      pressPlayerAttack();
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
      if (cancelKeyboardDodge === cancelDodge) cancelKeyboardDodge = () => {};
    };
  }, [mouseAttack, settings.bindings, settings.sprintKey]);

  return controls;
}
