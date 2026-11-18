export type CombatChoice = "attack" | "circle" | "retreat";

/** Stable per enemy and decision: never reroll at render-frame frequency. */
export function combatRoll(id: string, decision: number) {
  let hash = 2166136261;
  for (const char of `${id}:${decision}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/** Distance weights change tactics; the first engagement remains decisive. */
export function chooseCombatAction(
  distance: number,
  range: number,
  decision: number,
  roll: number,
): CombatChoice {
  if (decision === 0) return "attack";
  const close = distance < range * 0.55;
  const weights = { attack: close ? 5 : 7, circle: 3, retreat: close ? 3 : 0 };
  const sample =
    Math.max(0, Math.min(1 - Number.EPSILON, roll)) *
    (weights.attack + weights.circle + weights.retreat);
  if (sample < weights.attack) return "attack";
  return sample < weights.attack + weights.circle ? "circle" : "retreat";
}
