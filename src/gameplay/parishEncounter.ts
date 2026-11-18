import { chooseCombatAction, combatRoll } from "./combatWheel.ts";
import {
  houndAttacks,
  houndRakeContains,
  selectHoundAttack,
  type HoundAttack,
} from "./houndAttacks.ts";
import { enemyAttackSpec } from "./enemyAttacks.ts";
import {
  kilnAttacks,
  kilnSweepContains,
  kilnSweepWindow,
  kilnSlamImpact,
  kilnSlamRadius,
  selectKilnAttack,
  type KilnAttack,
} from "./kilnAttacks.ts";
import { action, condition, selector, sequence, type BehaviorNode } from "./behaviorTree.ts";
import { createEncounter, stepEncounter, type Encounter } from "./bossEncounter.ts";
import { swordHitActive, swordSpec } from "./characterAnimations.ts";
import {
  RIPOSTE_MULTIPLIER,
  RIPOSTE_TIME,
  receiveBlow,
  type BlowOutcome,
} from "./playerDefense.ts";
import { combatTuning } from "./combatTuning.ts";
import {
  enemySpecs,
  parishEnemySpawns,
  parishFloorHeight,
  parishBlocked,
  parishShortcuts,
  parishShrines,
  PARISH_ARENA_Y,
  type EnemyKind,
  type ParishProgress,
} from "./ashenParish.ts";

export type EnemyPhase =
  | "idle"
  | "pursue"
  | "guard"
  | "circle"
  | "retreat"
  | "search"
  | "windup"
  | "strike"
  | "recovery"
  | "stagger"
  | "dead";
export type ParishEnemy = {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeZ: number;
  health: number;
  yaw: number;
  phase: EnemyPhase;
  timer: number;
  hit: boolean;
  flash: number;
  stride: number;
  deathTime: number;
  targetX: number;
  targetZ: number;
  poise: number;
  poiseDelay: number;
  staggerLockout: number;
  /** While positive, a parry has left this enemy open: the next blow is a riposte. */
  riposte: number;
  flinch: number;
  guardFlash: number;
  moveAmount: number;
  orbit: number;
  attackNumber: number;
  comboStep: number;
  kilnAttack?: KilnAttack;
  houndAttack?: HoundAttack;
  awareness: number;
  lastSeenX: number;
  lastSeenZ: number;
  surfaceId: string | null;
  /** Clinger unfolds over time instead of snapping on aggro or attack transitions. */
  folded: number;
};
export type EmberBolt = {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
};
export type ParishWorld = {
  campaign: boolean;
  spawns: typeof parishEnemySpawns;
  shrines: typeof parishShrines;
  floorHeight: typeof parishFloorHeight;
  blocked: typeof parishBlocked;
  surfaceId?: (x: number, z: number, y: number) => string | null;
  connected?: (from: string, to: string) => boolean;
  lineClear: (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    progress: ParishProgress,
    nearY: number,
  ) => boolean;
};

export function createParishEncounter(progress: ParishProgress, world: ParishWorld | null = null) {
  const combat = createEncounter(PARISH_ARENA_Y);
  combat.bossActive = false;
  combat.freezeOnVictory = false;
  combat.fatalFalls = true;
  const spawn = (world?.shrines ?? parishShrines).find((s) => s.id === progress.checkpoint)!.spawn;
  [combat.playerX, combat.playerY, combat.playerZ] = spawn;
  return {
    combat,
    world,
    activeBoss: null as "cathedral" | "colosseum" | null,
    enemies: world?.campaign && progress.finalFelled ? [] : createEnemies(world),
    bolts: [] as EmberBolt[],
    boltId: 0,
    enemyHitId: 0,
    resolvedAttack: 0,
    embers: 0,
    flasks: 3,
    healTime: 0,
    dialogue: "",
    dialogueTime: 0,
    bossFelled: world?.campaign ? progress.finalFelled : false,
  };
}
export type ParishEncounter = ReturnType<typeof createParishEncounter>;
export function resetParishEncounter(state: ParishEncounter, progress: ParishProgress) {
  const fresh = createParishEncounter(progress, state.world);
  const combat = state.combat;
  Object.assign(combat, fresh.combat);
  return Object.assign(state, fresh, { combat, embers: state.embers });
}
function createEnemies(world: ParishWorld | null = null): ParishEnemy[] {
  return (world?.spawns ?? parishEnemySpawns).map(({ id, kind, position: [x, y, z] }, index) => ({
    id,
    kind,
    folded: kind === "clinger" ? 1 : 0,
    x,
    y,
    z,
    homeX: x,
    homeZ: z,
    health: enemySpecs[kind].health,
    yaw: Math.PI,
    phase: "idle",
    timer: 0,
    hit: false,
    flash: 0,
    stride: 0,
    deathTime: 0,
    targetX: x,
    targetZ: z,
    poise: enemySpecs[kind].poise,
    poiseDelay: 0,
    staggerLockout: 0,
    riposte: 0,
    flinch: 0,
    guardFlash: 0,
    moveAmount: 0,
    orbit: index % 2 ? 1 : -1,
    attackNumber: 0,
    comboStep: 0,
    awareness: 0,
    lastSeenX: x,
    lastSeenZ: z,
    surfaceId: world?.surfaceId?.(x, z, y) ?? null,
  }));
}

