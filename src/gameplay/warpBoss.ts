// Tiny Tusk, the Warp Room boss. A Crash 2 style fight: he leaps at you with a
// telegraphed shadow, the landing sends out a shockwave ring you hop over, and
// after a run of slams he is dazed long enough to jump on his head. Three
// stomps win. Pure rules; the arena component renders and feeds the player in.

import type { PlayerSample } from "./warpRun.ts";

export interface BossPhase {
  slams: number;
  /** Shadow warning before he lands (s). */
  telegraph: number;
  ringSpeed: number;
  daze: number;
}

export const BOSS = {
  arenaRadius: 13,
  maxHealth: 3,
  intro: 2.4,
  /** Standing head height; stomps need your feet above head - stompSlack. */
  headHeight: 2.1,
  /** Dazed he slumps down, which is what makes his head reachable. */
  dazedHeadHeight: 1.3,
  stompSlack: 0.5,
  bodyRadius: 1.1,
  /** Landing this close to you crushes you. */
  crushRadius: 2.0,
  landRest: 1.0,
  /** Beat between touching down and the pound that starts the shockwave. */
  poundDelay: 0.4,
  ringHeight: 0.45,
  ringWidth: 0.5,
  recover: 1.8,
  stompBounce: 12,
  hurtInvulnerable: 1.5,
  playerRadius: 0.42,
  startMasks: 1,
  phases: [
    { slams: 3, telegraph: 1.3, ringSpeed: 5, daze: 3.6 },
    { slams: 3, telegraph: 1.15, ringSpeed: 5.8, daze: 3.2 },
    { slams: 4, telegraph: 1.0, ringSpeed: 6.6, daze: 2.8 },
  ] as BossPhase[],
};

export type BossMode = "intro" | "leap" | "land" | "dazed" | "hurt" | "defeated";

export interface Ring {
  x: number;
  z: number;
  radius: number;
  speed: number;
}

export interface BossFight {
  mode: BossMode;
  /** Seconds left in the current mode. */
  timer: number;
  /** Length of the current mode, for animation progress. */
  duration: number;
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  slams: number;
  health: number;
  rings: Ring[];
  masks: number;
  invulnerable: number;
  /** Player is out of the fight. */
  lost: boolean;
  time: number;
}

export type BossEvent =
  | { type: "leap"; x: number; z: number }
  | { type: "slam"; x: number; z: number }
  | { type: "pound"; x: number; z: number }
  | { type: "dazed" }
  | { type: "hit"; health: number }
  | { type: "bounce"; speed: number }
  | { type: "recovered" }
  | { type: "defeated" }
  | { type: "maskLost"; masks: number }
  | { type: "dead"; cause: "crush" | "ring" | "body" };

export function createBoss(): BossFight {
  return {
    mode: "intro",
    timer: BOSS.intro,
    duration: BOSS.intro,
    x: 0,
    z: -6,
    fromX: 0,
    fromZ: -6,
    toX: 0,
    toZ: -6,
    slams: 0,
    health: BOSS.maxHealth,
    rings: [],
    masks: BOSS.startMasks,
    invulnerable: 0,
    lost: false,
    time: 0,
  };
}

export const bossPhase = (fight: BossFight) =>
  BOSS.phases[Math.min(BOSS.phases.length - 1, BOSS.maxHealth - fight.health)];

/** Height of the boss's feet above the floor (leap arc). */
export function bossLift(fight: BossFight) {
  if (fight.mode !== "leap") return 0;
  const t = 1 - fight.timer / fight.duration;
  return Math.sin(t * Math.PI) * 7;
}

export const headHeight = (fight: BossFight) =>
  fight.mode === "dazed" ? BOSS.dazedHeadHeight : BOSS.headHeight;

function setMode(fight: BossFight, mode: BossMode, duration: number) {
  fight.mode = mode;
  fight.timer = duration;
  fight.duration = duration;
}

function leap(fight: BossFight, player: PlayerSample, events: BossEvent[]) {
  // Aim where you stand now; the shadow then stays put so you can read it.
  const limit = BOSS.arenaRadius - 2;
  const distance = Math.hypot(player.x, player.z);
  const scale = distance > limit ? limit / distance : 1;
  fight.fromX = fight.x;
  fight.fromZ = fight.z;
  fight.toX = player.x * scale;
  fight.toZ = player.z * scale;
  setMode(fight, "leap", bossPhase(fight).telegraph);
  events.push({ type: "leap", x: fight.toX, z: fight.toZ });
}

