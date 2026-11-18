import { enemySpecs, type EnemyKind } from "./ashenParish.ts";
import { kilnAttacks, type KilnAttack } from "./kilnAttacks.ts";
import { houndAttacks, type HoundAttack } from "./houndAttacks.ts";
const kilnSpecs = {
  clamp: { ...enemySpecs.kiln, ...kilnAttacks.clamp },
  sweep: { ...enemySpecs.kiln, ...kilnAttacks.sweep },
  slam: { ...enemySpecs.kiln, ...kilnAttacks.slam },
  check: { ...enemySpecs.kiln, ...kilnAttacks.check },
};
const houndSpecs = {
  pounce: { ...enemySpecs.hound, ...houndAttacks.pounce },
  snap: { ...enemySpecs.hound, ...houndAttacks.snap },
  rake: { ...enemySpecs.hound, ...houndAttacks.rake },
};
/** Simulation, rig posing and audio share exactly the same move timing. */
export function enemyAttackSpec(e: {
  kind: EnemyKind;
  kilnAttack?: KilnAttack;
  houndAttack?: HoundAttack;
}) {
  if (e.kind === "kiln") return kilnSpecs[e.kilnAttack ?? "clamp"];
  if (e.kind === "hound") return houndSpecs[e.houndAttack ?? "pounce"];
  return enemySpecs[e.kind];
}