/** A single geometric rule is shared by AI, projectiles and melee visibility. */
export function parishLineClear(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  progress: ParishProgress,
  nearY = 0,
  world: ParishWorld | null = null,
) {
  if (world) return world.lineClear(ax, az, bx, bz, progress, nearY);
  for (const gate of parishShortcuts) {
    if (progress[gate.id] || Math.abs(nearY - gate.position[1]) > 2 || ax === bx) continue;
    const t = (gate.position[0] - ax) / (bx - ax);
    if (t >= 0 && t <= 1 && Math.abs(az + (bz - az) * t - gate.position[2]) < 4) return false;
  }
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t,
      z = az + (bz - az) * t;
    const height = parishFloorHeight(x, z, nearY);
    if (height === null || parishBlocked(x, height, z)) return false;
  }
  return true;
}
function face(enemy: ParishEnemy, x: number, z: number, dt: number) {
  const target = Math.atan2(x - enemy.x, z - enemy.z);
  const diff = Math.atan2(Math.sin(target - enemy.yaw), Math.cos(target - enemy.yaw));
  enemy.yaw += Math.max(-dt * 3.2, Math.min(dt * 3.2, diff));
}
function move(
  enemy: ParishEnemy,
  x: number,
  z: number,
  speed: number,
  dt: number,
  progress: ParishProgress,
  others: ParishEnemy[],
  world: ParishWorld | null,
) {
  const distance = Math.hypot(x - enemy.x, z - enemy.z);
  if (distance < 0.1) return;
  const step = Math.min(distance, speed * dt);
  const dx = (x - enemy.x) / distance,
    dz = (z - enemy.z) / distance;
  const candidates = [
    [enemy.x + dx * step, enemy.z + dz * step],
    [enemy.x + dz * step * enemy.orbit, enemy.z - dx * step * enemy.orbit],
    [enemy.x - dz * step * enemy.orbit, enemy.z + dx * step * enemy.orbit],
  ];
  let chosen: [number, number, number] | undefined;
  for (const [nx, nz] of candidates) {
    const height = (world?.floorHeight ?? parishFloorHeight)(nx, nz, enemy.y);
    const surfaceId = height === null ? null : world?.surfaceId?.(nx, nz, height);
    if (
      height === null ||
      (world?.blocked ?? parishBlocked)(nx, height, nz, 0.4) ||
      Math.abs(height - enemy.y) > 0.6 ||
      (enemy.surfaceId &&
        surfaceId &&
        world?.connected &&
        !world.connected(enemy.surfaceId, surfaceId)) ||
      !parishLineClear(enemy.x, enemy.z, nx, nz, progress, enemy.y, world) ||
      Math.hypot(nx - enemy.homeX, nz - enemy.homeZ) > 12 ||
      others.some(
        (other) =>
          other !== enemy &&
          other.health > 0 &&
          Math.abs(other.y - height) < 1 &&
          Math.hypot(nx - other.x, nz - other.z) < 0.9 &&
          Math.hypot(nx - other.x, nz - other.z) < Math.hypot(enemy.x - other.x, enemy.z - other.z),
      )
    )
      continue;
    chosen = [nx, nz, height];
    break;
  }
  if (!chosen) return;
  const [nx, nz, height] = chosen;
  const forward = (nx - enemy.x) * Math.sin(enemy.yaw) + (nz - enemy.z) * Math.cos(enemy.yaw);
  enemy.x = nx;
  enemy.z = nz;
  enemy.y = height;
  enemy.surfaceId = world?.surfaceId?.(nx, nz, height) ?? null;
  enemy.stride += step * 4.8 * (forward < 0 ? -1 : 1);
  enemy.moveAmount = Math.min(1, step / Math.max(0.001, dt * enemySpecs[enemy.kind].speed));
}
/** A blow from an enemy or bolt; melee blows can be parried, bolts only guarded. */
function damagePlayer(
  combat: Encounter,
  damage: number,
  x: number,
  z: number,
  parryable = false,
  knockback = 4,
): BlowOutcome | null {
  if (combat.hurtTime > 0 || combat.health <= 0) return null;
  return receiveBlow(combat, { damage, x, z, knockback, parryable });
}
/** Health damage and poise are independent: a flinch must not cancel every action. */
export function hitParishEnemy(state: ParishEncounter, enemy: ParishEnemy, step = 0) {
  if (enemy.health <= 0) return;
  const spec = enemyAttackSpec(enemy);
  const dx = state.combat.playerX - enemy.x,
    dz = state.combat.playerZ - enemy.z;
  const front =
    (dx * Math.sin(enemy.yaw) + dz * Math.cos(enemy.yaw)) / Math.max(0.01, Math.hypot(dx, dz));
  const blocked =
    enemy.kind === "sentinel" && ["guard", "pursue"].includes(enemy.phase) && front > 0.55;
  const swing = swordSpec(step);
  let damage =
    Math.round(combatTuning.baseDamage * swing.motion) + (enemy.phase === "recovery" ? 10 : 0);
  if (enemy.riposte > 0) {
    damage = Math.round(damage * RIPOSTE_MULTIPLIER);
    enemy.riposte = 0;
  }
  enemy.health = Math.max(
    0,
    enemy.health - (blocked ? Math.max(1, Math.round(damage * 0.2)) : damage),
  );
  enemy.flash = blocked ? 0 : 1;
  enemy.guardFlash = blocked ? 1 : 0;
  enemy.flinch = blocked ? 0 : 0.18;
  enemy.poiseDelay = 2.5;
  state.enemyHitId++;
  // A clean blow freezes the fight for an instant; a guarded one barely does.
  state.combat.hitStop = blocked ? 0.03 : swing.hitStop;
  if (enemy.health <= 0) {
    enemy.phase = "dead";
    enemy.timer = 0;
    state.embers += spec.reward;
    return;
  }
  const armored =
    enemy.phase === "strike" ||
    (enemy.phase === "windup" && enemy.timer >= parishWindupDuration(enemy) * spec.armorStart);
  // Existing stagger never extends. Protection leaves enough time to retaliate.
  if (enemy.phase === "stagger" || enemy.staggerLockout > 0 || armored) return;
  enemy.poise -= blocked ? Math.round(swing.poise * 0.35) : swing.poise;
  if (enemy.poise > 0) return;
  enemy.poise = spec.poise;
  enemy.phase = "stagger";
  enemy.timer = 0;
  enemy.staggerLockout = spec.stagger + spec.staggerProtection;
}
function frontalToPlayer(enemy: ParishEnemy, combat: Encounter) {
  const dx = combat.playerX - enemy.x,
    dz = combat.playerZ - enemy.z;
  return (dx * Math.sin(enemy.yaw) + dz * Math.cos(enemy.yaw)) / Math.max(0.01, Math.hypot(dx, dz));
}
function canCommit(state: ParishEncounter, enemy: ParishEnemy) {
  if (enemy.kind === "acolyte") return true;
  const attackers = state.enemies.filter(
    (other) =>
      other !== enemy &&
      other.health > 0 &&
      other.kind !== "acolyte" &&
      ["windup", "strike"].includes(other.phase) &&
      Math.abs(other.y - enemy.y) < 1.8 &&
      Math.hypot(other.x - enemy.x, other.z - enemy.z) < 8,
  );
  if (attackers.length >= 2) return false;
  // One attacker per approach, but two genuinely separate flanks can commit.
  return attackers.every((other) => {
    const ax = enemy.x - state.combat.playerX,
      az = enemy.z - state.combat.playerZ;
    const bx = other.x - state.combat.playerX,
      bz = other.z - state.combat.playerZ;
    return (ax * bx + az * bz) / Math.max(0.01, Math.hypot(ax, az) * Math.hypot(bx, bz)) < 0.35;
  });
}
export function parishWindupDuration(
  enemy: Pick<ParishEnemy, "kind" | "comboStep" | "kilnAttack" | "houndAttack">,
) {
  const spec = enemyAttackSpec(enemy);
  return enemy.comboStep > 0 ? spec.followupWindup : spec.windup;
}
function beginAttack(enemy: ParishEnemy, followup = false) {
  enemy.phase = "windup";
  enemy.attackNumber++;
  enemy.comboStep = followup ? 1 : 0;
  enemy.timer = 0;
  enemy.hit = false;
}

