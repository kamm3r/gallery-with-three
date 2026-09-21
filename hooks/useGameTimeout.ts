import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useGame } from '../app/gameSettings';

// Portal transitions use the same pause boundary as the scene.
export function useGameTimeout() {
  const { paused } = useGame();
  const timers = useRef(new Map<number, { callback: () => void; remaining: number; started: number; handle?: ReturnType<typeof setTimeout> }>());
  const sequence = useRef(0);
  const pausedRef = useRef(paused);
  const arm = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (!timer) return;
    timer.started = performance.now();
    timer.handle = setTimeout(() => {
      timers.current.delete(id);
      timer.callback();
    }, timer.remaining);
  }, []);
  useLayoutEffect(() => {
    pausedRef.current = paused;
    for (const [id, timer] of timers.current) {
      if (paused && timer.handle !== undefined) {
        clearTimeout(timer.handle);
        timers.current.set(id, {
          ...timer,
          handle: undefined,
          remaining: Math.max(0, timer.remaining - (performance.now() - timer.started)),
        });
      } else if (!paused && timer.handle === undefined) arm(id);
    }
  }, [arm, paused]);
  const schedule = useCallback((callback: () => void, delay: number) => {
    const id = ++sequence.current;
    timers.current.set(id, { callback, remaining: delay, started: 0 });
    if (!pausedRef.current) arm(id);
    return id;
  }, [arm]);
  const cancel = useCallback((id: number) => {
    clearTimeout(timers.current.get(id)?.handle);
    timers.current.delete(id);
  }, []);
  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      for (const timer of currentTimers.values()) clearTimeout(timer.handle);
      currentTimers.clear();
    };
  }, []);
  return { schedule, cancel };
}
