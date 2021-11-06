import { useState, useEffect, useCallback } from 'react';

const keys: { [key: string]: string } = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  ShiftLeft: 'run',
};
const moveFieldByKey = (key: string) => keys[key];

export const useCharacterControls = () => {
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    run: false,
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    setMovement((m) => ({
      ...m,
      [moveFieldByKey(e.code)]: true,
    }));
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    setMovement((m) => ({
      ...m,
      [moveFieldByKey(e.code)]: false,
    }));
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return movement;
};
