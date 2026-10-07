import {
  createEncounter,
  PLAYER_HURT_TIME,
  stepEncounter,
  type Encounter,
} from "./bossEncounter.ts";
import { swordHitActive } from "./characterAnimations.ts";
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
  flinch: number;
  guardFlash: number;
  moveAmount: number;
  orbit: number;
  attackNumber: number;
  comboStep: number;
  awareness: number;
  lastSeenX: number;
  lastSeenZ: number;
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
export function createParishEncounter(progress: ParishProgress) {
  const combat = createEncounter(PARISH_ARENA_Y);
  combat.bossActive = false;
  combat.freezeOnVictory = false;
  combat.fatalFalls = true;
  const spawn = parishShrines.find((s) => s.id === progress.checkpoint)!.spawn;
  [combat.playerX, combat.playerY, combat.playerZ] = spawn;
  return {
    combat,
    enemies: createEnemies(),
    bolts: [] as EmberBolt[],
    boltId: 0,
    enemyHitId: 0,
    resolvedAttack: 0,
    embers: 0,
    flasks: 3,
    healTime: 0,
    bossFelled: false,
  };
}
export type ParishEncounter = ReturnType<typeof createParishEncounter>;
export function resetParishEncounter(state: ParishEncounter, progress: ParishProgress) {
  const fresh = createParishEncounter(progress);
  const combat = state.combat;
  Object.assign(combat, fresh.combat);
  return Object.assign(state, fresh, { combat });
}
function createEnemies(): ParishEnemy[] {
  return parishEnemySpawns.map(({ id, kind, position: [x, y, z] }, index) => ({
    id,
    kind,
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
    flinch: 0,
    guardFlash: 0,
    moveAmount: 0,
    orbit: index % 2 ? 1 : -1,
    attackNumber: 0,
    comboStep: 0,
    awareness: 0,
    lastSeenX: x,
    lastSeenZ: z,
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
) {
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
    const height = parishFloorHeight(nx, nz, enemy.y);
    if (
      height === null ||
      parishBlocked(nx, height, nz, 0.4) ||
      Math.abs(height - enemy.y) > 0.6 ||
      !parishLineClear(enemy.x, enemy.z, nx, nz, progress, enemy.y) ||
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
  enemy.stride += step * 4.8 * (forward < 0 ? -1 : 1);
  enemy.moveAmount = Math.min(1, step / Math.max(0.001, dt * enemySpecs[enemy.kind].speed));
}
function damagePlayer(combat: Encounter, damage: number, x: number, z: number) {
  if (combat.invulnerable || combat.hurtTime > 0 || combat.health <= 0) return;
  const dx = combat.playerX - x,
    dz = combat.playerZ - z;
  const length = Math.max(0.01, Math.hypot(dx, dz));
  combat.health = Math.max(0, combat.health - damage);
  combat.playerHitId++;
  combat.hurtTime = PLAYER_HURT_TIME;
  combat.knockX = (dx / length) * 4;
  combat.knockZ = (dz / length) * 4;
  combat.shake = Math.max(combat.shake, 0.3);
}
/** Health damage and poise are independent: a flinch must not cancel every action. */
export function hitParishEnemy(state: ParishEncounter, enemy: ParishEnemy, heavy = false) {
  if (enemy.health <= 0) return;
  const spec = enemySpecs[enemy.kind];
  const dx = state.combat.playerX - enemy.x,
    dz = state.combat.playerZ - enemy.z;
  const front =
    (dx * Math.sin(enemy.yaw) + dz * Math.cos(enemy.yaw)) / Math.max(0.01, Math.hypot(dx, dz));
  const blocked =
    enemy.kind === "sentinel" && ["guard", "pursue"].includes(enemy.phase) && front > 0.55;
  const damage = combatTuning.baseDamage + (enemy.phase === "recovery" ? 10 : 0);
  enemy.health = Math.max(
    0,
    enemy.health - (blocked ? Math.max(1, Math.round(damage * 0.2)) : damage),
  );
  enemy.flash = blocked ? 0 : 1;
  enemy.guardFlash = blocked ? 1 : 0;
  enemy.flinch = blocked ? 0 : 0.18;
  enemy.poiseDelay = 2.5;
  state.enemyHitId++;
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
  enemy.poise -= blocked ? (heavy ? 18 : 8) : heavy ? 40 : 25;
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
export function parishWindupDuration(enemy: Pick<ParishEnemy, "kind" | "comboStep">) {
  const spec = enemySpecs[enemy.kind];
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
  if (!state.bossFelled) state.enemies = createEnemies();
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
export function drinkEmber(state: ParishEncounter) {
  const c = state.combat;
  if (
    state.flasks <= 0 ||
    c.health <= 0 ||
    c.health >= combatTuning.playerMaxHealth ||
    c.hurtTime > 0 ||
    c.attackTime > 0 ||
    c.invulnerable ||
    state.healTime > 0
  )
    return false;
  state.flasks--;
  c.health = Math.min(combatTuning.playerMaxHealth, c.health + 45);
  state.healTime = 1;
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
  const dt = Math.min(delta, 0.05),
    c = state.combat;
  stepCombat(c, dt);
  state.healTime = Math.max(0, state.healTime - dt);
  if (c.health <= 0) return;
  if (c.bossHealth <= 0) {
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
    swordHitActive(c.attackId, c.attackTime) &&
    state.resolvedAttack !== c.attackId
  ) {
    state.resolvedAttack = c.attackId;
    // One enemy per swing. Sort a filtered copy, never reorder the live rig array.
    const target = state.enemies
      .filter((e) => {
        const dx = e.x - c.playerX,
          dz = e.z - c.playerZ,
          distance = Math.hypot(dx, dz);
        const facing =
          (dx * Math.sin(c.playerYaw) + dz * Math.cos(c.playerYaw)) / Math.max(0.01, distance);
        return (
          e.health > 0 &&
          Math.abs(e.y - c.playerY) < 1.8 &&
          distance < combatTuning.hitDistance &&
          facing > combatTuning.hitFacingThreshold &&
          parishLineClear(c.playerX, c.playerZ, e.x, e.z, progress, c.playerY)
        );
      })
      .sort(
        (a, b) =>
          Math.hypot(a.x - c.playerX, a.z - c.playerZ) -
          Math.hypot(b.x - c.playerX, b.z - c.playerZ),
      )[0];
    if (target) hitParishEnemy(state, target, c.attackId % 2 === 0);
  }

  stepEnemies(state, dt, progress);
  stepProjectiles(state, dt, progress);
}

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
  e.poiseDelay = Math.max(0, e.poiseDelay - dt);
  e.moveAmount *= Math.exp(-dt * 14);
  if (e.phase === "dead") {
    e.deathTime += dt;
    return;
  }
  e.timer += dt;
  const spec = enemySpecs[e.kind];
  if (e.poiseDelay === 0) e.poise = Math.min(spec.poise, e.poise + dt * spec.poise);
  const distance = Math.hypot(c.playerX - e.x, c.playerZ - e.z);
  const leash = Math.hypot(c.playerX - e.homeX, c.playerZ - e.homeZ);
  const visible =
    !c.bossActive &&
    Math.abs(c.playerY - e.y) < 1.8 &&
    leash < 14 &&
    distance < 16 &&
    parishLineClear(e.x, e.z, c.playerX, c.playerZ, progress, e.y);
  if (visible && distance < 16) {
    e.awareness = 2;
    e.lastSeenX = c.playerX;
    e.lastSeenZ = c.playerZ;
  } else e.awareness = Math.max(0, e.awareness - dt);
  if (e.phase === "stagger") {
    if (e.timer >= spec.stagger) {
      e.phase = "pursue";
      e.timer = 0.5;
    }
    return;
  }
  if (["idle", "pursue", "guard", "circle", "retreat", "search"].includes(e.phase)) {
    const engaged = e.phase !== "idle";
    if (visible && distance < (engaged ? 16 : 11)) {
      face(e, c.playerX, c.playerZ, dt);
      if (e.kind === "acolyte") {
        // A finite retreat creates space without running away forever.
        if (distance < 4.5 && e.timer < spec.decisionDelay) {
          e.phase = "retreat";
          const length = Math.max(0.1, distance);
          move(
            e,
            e.x + ((e.x - c.playerX) / length) * 2,
            e.z + ((e.z - c.playerZ) / length) * 2,
            spec.speed * 1.6,
            dt,
            progress,
            state.enemies,
          );
        } else if (
          distance <= spec.range &&
          e.timer > spec.decisionDelay &&
          frontalToPlayer(e, c) > 0.65
        ) {
          beginAttack(e);
        } else {
          e.phase = "pursue";
          if (distance > spec.range * 0.85)
            move(e, c.playerX, c.playerZ, spec.speed, dt, progress, state.enemies);
        }
      } else if (distance > spec.range + 0.4) {
        e.phase = "pursue";
        move(e, c.playerX, c.playerZ, spec.speed, dt, progress, state.enemies);
      } else {
        e.phase = e.kind === "hound" ? "circle" : "guard";
        if (
          distance <= (e.kind === "hound" ? 2.9 : spec.range) &&
          e.timer > spec.decisionDelay &&
          frontalToPlayer(e, c) > 0.65 &&
          canCommit(state, e)
        ) {
          beginAttack(e);
        } else if (e.kind === "sentinel" && distance > spec.range) {
          move(e, c.playerX, c.playerZ, spec.speed * 1.25, dt, progress, state.enemies);
        } else {
          const angle = Math.atan2(e.x - c.playerX, e.z - c.playerZ) + e.orbit * 0.35;
          const spacing = e.kind === "hound" ? 2.7 : 2.4;
          move(
            e,
            c.playerX + Math.sin(angle) * spacing,
            c.playerZ + Math.cos(angle) * spacing,
            spec.speed * (e.kind === "hound" ? 0.7 : 0.4),
            dt,
            progress,
            state.enemies,
          );
        }
      }
    } else if (engaged && e.awareness > 0 && !c.bossActive) {
      e.phase = "search";
      face(e, e.lastSeenX, e.lastSeenZ, dt);
      move(e, e.lastSeenX, e.lastSeenZ, spec.speed * 0.7, dt, progress, state.enemies);
    } else {
      e.phase = "idle";
      e.timer = 0;
      face(e, e.homeX, e.homeZ, dt);
      move(e, e.homeX, e.homeZ, spec.speed * 0.7, dt, progress, state.enemies);
    }
  } else if (e.phase === "windup") {
    // Stop tracking before impact: a committed, readable dodge window.
    if (e.timer < parishWindupDuration(e) * 0.65) face(e, c.playerX, c.playerZ, dt);
    if (e.timer >= parishWindupDuration(e)) {
      e.phase = "strike";
      e.timer = 0;
      e.targetX = e.x + Math.sin(e.yaw) * (e.kind === "hound" ? 3 : 1.2);
      e.targetZ = e.z + Math.cos(e.yaw) * (e.kind === "hound" ? 3 : 1.2);
    }
  } else if (e.phase === "strike") {
    if (e.kind !== "acolyte" && (e.kind === "hound" || distance > 1.35))
      move(e, e.targetX, e.targetZ, spec.strikeSpeed, dt, progress, state.enemies);
    if (!e.hit && e.timer >= spec.contact) {
      e.hit = true;
      if (e.kind === "acolyte") {
        state.bolts.push({
          id: ++state.boltId,
          x: e.x,
          y: e.y + 1.1,
          z: e.z,
          vx: Math.sin(e.yaw) * 12,
          vz: Math.cos(e.yaw) * 12,
          life: 2.5,
        });
      } else {
        const dx = c.playerX - e.x,
          dz = c.playerZ - e.z,
          reach = Math.hypot(dx, dz);
        const frontal = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / Math.max(0.01, reach);
        if (
          visible &&
          reach < spec.reach &&
          frontal > 0.25 &&
          parishLineClear(e.x, e.z, c.playerX, c.playerZ, progress, e.y)
        )
          damagePlayer(c, spec.damage, e.x, e.z);
      }
    }
    if (e.timer >= spec.strike) {
      if (e.kind === "sentinel" && e.comboStep === 0 && visible && distance < spec.range + 1.2)
        beginAttack(e, true);
      else {
        e.phase = "recovery";
        e.timer = 0;
      }
    }
  } else if (e.phase === "recovery" && e.timer >= spec.recovery) {
    e.phase = "pursue";
    e.timer = 0;
  }
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
    !parishLineClear(oldX, oldZ, bolt.x, bolt.z, progress, bolt.y - 1.1) ||
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