export function restAtParishShrine(state: ParishEncounter) {
  if (state.combat.bossActive || state.combat.health <= 0 || parishThreatened(state)) return false;
  state.combat.health = combatTuning.playerMaxHealth;
  state.combat.stamina = 100;
  state.combat.hurtTime = 0;
  state.combat.attackTime = 0;
  if (!state.bossFelled) state.enemies = createEnemies(state.world);
  state.bolts = [];
  state.flasks = 3;
  state.healTime = 0;
  return true;
}
export function parishThreatened(state: ParishEncounter) {
  const c = state.combat;
  return (
    state.bolts.length > 0 ||
    state.enemies.some(
      (e) =>
        e.health > 0 &&
        Math.abs(e.y - c.playerY) < 2 &&
        Math.hypot(e.x - c.playerX, e.z - c.playerZ) < 10,
    )
  );
}
/** Seconds a flask commits the player: slowed, and unable to attack, roll or guard. */
export const FLASK_DRINK_TIME = 1;
export function drinkEmber(state: ParishEncounter) {
  const c = state.combat;
  if (
    state.flasks <= 0 ||
    c.health <= 0 ||
    c.health >= combatTuning.playerMaxHealth ||
    c.hurtTime > 0 ||
    c.attackTime > 0 ||
    c.invulnerable ||
    c.rolling ||
    c.parryTime >= 0 ||
    c.plunging ||
    state.healTime > 0
  )
    return false;
  state.flasks--;
  c.health = Math.min(combatTuning.playerMaxHealth, c.health + 45);
  state.healTime = FLASK_DRINK_TIME;
  c.drinkTime = FLASK_DRINK_TIME;
  return true;
}
export function stepParishEncounter(
  state: ParishEncounter,
  delta: number,
  progress: ParishProgress,
  stepEnemies = stepParishEnemies,
  stepProjectiles = stepParishProjectiles,
  stepCombat = stepEncounter,
) {
  const step = Math.min(delta, 0.05),
    c = state.combat;
  // Hit-stop holds the whole fight still, enemies and bolts included, for exactly
  // its length; the rest of the frame plays on.
  const held = Math.min(c.hitStop, step);
  stepCombat(c, step);
  const dt = step - held;
  if (dt <= 1e-6) return;
  state.healTime = Math.max(0, state.healTime - dt);
  state.dialogueTime = Math.max(0, state.dialogueTime - dt);
  if (state.dialogueTime === 0) state.dialogue = "";
  if (c.health <= 0) return;
  if (state.world?.campaign && c.bossActive && c.bossHealth <= 0) {
    if (state.activeBoss === "cathedral") {
      progress.cathedralFelled = true;
    } else {
      progress.finalFelled = true;
      state.bossFelled = true;
    }
    c.bossActive = false;
    // Inactive campaign encounters still use the normal player recovery rules.
    // A zero boss health would enter the legacy victory branch every frame.
    c.bossHealth = combatTuning.bossMaxHealth;
    state.activeBoss = null;
    state.bolts = [];
  }
  if (!state.world?.campaign && c.bossHealth <= 0) {
    if (!state.bossFelled) {
      for (const enemy of state.enemies) {
        enemy.health = 0;
        enemy.phase = "dead";
      }
    }
    state.bossFelled = true;
    c.bossActive = false;
    state.bolts = [];
    for (const enemy of state.enemies) enemy.deathTime += dt;
    return;
  }

  if (
    c.attackTime > 0 &&
    !c.plunging &&
    swordHitActive(c.attackStep, c.attackTime) &&
    state.resolvedAttack !== c.attackId
  ) {
    state.resolvedAttack = c.attackId;
    const swing = swordSpec(c.attackStep);
    // Sort a filtered copy, never reorder the live rig array.
    const struck = state.enemies
      .filter((e) => {
        const dx = e.x - c.playerX,
          dz = e.z - c.playerZ,
          distance = Math.hypot(dx, dz);
        const facing =
          (dx * Math.sin(c.playerYaw) + dz * Math.cos(c.playerYaw)) / Math.max(0.01, distance);
        return (
          e.health > 0 &&
          Math.abs(e.y - c.playerY) < 1.8 &&
          (swing.radius
            ? distance < swing.radius
            : distance < combatTuning.hitDistance && facing > combatTuning.hitFacingThreshold) &&
          parishLineClear(c.playerX, c.playerZ, e.x, e.z, progress, c.playerY, state.world)
        );
      })
      .sort(
        (a, b) =>
          Math.hypot(a.x - c.playerX, a.z - c.playerZ) -
          Math.hypot(b.x - c.playerX, b.z - c.playerZ),
      );
    // A swing strikes the nearest enemy; a plunge strikes everyone around it.
    for (const target of swing.radius ? struck : struck.slice(0, 1))
      hitParishEnemy(state, target, c.attackStep);
  }
  // Enemies are engaged once any of them is closing in or fighting nearby.
  c.inCombat =
    c.bossActive ||
    state.enemies.some(
      (e) =>
        e.health > 0 &&
        !["idle", "search", "dead"].includes(e.phase) &&
        Math.hypot(e.x - c.playerX, e.z - c.playerZ) < 18,
    );

  stepEnemies(state, dt, progress);
  stepProjectiles(state, dt, progress);
}

