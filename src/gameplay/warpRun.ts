// Pure per-frame rules for a Warp Room level: crates, fruit, enemies, the
// crystal, checkpoints, deaths and the boulder chase. No Three or Rapier: the
// level component feeds in a player sample each frame and applies the
// requests (bounce, respawn) this returns. Tests drive it with bots.

import {
  countsForGem,
  CRATE_SIZE,
  enemyPosition,
  type Vec3,
  type WarpLevel,
} from "./warpLevels.ts";

export interface PlayerSample {
  /** Feet position. */
  x: number;
  y: number;
  z: number;
  /** Vertical speed (m/s); about -1 while standing. */
  vy: number;
  grounded: boolean;
  /** Spin attack active this frame. */
  spinning: boolean;
}

export const RUN = {
  /** Launch speed off a crate you land on. */
  crateBounce: 8.5,
  /** Arrow crates throw you higher. */
  springBounce: 15,
  enemyBounce: 9,
  /** Horizontal reach of the spin attack. */
  spinReach: 1.35,
  /** Wooden arrow crates give out after this many hops. */
  bounceCrateHops: 4,
  tntFuse: 3,
  tntRadius: 2.5,
  nitroRadius: 2.1,
  /** Mask stack cap; three would be invincibility, which we skip. */
  maxMasks: 2,
  hurtInvulnerable: 1.5,
  respawnInvulnerable: 1,
  /** Death animation before the respawn teleport. */
  deathTime: 1.1,
  bonusFruit: 5,
  enemyHeight: 0.85,
  enemyRadius: 0.55,
  playerRadius: 0.42,
} as const;

export type DeathCause = "fall" | "enemy" | "explosion" | "boulder";

export type RunEvent =
  | { type: "crate"; index: number; kind: string }
  | { type: "bounce"; speed: number; index: number }
  | { type: "fuse"; index: number }
  | { type: "explode"; index: number; x: number; y: number; z: number }
  | { type: "fruit"; index: number; total: number }
  | { type: "mask"; masks: number }
  | { type: "maskLost"; masks: number }
  | { type: "checkpoint"; index: number }
  | { type: "enemy"; index: number; stomped: boolean }
  | { type: "crystal" }
  | { type: "gem" }
  | { type: "death"; cause: DeathCause }
  | { type: "respawn"; position: Vec3 }
  | { type: "boulder"; state: "rolling" | "stopped" };

export interface CrateState {
  broken: boolean;
  /** Seconds left on a lit TNT fuse, or -1. */
  fuse: number;
  hops: number;
  /** Visual squash after a hop, decays to 0. */
  squash: number;
}

export interface RunState {
  level: WarpLevel;
  time: number;
  crates: CrateState[];
  fruitTaken: boolean[];
  fruit: number;
  enemyDead: boolean[];
  masks: number;
  invulnerable: number;
  checkpoint: Vec3;
  crystal: boolean;
  gem: boolean;
  deaths: number;
  /** Seconds left in the death animation, or 0 while alive. */
  dying: number;
  boulder: { active: boolean; z: number; stopped: boolean };
  /** Crates that count toward the gem, and how many are broken. */
  crateTotal: number;
  cratesBroken: number;
}

export function createRun(level: WarpLevel): RunState {
  return {
    level,
    time: 0,
    crates: level.crates.map(() => ({ broken: false, fuse: -1, hops: 0, squash: 0 })),
    fruitTaken: level.fruit.map(() => false),
    fruit: 0,
    enemyDead: level.enemies.map(() => false),
    masks: 0,
    invulnerable: 0,
    checkpoint: [...level.spawn],
    crystal: false,
    gem: false,
    deaths: 0,
    dying: 0,
    boulder: { active: false, z: level.boulder?.startZ ?? 0, stopped: false },
    crateTotal: level.crates.filter((crate) => countsForGem(crate.kind)).length,
    cratesBroken: 0,
  };
}

