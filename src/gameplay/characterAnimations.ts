import { combatTuning } from "./combatTuning.ts";
export const CHARACTER_MODEL =
  "/assets/quaternius/ultimate-animated-character/Casual_Male_gameplay.glb";
export const CLIP_SECONDS: Record<string, number> = {
  LedgeGrab: 0.2,
  LedgeClimb: 1,
  JumpRise: 0.3,
  JumpFall: 0.6,
  JumpLand: 0.2,
  SitEnter: 0.65,
  SitExit: 0.8,
  SwordSlashQuick: 0.6,
  SwordSlashHeavy: 0.8,
};
// Measured wrist height in the authored LedgeHang pose, at player scale .82.
export const LEDGE_HAND_HEIGHT = 2.16;

export function swordAttackDuration(attackId: number) {
  return CLIP_SECONDS[attackId % 2 ? "SwordSlashQuick" : "SwordSlashHeavy"];
}

export function swordHitActive(attackId: number, remaining: number) {
  const progress = 1 - remaining / swordAttackDuration(attackId);
  return progress >= combatTuning.hitWindowStart && progress <= combatTuning.hitWindowEnd;
}

export function climbProgress(seconds: number) {
  const progress = Math.min(1, Math.max(0, seconds / CLIP_SECONDS.LedgeClimb));
  const up = Math.min(1, progress / 0.65);
  const forward = Math.max(0, (progress - 0.6) / 0.4);
  return {
    up: up * up * (3 - 2 * up),
    forward: forward * forward * (3 - 2 * forward),
    done: progress === 1,
  };
}