function hurtPlayer(fight: BossFight, cause: "crush" | "ring" | "body", events: BossEvent[]) {
  if (fight.invulnerable > 0 || fight.lost) return;
  if (fight.masks > 0) {
    fight.masks--;
    fight.invulnerable = BOSS.hurtInvulnerable;
    events.push({ type: "maskLost", masks: fight.masks });
    return;
  }
  fight.lost = true;
  events.push({ type: "dead", cause });
}

export function stepBoss(fight: BossFight, player: PlayerSample, dt: number): BossEvent[] {
  const events: BossEvent[] = [];
  fight.time += dt;
  fight.invulnerable = Math.max(0, fight.invulnerable - dt);
  if (fight.lost || fight.mode === "defeated") {
    fight.rings = [];
    return events;
  }

  // Shockwaves roll out across the floor; a hop clears them.
  for (const ring of fight.rings) {
    ring.radius += ring.speed * dt;
    const distance = Math.hypot(player.x - ring.x, player.z - ring.z);
    if (
      Math.abs(distance - ring.radius) < BOSS.ringWidth / 2 + BOSS.playerRadius &&
      player.y < BOSS.ringHeight
    ) {
      hurtPlayer(fight, "ring", events);
    }
  }
  fight.rings = fight.rings.filter((ring) => ring.radius < BOSS.arenaRadius + 2);

  fight.timer -= dt;
  const toPlayer = Math.hypot(player.x - fight.x, player.z - fight.z);

  switch (fight.mode) {
    case "intro":
      if (fight.timer <= 0) leap(fight, player, events);
      break;
    case "leap": {
      const t = Math.min(1, 1 - fight.timer / fight.duration);
      fight.x = fight.fromX + (fight.toX - fight.fromX) * t;
      fight.z = fight.fromZ + (fight.toZ - fight.fromZ) * t;
      if (fight.timer <= 0) {
        fight.x = fight.toX;
        fight.z = fight.toZ;
        fight.slams++;
        events.push({ type: "slam", x: fight.x, z: fight.z });
        if (Math.hypot(player.x - fight.x, player.z - fight.z) < BOSS.crushRadius && player.y < 1.2)
          hurtPlayer(fight, "crush", events);
        setMode(fight, "land", BOSS.landRest);
      }
      break;
    }
    case "land": {
      // He lands, rears up, then pounds the floor: the pound sends the wave.
      const pound = BOSS.landRest - BOSS.poundDelay;
      if (fight.timer <= pound && fight.timer + dt > pound) {
        fight.rings.push({
          x: fight.x,
          z: fight.z,
          radius: 0.5,
          speed: bossPhase(fight).ringSpeed,
        });
        events.push({ type: "pound", x: fight.x, z: fight.z });
      }
      if (toPlayer < BOSS.bodyRadius + BOSS.playerRadius && player.y < BOSS.headHeight - 0.3)
        hurtPlayer(fight, "body", events);
      if (fight.timer <= 0) {
        if (fight.slams >= bossPhase(fight).slams) {
          setMode(fight, "dazed", bossPhase(fight).daze);
          events.push({ type: "dazed" });
        } else leap(fight, player, events);
      }
      break;
    }
    case "dazed": {
      const stomp =
        !player.grounded &&
        player.vy < 0 &&
        player.y >= BOSS.dazedHeadHeight - BOSS.stompSlack &&
        toPlayer < BOSS.bodyRadius + BOSS.playerRadius;
      if (stomp) {
        fight.health--;
        fight.slams = 0;
        fight.rings = [];
        events.push({ type: "hit", health: fight.health });
        events.push({ type: "bounce", speed: BOSS.stompBounce });
        if (fight.health <= 0) {
          setMode(fight, "defeated", 0);
          events.push({ type: "defeated" });
        } else setMode(fight, "hurt", BOSS.recover);
      } else if (fight.timer <= 0) {
        fight.slams = 0;
        events.push({ type: "recovered" });
        leap(fight, player, events);
      }
      break;
    }
    case "hurt":
      if (fight.timer <= 0) {
        events.push({ type: "recovered" });
        leap(fight, player, events);
      }
      break;
  }
  return events;
}
