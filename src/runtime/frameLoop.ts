export type Frame = { now: number; interval: number; delta: number };
type FrameClock = {
  now: () => number;
  request: (callback: (now: number) => void) => number;
  cancel: (id: number) => void;
};

/** Each mount starts from real time; resuming never includes time spent paused. */
export function startFrameLoop(
  update: (frame: Frame) => void,
  clock: FrameClock = {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
) {
  let previous = clock.now();
  let running = true;
  let pending: number;
  const tick = (now: number) => {
    if (!running) return;
    const interval = Math.max(0, now - previous);
    previous = now;
    update({ now, interval, delta: Math.min(interval / 1000, 0.05) });
    if (running) pending = clock.request(tick);
  };
  pending = clock.request(tick);
  return () => {
    if (!running) return;
    running = false;
    clock.cancel(pending);
  };
}
