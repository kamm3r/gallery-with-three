import { useEffect, useRef } from 'react';

export type ControlName =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'run'
  | 'roll';

export type PlayerControls = Record<ControlName, boolean> & {
  jumpPress: number;
  rollPress: number;
  interactPress: number;
  attackPress: number;
};

const controlNames: ControlName[] = [
  'forward',
  'backward',
  'left',
  'right',
  'jump',
  'run',
  'roll',
];

const keyMap: Record<string, ControlName | undefined> = {
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'forward',
  KeyA: 'left',
  KeyD: 'right',
  KeyF: 'roll',
  KeyS: 'backward',
  KeyW: 'forward',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'jump',
};

const state: PlayerControls = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  run: false,
  roll: false,
  jumpPress: 0,
  rollPress: 0,
  interactPress: 0,
  attackPress: 0,
};

const listeners = new Set<(next: PlayerControls) => void>();
let controlsPaused = false;

export function setControlsPaused(paused: boolean) {
  controlsPaused = paused;
  resetControls();
}

export function setPlayerControl(control: ControlName, active: boolean) {
  if (controlsPaused && active) return;
  if (control === 'jump' && active && !state.jump) state.jumpPress += 1;
  if (control === 'roll' && active && !state.roll) state.rollPress += 1;
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
      if (controlsPaused || (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button, [contenteditable="true"]'))) return;
      if (event.code === 'KeyE' && active && !event.repeat) {
        event.preventDefault();
        state.interactPress++;
        listeners.forEach(listener => listener(state));
        return;
      }
      if (event.code === 'KeyJ' && active && !event.repeat) {
        event.preventDefault();
        state.attackPress++;
        listeners.forEach(listener => listener(state));
        return;
      }
      const control = keyMap[event.code];
      if (!control) return;
      event.preventDefault();
      setPlayerControl(control, active);
    };

    const keyDown = handleKey(true);
    const keyUp = handleKey(false);
    const pointerDown = (event: MouseEvent) => {
      // A click to capture the pointer or operate a menu must not swing a sword.
      if (!mouseAttack || controlsPaused || event.button !== 0 || !document.pointerLockElement) return;
      if (event.target instanceof HTMLElement && event.target.closest('button, input, select, textarea, [role="dialog"]')) return;
      state.attackPress++;
      listeners.forEach(listener => listener(state));
    };
    listeners.add(sync);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('mousedown', pointerDown);
    window.addEventListener('blur', resetControls);

    return () => {
      listeners.delete(sync);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('mousedown', pointerDown);
      window.removeEventListener('blur', resetControls);
      resetControls();
    };
  }, [mouseAttack]);

  return controls;
}
