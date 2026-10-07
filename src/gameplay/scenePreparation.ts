type FrameScheduler = Pick<typeof globalThis, "requestAnimationFrame" | "cancelAnimationFrame">;

export function waitForPreparationFrame(scheduler: FrameScheduler = globalThis): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve();
    };
    // Hidden or throttled previews may never deliver RAF. Loading must still
    // progress, and late callbacks must not retain the preparation job.
    const timeout = setTimeout(() => {
      scheduler.cancelAnimationFrame(frame);
      finish();
    }, 100);
    const frame = scheduler.requestAnimationFrame(finish);
  });
}