type EnemyBehaviorContext = {
  state: ParishEncounter;
  e: ParishEnemy;
  c: Encounter;
  dt: number;
  progress: ParishProgress;
  spec: (typeof enemySpecs)[EnemyKind];
  distance: number;
  visible: boolean;
};

function enemyTask(
  name: string,
  run: (context: EnemyBehaviorContext) => void,
): BehaviorNode<EnemyBehaviorContext> {
  return action(name, (context) => {
    run(context);
    return "running";
  });
}

function enemyBranch(
  name: string,
  guard: (context: EnemyBehaviorContext) => boolean,
  ...children: BehaviorNode<EnemyBehaviorContext>[]
) {
  return sequence(name, condition(`${name} allowed`, guard), ...children);
}

function moveEnemyTo(context: EnemyBehaviorContext, x: number, z: number, speed: number) {
  const { state, e, dt, progress } = context;
  move(e, x, z, speed, dt, progress, state.enemies, state.world);
}

const attackWhenReady = (range: number | ((context: EnemyBehaviorContext) => number)) =>
  enemyBranch(
    "Commit attack",
    (context) => {
      const { e, c, spec, distance, state } = context;
      return (
        distance <= (typeof range === "number" ? range : range(context)) &&
        e.timer > spec.decisionDelay &&
        frontalToPlayer(e, c) > (e.kind === "kiln" ? 0.1 : e.kind === "hound" ? 0.25 : 0.65) &&
        canCommit(state, e)
      );
    },
    enemyTask("Begin windup", (context) => {
      const { e, distance, c } = context;
      if (e.kind === "kiln") {
        const selected = selectKilnAttack(
          distance,
          frontalToPlayer(e, c),
          e.kilnAttack ?? "check",
          e.attackNumber,
        );
        if (distance > kilnAttacks[selected].range) {
          e.phase = "pursue";
          moveEnemyTo(context, c.playerX, c.playerZ, enemySpecs.kiln.speed);
          return;
        }
        e.kilnAttack = selected;
      }
      if (e.kind === "hound") {
        const selected = selectHoundAttack(distance, frontalToPlayer(e, c), e.houndAttack);
        if (distance > houndAttacks[selected].range) {
          e.phase = "pursue";
          moveEnemyTo(context, c.playerX, c.playerZ, enemySpecs.hound.speed * 0.55);
          return;
        }
        e.houndAttack = selected;
      }
      beginAttack(e);
    }),
  );

