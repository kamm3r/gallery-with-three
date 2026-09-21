export const CHARACTER_MODEL = '/assets/quaternius/ultimate-animated-character/Casual_Male_gameplay.glb';
export const CLIP_SECONDS: Record<string, number> = {
  LedgeGrab: .2, LedgeClimb: 1, JumpRise: .3, JumpFall: .6, JumpLand: .2,
  SitEnter: .65, SitExit: .8, SwordSlashQuick: .6, SwordSlashHeavy: .8,
};
// Measured wrist height in the authored LedgeHang pose, at player scale .82.
export const LEDGE_HAND_HEIGHT = 2.160;

export function swordAttackDuration(attackId: number) {
  return CLIP_SECONDS[attackId % 2 ? 'SwordSlashQuick' : 'SwordSlashHeavy'];
}

export function swordHitActive(attackId: number, remaining: number) {
  const progress = 1 - remaining / swordAttackDuration(attackId);
  return progress >= .3 && progress <= .5;
}

export function climbProgress(seconds: number) {
  const progress = Math.min(1, Math.max(0, seconds / CLIP_SECONDS.LedgeClimb));
  const up = Math.min(1, progress / .65);
  const forward = Math.max(0, (progress - .6) / .4);
  return { up: up * up * (3 - 2 * up), forward: forward * forward * (3 - 2 * forward), done: progress === 1 };
}
