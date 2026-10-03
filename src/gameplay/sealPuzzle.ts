const SEAL_ORDER = ["sun", "leaf", "moon"] as const;

export type SealName = (typeof SEAL_ORDER)[number];

export function advanceSealPuzzle(progress: number, pressedSeal: SealName): number {
  if (progress >= SEAL_ORDER.length) return progress;
  if (pressedSeal === SEAL_ORDER[progress]) return progress + 1;
  return pressedSeal === SEAL_ORDER[0] ? 1 : 0;
}