const acolyteTree = selector(
  "Acolyte tactics",
  enemyBranch(
    "Create casting space",
    ({ distance, e, spec }) => distance < 4.5 && e.timer < spec.decisionDelay,
    enemyTask("Retreat", (context) => {
      const { e, c, spec, distance } = context;
      e.phase = "retreat";
      const length = Math.max(0.1, distance);
      moveEnemyTo(
        context,
        e.x + ((e.x - c.playerX) / length) * 2,
        e.z + ((e.z - c.playerZ) / length) * 2,
        spec.speed * 1.6,
      );
    }),
  ),
  attackWhenReady(({ spec }) => spec.range),
  enemyTask("Approach casting range", (context) => {
    const { e, c, spec, distance } = context;
    e.phase = "pursue";
    if (distance > spec.range * 0.85) moveEnemyTo(context, c.playerX, c.playerZ, spec.speed);
  }),
);

function meleeTree(kind: Exclude<EnemyKind, "acolyte">) {
  return selector(
    `${kind} tactics`,
    enemyBranch(
      "Close the gap",
      ({ distance, spec }) => distance > spec.range + 0.4,
      enemyTask("Pursue", (context) => {
        const { e, c, spec } = context;
        e.phase = "pursue";
        moveEnemyTo(context, c.playerX, c.playerZ, spec.speed);
      }),
    ),
    sequence(
      "Fight at melee range",
      action<EnemyBehaviorContext>("Adopt combat stance", ({ e }) => {
        e.phase = kind === "hound" ? "circle" : "guard";
        return "success";
      }),
      selector(
        "Attack or reposition",
        enemyBranch(
          "Combat wheel positioning",
          ({ e, distance, spec }) =>
            e.timer > spec.decisionDelay &&
            e.timer < spec.decisionDelay + 0.3 &&
            chooseCombatAction(
              distance,
              spec.range,
              e.attackNumber,
              combatRoll(e.id, e.attackNumber),
            ) !== "attack",
          enemyTask("Hold a short tactical goal", (context) => {
            const { e, c, spec, distance } = context;
            const choice = chooseCombatAction(
              distance,
              spec.range,
              e.attackNumber,
              combatRoll(e.id, e.attackNumber),
            );
            if (choice === "retreat") {
              e.phase = "retreat";
              const length = Math.max(0.1, distance);
              moveEnemyTo(
                context,
                e.x + ((e.x - c.playerX) / length) * 2,
                e.z + ((e.z - c.playerZ) / length) * 2,
                spec.speed * 0.55,
              );
            } else {
              e.phase = kind === "sentinel" ? "guard" : "circle";
              const angle = Math.atan2(e.x - c.playerX, e.z - c.playerZ) + e.orbit * 0.35;
              moveEnemyTo(
                context,
                c.playerX + Math.sin(angle) * distance,
                c.playerZ + Math.cos(angle) * distance,
                spec.speed * 0.4,
              );
            }
          }),
        ),
        attackWhenReady(({ spec }) => (kind === "clinger" ? 2.9 : spec.range)),
        enemyBranch(
          "Step into sword range",
          ({ distance, spec }) => kind === "sentinel" && distance > spec.range,
          enemyTask("Advance with guard", (context) => {
            const { c, spec } = context;
            moveEnemyTo(context, c.playerX, c.playerZ, spec.speed * 1.25);
          }),
        ),
        enemyTask("Circle and maintain spacing", (context) => {
          const { e, c, spec } = context;
          const angle = Math.atan2(e.x - c.playerX, e.z - c.playerZ) + e.orbit * 0.35;
          const spacing = kind === "hound" ? 2.7 : 2.4;
          moveEnemyTo(
            context,
            c.playerX + Math.sin(angle) * spacing,
            c.playerZ + Math.cos(angle) * spacing,
            spec.speed * (kind === "hound" ? 0.38 : 0.4),
          );
        }),
      ),
    ),
  );
}

