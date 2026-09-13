import { useEffect, useRef } from 'react';

export type ControlName =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'jump'
  | 'run';

export type PlayerControls = Record<ControlName, boolean>;

const keyMap: Record<string, ControlName | undefined> = {
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'forward',
  KeyA: 'left',
  KeyD: 'right',
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
};

const listeners = new Set<(next: PlayerControls) => void>();

export function setPlayerControl(control: ControlName, active: boolean) {
  state[control] = active;
  listeners.forEach((listener) => listener(state));
}

function resetControls() {
  Object.keys(state).forEach((key) => {
    state[key as ControlName] = false;
  });
  listeners.forEach((listener) => listener(state));
}

export function usePlayerControls() {
  const controls = useRef<PlayerControls>({ ...state });

  useEffect(() => {
    const sync = (next: PlayerControls) => {
      controls.current = { ...next };
    };
    const handleKey = (active: boolean) => (event: KeyboardEvent) => {
      const control = keyMap[event.code];
      if (!control) return;
      event.preventDefault();
      setPlayerControl(control, active);
    };

    const keyDown = handleKey(true);
    const keyUp = handleKey(false);
    listeners.add(sync);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', resetControls);

    return () => {
      listeners.delete(sync);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', resetControls);
      resetControls();
    };
  }, []);

  return controls;
}
