import test from "node:test";
import assert from "node:assert/strict";
import { getGravityScale, JUMP_DEFAULTS } from "../src/gameplay/playerRules.ts";
import { MOVEMENT_DEFAULTS } from "../src/gameplay/movement.ts";
import {
  BOSS,
  createBoss,
  stepBoss,
  type BossFight,
  type BossEvent,
} from "../src/gameplay/warpBoss.ts";

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => (value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const DT = 1 / 60;

interface Human {
  name: string;
  /** Seconds between something happening on screen and the bot acting on it. */
  reaction: number;
  /** Random error on jump timing (s, uniform ±). */
  timing: number;
  /** Chance per ring to not react at all (distracted, camera turned). */
  miss: number;
}

/** What a player can read off the screen: no timers, no internal state. */
interface Seen {
  mode: BossFight["mode"];
  x: number;
  z: number;
  shadowX: number;
  shadowZ: number;
  rings: { x: number; z: number; radius: number; speed: number }[];
}

function see(fight: BossFight): Seen {
  return {
    mode: fight.mode,
    x: fight.x,
    z: fight.z,
    shadowX: fight.toX,
    shadowZ: fight.toZ,
    rings: fight.rings.map((ring) => ({ ...ring })),
  };
}

function fightBoss(human: Human, seed: number) {
  const random = seeded(seed);
  const fight = createBoss();
  const player = { x: 0, y: 0, z: 7, vx: 0, vz: 0, vy: 0, grounded: true, held: 0 };
  const history: Seen[] = [];
  const handledRings = new WeakSet<object>();
  const ringPlans = new Map<object, number>();
  const events: BossEvent[] = [];
  for (let t = 0; t < 240; t += DT) {
    history.push(see(fight));
    const delay = Math.round(human.reaction / DT);
    const seen = history[Math.max(0, history.length - 1 - delay)];
    // --- Decide where to go.
    let wishX = 0;
    let wishZ = 0;
    const toBossX = seen.x - player.x;
    const toBossZ = seen.z - player.z;
    const bossDistance = Math.hypot(toBossX, toBossZ);
    let jump = false;
    if (seen.mode === "leap") {
      let awayX = player.x - seen.shadowX;
      let awayZ = player.z - seen.shadowZ;
      let away = Math.hypot(awayX, awayZ);
      if (away < 0.3) {
        // Standing on the shadow: run sideways across his flight line.
        const flightX = seen.shadowX - seen.x;
        const flightZ = seen.shadowZ - seen.z;
        const flight = Math.hypot(flightX, flightZ) || 1;
        awayX = -flightZ / flight;
        awayZ = flightX / flight;
        away = 0.01;
      }
      if (away < 6) {
        const length = Math.hypot(awayX, awayZ) || 1;
        wishX = awayX / length;
        wishZ = awayZ / length;
        // Up against the wall: slide round it instead.
        if (Math.hypot(player.x + wishX * 2, player.z + wishZ * 2) > BOSS.arenaRadius - 0.5) {
          [wishX, wishZ] = [-wishZ, wishX];
        }
      }
    } else if (seen.mode === "dazed") {
      if (bossDistance > 0.3) {
        wishX = toBossX / bossDistance;
        wishZ = toBossZ / bossDistance;
      }
      if (bossDistance < 1.9 && player.grounded) jump = true;
    } else if (bossDistance < 3.2) {
      // Keep off his body while he recovers.
      wishX = -toBossX / (bossDistance || 1);
      wishZ = -toBossZ / (bossDistance || 1);
    }
    // --- Rings: predict constant motion from what was seen, then hop.
    for (const ring of seen.rings) {
      const key = fight.rings.find((live) => live.x === ring.x && live.z === ring.z);
      if (!key || handledRings.has(key)) continue;
      if (!ringPlans.has(key)) {
        ringPlans.set(key, random() < human.miss ? Infinity : (random() * 2 - 1) * human.timing);
      }
      const radiusNow = ring.radius + ring.speed * human.reaction;
      const fromCenter = Math.hypot(player.x - ring.x, player.z - ring.z) || 1;
      const gap = fromCenter - radiusNow;
      // Running with the wave slows its approach; a player sees that too.
      const outward =
        (player.vx * (player.x - ring.x) + player.vz * (player.z - ring.z)) / fromCenter;
      const closing = Math.max(0.5, ring.speed - outward);
      const arrive = (gap - BOSS.ringWidth / 2 - BOSS.playerRadius) / closing;
      if (arrive < 0.18 + ringPlans.get(key)! && player.grounded) {
        jump = true;
        handledRings.add(key);
      }
    }
    // --- Move like the controller: accelerate toward walk speed, jump arc.
    const wish = Math.hypot(wishX, wishZ);
    const targetX = wish ? (wishX / wish) * MOVEMENT_DEFAULTS.walkSpeed : 0;
    const targetZ = wish ? (wishZ / wish) * MOVEMENT_DEFAULTS.walkSpeed : 0;
    const accel =
      (player.grounded ? MOVEMENT_DEFAULTS.groundAccel : MOVEMENT_DEFAULTS.airAccel) * DT;
    const dvx = targetX - player.vx;
    const dvz = targetZ - player.vz;
    const dv = Math.hypot(dvx, dvz);
    if (dv > 0) {
      const k = Math.min(1, accel / dv);
      player.vx += dvx * k;
      player.vz += dvz * k;
    }
    if (jump && player.grounded) {
      player.vy = JUMP_DEFAULTS.jumpSpeed;
      player.grounded = false;
      player.held = 0.3;
    }
    if (!player.grounded) {
      player.held -= DT;
      player.vy -= 30 * getGravityScale(player.vy, player.held > 0, true) * DT;
      player.y += player.vy * DT;
      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
        player.grounded = true;
      }
    }
    player.x += player.vx * DT;
    player.z += player.vz * DT;
    const r = Math.hypot(player.x, player.z);
    if (r > BOSS.arenaRadius) {
      player.x *= BOSS.arenaRadius / r;
      player.z *= BOSS.arenaRadius / r;
    }
    const step = stepBoss(
      fight,
      {
        x: player.x,
        y: player.y,
        z: player.z,
        vy: player.grounded ? -1 : player.vy,
        grounded: player.grounded,
        spinning: false,
      },
      DT,
    );
    events.push(...step);
    for (const event of step) {
      if (event.type === "bounce") {
        player.vy = event.speed;
        player.grounded = false;
        player.held = 0;
      }
    }
    if (fight.lost) return { won: false, time: t, events };
    if (fight.mode === "defeated") return { won: true, time: t, events };
  }
  return { won: false, time: 240, events };
}