const enemyTactics: Record<EnemyKind, BehaviorNode<EnemyBehaviorContext>> = {
  sentinel: meleeTree("sentinel"),
  hound: meleeTree("hound"),
  acolyte: acolyteTree,
  kiln: meleeTree("kiln"),
  clinger: meleeTree("clinger"),
  widow: meleeTree("widow"),
  bearer: meleeTree("bearer"),
};

/** Shared priorities; attack phases stay committed until complete or interrupted by a hit. */
const parishEnemyTree = selector(
  "Enemy priorities",
  enemyBranch(
    "Death",
    ({ e }) => e.phase === "dead",
    enemyTask("Animate death", ({ e, dt }) => {
      e.deathTime += dt;
    }),
  ),
  enemyBranch(
    "Stagger",
    ({ e }) => e.phase === "stagger",
    enemyTask("Recover poise", ({ e, spec }) => {
      if (e.timer >= spec.stagger) {
        e.phase = "pursue";
        e.timer = 0.5;
      }
    }),
  ),
  enemyBranch(
    "Windup",
    ({ e }) => e.phase === "windup",
    enemyTask("Commit telegraphed attack", ({ e, c, dt }) => {
      // Stop tracking before impact: a committed, readable dodge window.
      if (e.timer < parishWindupDuration(e) * 0.65) face(e, c.playerX, c.playerZ, dt);
      if (e.timer >= parishWindupDuration(e)) {
        e.phase = "strike";
        e.timer = 0;
        const travel =
          e.kind === "hound"
            ? houndAttacks[e.houndAttack ?? "pounce"].travel
            : e.kind === "clinger"
              ? 3
              : e.kind === "kiln" && e.kilnAttack === "check"
                ? 0.45
                : 1.2;
        e.targetX = e.x + Math.sin(e.yaw) * travel;
        e.targetZ = e.z + Math.cos(e.yaw) * travel;
      }
    }),
  ),
  enemyBranch(
    "Strike",
    ({ e }) => e.phase === "strike",
    enemyTask("Resolve attack", ({ state, e, c, dt, progress, spec, distance, visible }) => {
      if (
        e.kind !== "acolyte" &&
        e.kind !== "widow" &&
        (e.kind === "hound" ||
          e.kind === "clinger" ||
          (e.kind === "kiln" && e.kilnAttack === "check") ||
          distance > 1.35)
      )
        move(e, e.targetX, e.targetZ, spec.strikeSpeed, dt, progress, state.enemies, state.world);
      const sweep = e.kind === "kiln" && e.kilnAttack === "sweep";
      const rake = e.kind === "hound" && e.houndAttack === "rake";
      const slam = e.kind === "kiln" && e.kilnAttack === "slam";
      const activeStart = sweep ? kilnSweepWindow.start : rake ? 0.075 : spec.contact;
      if (!e.hit && e.timer >= activeStart) {
        if (!sweep && !slam && !rake) e.hit = true;
        if (e.kind === "acolyte") {
          state.bolts.push({
            id: ++state.boltId,
            x: e.x,
            y: e.y + 1.4,
            z: e.z,
            vx: Math.sin(e.yaw) * 12,
            vz: Math.cos(e.yaw) * 12,
            life: 2.5,
          });
        } else {
          const originX = e.x + (slam ? Math.sin(e.yaw) * kilnSlamImpact.forward : 0);
          const originZ = e.z + (slam ? Math.cos(e.yaw) * kilnSlamImpact.forward : 0);
          const dx = c.playerX - originX,
            dz = c.playerZ - originZ,
            reach = Math.hypot(dx, dz);
          const frontal = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / Math.max(0.01, reach);
          const angle = Math.atan2(
            Math.sin(Math.atan2(dx, dz) - e.yaw),
            Math.cos(Math.atan2(dx, dz) - e.yaw),
          );
          const elapsed = e.timer - spec.contact;
          const radialContact =
            !slam ||
            (elapsed <= kilnSlamImpact.duration + dt &&
              reach <= kilnSlamRadius(elapsed) + 0.3 &&
              reach >= Math.max(0, kilnSlamRadius(elapsed - dt) - 0.3));
          const inShape = slam
            ? radialContact
            : sweep
              ? kilnSweepContains(angle, e.timer, dt)
              : rake
                ? houndRakeContains(angle, e.timer, dt)
                : e.kind === "widow" ||
                  frontal >
                    (e.kind === "kiln"
                      ? kilnAttacks[e.kilnAttack ?? "clamp"].frontal
                      : e.kind === "hound"
                        ? houndAttacks[e.houndAttack ?? "pounce"].frontal
                        : e.kind === "bearer"
                          ? 0.65
                          : 0.25);
          if (
            visible &&
            reach < (slam ? kilnSlamImpact.radius + 0.3 : spec.reach) &&
            inShape &&
            parishLineClear(e.x, e.z, originX, originZ, progress, e.y, state.world) &&
            parishLineClear(originX, originZ, c.playerX, c.playerZ, progress, e.y, state.world)
          ) {
            e.hit = true;
            const result = damagePlayer(
              c,
              spec.damage,
              originX,
              originZ,
              !slam && e.kind !== "widow" && e.kind !== "bearer",
              e.kind === "kiln" && e.kilnAttack === "check" ? 7 : 4,
            );
            if (result === "parried") {
              e.phase = "stagger";
              e.timer = 0;
              e.staggerLockout = spec.stagger + spec.staggerProtection;
              e.riposte = RIPOSTE_TIME;
              c.hitStop = 0.12;
              return;
            }
          }
        }
      }
      if (e.timer >= spec.strike) {
        if (
          (e.kind === "sentinel" ||
            e.kind === "widow" ||
            (e.kind === "hound" &&
              e.houndAttack === "snap" &&
              e.attackNumber % 3 !== 0 &&
              distance < 1.5) ||
            (e.kind === "kiln" &&
              (e.kilnAttack ?? "clamp") === "clamp" &&
              e.attackNumber % 3 === 1)) &&
          e.comboStep === 0 &&
          visible &&
          distance < spec.range + 1.2
        )
          beginAttack(e, true);
        else {
          e.phase = "recovery";
          e.timer = 0;
        }
      }
    }),
  ),
  enemyBranch(
    "Recovery",
    ({ e }) => e.phase === "recovery",
    enemyTask("Leave punishable opening", ({ e, spec }) => {
      if (e.timer >= spec.recovery) {
        e.phase = "pursue";
        e.timer = 0;
      }
    }),
  ),
  enemyBranch(
    "Visible target",
    ({ e, visible, distance }) =>
      visible && distance < (e.phase === "idle" ? (e.kind === "clinger" ? 5.5 : 11) : 16),
    action<EnemyBehaviorContext>("Face target", ({ e, c, dt }) => {
      face(e, c.playerX, c.playerZ, dt);
      return "success";
    }),
    action<EnemyBehaviorContext>("Choose archetype tactics", (context) =>
      enemyTactics[context.e.kind].tick(context),
    ),
  ),
  enemyBranch(
    "Remembered target",
    ({ e, c }) => e.phase !== "idle" && e.awareness > 0 && !c.bossActive,
    enemyTask("Search last seen position", (context) => {
      const { e, dt, spec } = context;
      e.phase = "search";
      face(e, e.lastSeenX, e.lastSeenZ, dt);
      moveEnemyTo(context, e.lastSeenX, e.lastSeenZ, spec.speed * 0.7);
    }),
  ),
  enemyTask("Return home", (context) => {
    const { e, dt, spec } = context;
    e.phase = "idle";
    e.timer = 0;
    face(e, e.homeX, e.homeZ, dt);
    moveEnemyTo(context, e.homeX, e.homeZ, spec.speed * 0.7);
  }),
);

