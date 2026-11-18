export type ResolutionBudget = {
  scale: number;
  averageMs: number;
  slow: number;
  fast: number;
  cooldown: number;
};
export function createResolutionBudget(maximum: number): ResolutionBudget {
  return { scale: maximum, averageMs: 16.7, slow: 0, fast: 0, cooldown: 2 };
}
/** Sustained frame pressure lowers pixel cost; recovery is deliberately slower. */
export function stepResolutionBudget(
  state: ResolutionBudget,
  frameMs: number,
  maximum: number,
  targetFps = 60,
) {
  if (!Number.isFinite(frameMs) || frameMs < 2 || frameMs > 500) return state.scale;
  const dt = Math.min(frameMs / 1000, 0.1);
  const target = 1000 / targetFps;
  state.averageMs += (frameMs - state.averageMs) * (1 - Math.exp(-dt * 2));
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.slow = state.averageMs > target * 1.16 ? state.slow + dt : 0;
  state.fast = state.averageMs < target * 1.02 ? state.fast + dt : 0;
  if (state.cooldown === 0 && state.slow > 1) {
    state.scale = Math.max(
      Math.min(0.75, maximum),
      Math.round((state.scale - 0.125) * 1000) / 1000,
    );
    state.slow = 0;
    state.fast = 0;
    state.cooldown = 2;
  } else if (state.cooldown === 0 && state.fast > 6) {
    state.scale = Math.min(maximum, state.scale + 0.125);
    state.fast = 0;
    state.cooldown = 3;
  }
  return state.scale;
}