function breakCrate(run: RunState, index: number, events: RunEvent[]) {
  const state = run.crates[index];
  if (state.broken) return;
  const crate = run.level.crates[index];
  state.broken = true;
  state.fuse = -1;
  if (countsForGem(crate.kind)) run.cratesBroken++;
  events.push({ type: "crate", index, kind: crate.kind });
  switch (crate.kind) {
    case "basic":
    case "bounce":
      run.fruit++;
      events.push({ type: "fruit", index: -1, total: run.fruit });
      break;
    case "bonus":
      run.fruit += RUN.bonusFruit;
      events.push({ type: "fruit", index: -1, total: run.fruit });
      break;
    case "aku":
      run.masks = Math.min(RUN.maxMasks, run.masks + 1);
      events.push({ type: "mask", masks: run.masks });
      break;
    case "check":
      run.checkpoint = [crate.x, crate.y, crate.z];
      events.push({ type: "checkpoint", index });
      break;
  }
  if (!run.gem && run.cratesBroken === run.crateTotal) {
    run.gem = true;
    events.push({ type: "gem" });
  }
}

function explode(run: RunState, index: number, player: PlayerSample, events: RunEvent[]) {
  const crate = run.level.crates[index];
  const radius = crate.kind === "nitro" ? RUN.nitroRadius : RUN.tntRadius;
  const cx = crate.x;
  const cy = crate.y + CRATE_SIZE / 2;
  const cz = crate.z;
  breakCrate(run, index, events);
  events.push({ type: "explode", index, x: cx, y: cy, z: cz });
  // Blast clears neighbors; other explosives chain instantly.
  run.level.crates.forEach((other, i) => {
    if (run.crates[i].broken || other.kind === "spring") return;
    const d = Math.hypot(other.x - cx, other.y + CRATE_SIZE / 2 - cy, other.z - cz);
    if (d > radius) return;
    if (other.kind === "tnt" || other.kind === "nitro") explode(run, i, player, events);
    else breakCrate(run, i, events);
  });
  const playerDistance = Math.hypot(player.x - cx, player.y + 0.8 - cy, player.z - cz);
  if (playerDistance < radius) hurt(run, "explosion", events);
}

function hurt(run: RunState, cause: DeathCause, events: RunEvent[]) {
  if (run.dying > 0 || run.invulnerable > 0) return;
  if (run.masks > 0 && cause !== "fall" && cause !== "boulder") {
    run.masks--;
    run.invulnerable = RUN.hurtInvulnerable;
    events.push({ type: "maskLost", masks: run.masks });
    return;
  }
  run.dying = RUN.deathTime;
  run.masks = 0;
  run.deaths++;
  events.push({ type: "death", cause });
}

/** Crate's horizontal overlap with the player's capsule. */
function overlapsCrate(crateX: number, crateZ: number, x: number, z: number, pad: number) {
  const half = CRATE_SIZE / 2 + pad;
  return Math.abs(x - crateX) < half && Math.abs(z - crateZ) < half;
}