export function stepParishEnemy(
  state: ParishEncounter,
  e: ParishEnemy,
  dt: number,
  progress: ParishProgress,
) {
  const c = state.combat;
  e.flash = Math.max(0, e.flash - dt * 4);
  e.guardFlash = Math.max(0, e.guardFlash - dt * 5);
  e.flinch = Math.max(0, e.flinch - dt);
  e.staggerLockout = Math.max(0, e.staggerLockout - dt);
  e.riposte = Math.max(0, e.riposte - dt);
  e.poiseDelay = Math.max(0, e.poiseDelay - dt);
  e.moveAmount *= Math.exp(-dt * 14);
  if (e.phase === "dead") {
    parishEnemyTree.tick({
      state,
      e,
      c,
      dt,
      progress,
      spec: enemyAttackSpec(e),
      distance: 0,
      visible: false,
    });
    return;
  }
  e.timer += dt;
  const spec = ["windup", "strike", "recovery"].includes(e.phase)
    ? enemyAttackSpec(e)
    : enemySpecs[e.kind];
  if (e.poiseDelay === 0) e.poise = Math.min(spec.poise, e.poise + dt * spec.poise);
  const distance = Math.hypot(c.playerX - e.x, c.playerZ - e.z);
  const leash = Math.hypot(c.playerX - e.homeX, c.playerZ - e.homeZ);
  const visible =
    !c.bossActive &&
    Math.abs(c.playerY - e.y) < 1.8 &&
    leash < 14 &&
    distance < 16 &&
    parishLineClear(e.x, e.z, c.playerX, c.playerZ, progress, e.y, state.world);
  if (e.kind === "clinger") {
    const target = e.phase !== "idle" || (visible && distance < 5.5) ? 0 : 1;
    e.folded += Math.max(-dt / 0.75, Math.min(dt / 0.75, target - e.folded));
  }
  if (visible && distance < 16) {
    e.awareness = 2;
    e.lastSeenX = c.playerX;
    e.lastSeenZ = c.playerZ;
  } else e.awareness = Math.max(0, e.awareness - dt);
  parishEnemyTree.tick({ state, e, c, dt, progress, spec, distance, visible });
}

