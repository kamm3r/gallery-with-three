export function createFrameTelemetry() {
  return {
    intervals: new Float32Array(360),
    work: new Float32Array(360),
    cursor: 0,
    count: 0,
    previous: 0,
  };
}
export type FrameTelemetry = ReturnType<typeof createFrameTelemetry>;
export function recordFrame(telemetry: FrameTelemetry, interval: number, work: number) {
  if (!Number.isFinite(interval) || interval < 2 || interval > 2000) return;
  telemetry.intervals[telemetry.cursor] = interval;
  telemetry.work[telemetry.cursor] = work;
  telemetry.cursor = (telemetry.cursor + 1) % telemetry.intervals.length;
  telemetry.count = Math.min(telemetry.count + 1, telemetry.intervals.length);
}
/** Sorting only happens when diagnostics are requested, never in the frame loop. */
export function summarizeFrames(telemetry: FrameTelemetry) {
  const frames = Array.from(telemetry.intervals.subarray(0, telemetry.count)).sort((a, b) => a - b);
  const percentile = (p: number) => frames[Math.max(0, Math.ceil(frames.length * p) - 1)] ?? 0;
  return {
    samples: frames.length,
    fps: frames.length ? (frames.length * 1000) / frames.reduce((a, b) => a + b, 0) : 0,
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    worstMs: frames.at(-1) ?? 0,
    over50Ms: frames.filter((ms) => ms > 50).length,
    advanceCpuMaxMs: Math.max(0, ...telemetry.work.subarray(0, telemetry.count)),
  };
}
