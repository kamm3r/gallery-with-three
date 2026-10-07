import type { Encounter } from "../bossEncounter.ts";
import type { Object3D } from "three";
import type { Inventory } from "../inventory.ts";
import { trait } from "koota";
import type { ParishEnemy, EmberBolt } from "../parishEncounter.ts";

export const ParishEnemyState = trait(() => ({ state: null as unknown as ParishEnemy }));
export const EmberProjectile = trait(() => ({ state: null as unknown as EmberBolt }));
export const ParishMember = trait(() => ({ owner: null as object | null, index: 0 }));
export const Combatant = trait();
export const IsBoss = trait();
export const BossCombat = trait(() => ({ state: null as unknown as Encounter }));
export const IsEnemy = trait();
export const IsProjectile = trait();
export const IsDead = trait();
export const PlayerInput = trait(() => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  run: false,
  roll: false,
  interact: false,
  jumpPress: 0,
  rollPress: 0,
  interactPress: 0,
  attackPress: 0,
}));
export const ResultScreen = trait({ active: false });

export const InventoryState = trait(() => ({
  value: { scope: null, catalogue: {}, slots: [], selected: 0 } as Inventory,
}));
export const CameraRig = trait(() => ({ indoor: false }));
export const SprintGate = trait({ allowed: true });
export const ControlStatus = trait(() => ({ paused: false }));
export const HeldItems = trait(() => ({
  flashlightLens: null as Object3D | null,
  flashlightOn: false,
}));