export function stepParishEnemies(state: ParishEncounter, dt: number, progress: ParishProgress) {
  for (const enemy of state.enemies) stepParishEnemy(state, enemy, dt, progress);
}

export function stepEmberBolt(
  state: ParishEncounter,
  bolt: EmberBolt,
  dt: number,
  progress: ParishProgress,
): boolean {
  const c = state.combat;
  const oldX = bolt.x,
    oldZ = bolt.z;
  bolt.x += bolt.vx * dt;
  bolt.z += bolt.vz * dt;
  bolt.life -= dt;
  if (
    c.bossActive ||
    !parishLineClear(oldX, oldZ, bolt.x, bolt.z, progress, bolt.y - 1.1, state.world) ||
    bolt.life <= 0
  )
    return false;
  const dx = bolt.x - oldX,
    dz = bolt.z - oldZ;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((c.playerX - oldX) * dx + (c.playerZ - oldZ) * dz) / Math.max(0.0001, dx * dx + dz * dz),
    ),
  );
  if (
    Math.abs(c.playerY + 1 - bolt.y) < 1.1 &&
    Math.hypot(oldX + t * dx - c.playerX, oldZ + t * dz - c.playerZ) < 0.7
  ) {
    damagePlayer(c, enemySpecs.acolyte.damage, bolt.x - bolt.vx, bolt.z - bolt.vz);
    return false;
  }
  return true;
}

export function stepParishProjectiles(
  state: ParishEncounter,
  dt: number,
  progress: ParishProgress,
) {
  state.bolts = state.bolts.filter((bolt) => stepEmberBolt(state, bolt, dt, progress));
}