for (const [human, target] of [
  [{ name: "an attentive player", reaction: 0.25, timing: 0.08, miss: 0.02 }, 54],
  [{ name: "a casual player", reaction: 0.35, timing: 0.12, miss: 0.05 }, 42],
  [{ name: "a sluggish player", reaction: 0.45, timing: 0.15, miss: 0.08 }, 33],
] satisfies [Human, number][]) {
  test(`Tiny Tusk: ${human.name} usually wins on foot, no sprint`, () => {
    let wins = 0;
    let longest = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const result = fightBoss(human, seed);
      if (result.won) {
        wins++;
        longest = Math.max(longest, result.time);
      }
    }
    assert.ok(wins >= target, `${human.name} won ${wins}/60`);
    assert.ok(longest < 90, `fight dragged to ${longest.toFixed(0)}s`);
  });
}

test("Tiny Tusk: a player who never hops the shockwaves loses", () => {
  const result = fightBoss({ name: "", reaction: 0.3, timing: 0, miss: 1 }, 7);
  assert.equal(result.won, false);
});

test("Tiny Tusk: three stomps, and only while he's dazed", () => {
  const fight = createBoss();
  const above = { x: 0, y: 1.2, z: -6, vy: -4, grounded: false, spinning: false };
  // Mid-intro he can't be stomped.
  assert.equal(stepBoss(fight, above, DT).length, 0);
  fight.mode = "dazed";
  fight.timer = 3;
  fight.duration = 3;
  const hit = stepBoss(fight, above, DT);
  assert.ok(hit.some((e) => e.type === "hit" && e.health === 2));
  assert.ok(hit.some((e) => e.type === "bounce"));
  assert.equal(fight.mode, "hurt");
});

test("Tiny Tusk: the shockwave is jumpable; a standing player gets hit", () => {
  const fight = createBoss();
  fight.mode = "land";
  fight.timer = 99;
  fight.duration = 99;
  fight.masks = 0;
  fight.rings.push({ x: 0, z: 0, radius: 0.5, speed: 7 });
  const airborne = { x: 5, y: 0.8, z: 0, vy: 2, grounded: false, spinning: false };
  for (let t = 0; t < 0.8; t += DT) stepBoss(fight, airborne, DT);
  assert.equal(fight.lost, false);
  const again = createBoss();
  again.mode = "land";
  again.timer = 99;
  again.masks = 0;
  again.rings.push({ x: 0, z: 0, radius: 0.5, speed: 7 });
  const grounded = { x: 5, y: 0, z: 0, vy: -1, grounded: true, spinning: false };
  for (let t = 0; t < 0.8; t += DT) stepBoss(again, grounded, DT);
  assert.equal(again.lost, true);
});