export function stepRun(run: RunState, player: PlayerSample, dt: number): RunEvent[] {
  const events: RunEvent[] = [];
  const level = run.level;
  run.time += dt;
  run.invulnerable = Math.max(0, run.invulnerable - dt);
  for (const crate of run.crates) crate.squash = Math.max(0, crate.squash - dt * 5);

  // Lit fuses keep burning through deaths, like the real thing.
  run.crates.forEach((state, index) => {
    if (state.broken || state.fuse < 0) return;
    state.fuse -= dt;
    if (state.fuse <= 0) explode(run, index, player, events);
  });

  if (run.dying > 0) {
    run.dying = Math.max(0, run.dying - dt);
    if (run.dying === 0) {
      run.invulnerable = RUN.respawnInvulnerable;
      if (level.boulder) run.boulder = { active: false, z: level.boulder.startZ, stopped: false };
      events.push({ type: "respawn", position: [...run.checkpoint] });
    }
    return events;
  }

  if (player.y < level.killY) {
    hurt(run, "fall", events);
    return events;
  }

  let bounced = false;
  const bounce = (speed: number, index: number) => {
    if (bounced) return;
    bounced = true;
    events.push({ type: "bounce", speed, index });
  };

  // --- Crates.
  level.crates.forEach((crate, index) => {
    const state = run.crates[index];
    if (state.broken) return;
    const top = crate.y + CRATE_SIZE;
    const onTop =
      overlapsCrate(crate.x, crate.z, player.x, player.z, RUN.playerRadius * 0.6) &&
      player.y >= top - 0.2 &&
      player.y <= top + 0.45 &&
      player.vy < -0.3;
    const beside =
      overlapsCrate(crate.x, crate.z, player.x, player.z, RUN.playerRadius + 0.2) &&
      player.y < top + 0.1 &&
      player.y > crate.y - 1.7;
    const spun =
      player.spinning &&
      Math.hypot(player.x - crate.x, player.z - crate.z) < RUN.spinReach + CRATE_SIZE / 2 &&
      player.y < top + 0.5 &&
      player.y > crate.y - 1.6;

    if (crate.kind === "nitro") {
      if (onTop || beside || spun) explode(run, index, player, events);
      return;
    }
    if (crate.kind === "tnt") {
      if (spun) explode(run, index, player, events);
      else if (onTop && state.fuse < 0) {
        state.fuse = RUN.tntFuse;
        state.squash = 1;
        events.push({ type: "fuse", index });
        bounce(RUN.crateBounce, index);
      }
      return;
    }
    if (crate.kind === "spring") {
      if (onTop) {
        state.squash = 1;
        bounce(RUN.springBounce, index);
      }
      return;
    }
    if (crate.kind === "bounce") {
      if (spun) breakCrate(run, index, events);
      else if (onTop) {
        state.hops++;
        state.squash = 1;
        run.fruit++;
        events.push({ type: "fruit", index: -1, total: run.fruit });
        bounce(RUN.springBounce, index);
        if (state.hops >= RUN.bounceCrateHops) breakCrate(run, index, events);
      }
      return;
    }
    if (onTop) {
      breakCrate(run, index, events);
      bounce(RUN.crateBounce, index);
    } else if (spun) breakCrate(run, index, events);
  });

  // --- Enemies.
  level.enemies.forEach((enemy, index) => {
    if (run.enemyDead[index] || run.dying > 0) return;
    const at = enemyPosition(enemy, run.time);
    const distance = Math.hypot(player.x - at.x, player.z - at.z);
    const top = enemy.y + RUN.enemyHeight;
    if (player.spinning && distance < RUN.spinReach + RUN.enemyRadius) {
      run.enemyDead[index] = true;
      events.push({ type: "enemy", index, stomped: false });
      return;
    }
    const reach = RUN.enemyRadius + RUN.playerRadius;
    if (distance > reach + 0.15) return;
    const stomping = !player.grounded && player.vy < 0 && player.y >= top - 0.5;
    if (stomping && !enemy.spiky) {
      run.enemyDead[index] = true;
      events.push({ type: "enemy", index, stomped: true });
      bounce(RUN.enemyBounce, -1);
      return;
    }
    if (distance < reach && player.y < top + 0.1 && player.y > enemy.y - 1.6) {
      hurt(run, "enemy", events);
      if (stomping) bounce(RUN.enemyBounce, -1);
    }
  });

  // --- Fruit and the crystal.
  level.fruit.forEach(([fx, fy, fz], index) => {
    if (run.fruitTaken[index]) return;
    if (
      Math.hypot(player.x - fx, player.z - fz) < 0.8 &&
      player.y > fy - 1.7 &&
      player.y < fy + 0.5
    ) {
      run.fruitTaken[index] = true;
      run.fruit++;
      events.push({ type: "fruit", index, total: run.fruit });
    }
  });
  const [cx, cy, cz] = level.crystal;
  if (
    !run.crystal &&
    Math.hypot(player.x - cx, player.z - cz) < 1.1 &&
    player.y > cy - 2 &&
    player.y < cy + 0.8
  ) {
    run.crystal = true;
    events.push({ type: "crystal" });
  }

  // --- Boulder chase.
  const boulder = level.boulder;
  if (boulder && !run.boulder.stopped) {
    if (!run.boulder.active && player.z < boulder.triggerZ) {
      run.boulder.active = true;
      events.push({ type: "boulder", state: "rolling" });
    }
    if (run.boulder.active) {
      run.boulder.z -= boulder.speed * dt;
      if (run.boulder.z <= boulder.endZ) {
        run.boulder.z = boulder.endZ;
        run.boulder.stopped = true;
        events.push({ type: "boulder", state: "stopped" });
      }
      if (player.z > run.boulder.z - boulder.radius - 0.3 && player.y < boulder.radius * 2) {
        hurt(run, "boulder", events);
      }
    }
  }

  return events;
}
