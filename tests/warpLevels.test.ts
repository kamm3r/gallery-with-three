import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { getGravityScale, JUMP_DEFAULTS } from "../src/gameplay/playerRules.ts";
import { MOVEMENT_DEFAULTS } from "../src/gameplay/movement.ts";
import {
  CRATE_SIZE,
  enemyPosition,
  solidTop,
  WARP_LEVEL_IDS,
  WARP_LEVELS,
  type WarpLevel,
} from "../src/gameplay/warpLevels.ts";
import { RUN } from "../src/gameplay/warpRun.ts";

const GRAVITY = 30;

/** Jump at walk speed with jump held: horizontal reach and peak height. */
function jumpArc(launch = JUMP_DEFAULTS.jumpSpeed, speed = MOVEMENT_DEFAULTS.walkSpeed) {
  let y = 0;
  let vy = launch;
  let x = 0;
  let peak = 0;
  const dt = 1 / 240;
  do {
    vy -= GRAVITY * getGravityScale(vy, true, true) * dt;
    y += vy * dt;
    x += speed * dt;
    peak = Math.max(peak, y);
  } while (y > 0);
  return { reach: x, peak };
}

/** Highest surface that can be under (x, z) at some point: solids plus mover sweeps. */
function supportTop(level: WarpLevel, x: number, z: number) {
  let top = solidTop(level, x, z);
  for (const mover of level.movers) {
    const sweepX = mover.axis === "x" ? mover.distance : 0;
    const sweepZ = mover.axis === "z" ? mover.distance : 0;
    if (
      Math.abs(x - mover.x) <= mover.w / 2 + sweepX &&
      Math.abs(z - mover.z) <= mover.d / 2 + sweepZ
    )
      top = Math.max(top, mover.top + (mover.axis === "y" ? mover.distance : 0));
  }
  return top;
}

function samplePath(level: WarpLevel, step = 0.1) {
  const samples: { x: number; z: number; top: number }[] = [];
  for (let i = 1; i < level.path.length; i++) {
    const [ax, az] = level.path[i - 1];
    const [bx, bz] = level.path[i];
    const length = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s < length; s += step) {
      const x = ax + ((bx - ax) * s) / length;
      const z = az + ((bz - az) * s) / length;
      samples.push({ x, z, top: supportTop(level, x, z) });
    }
  }
  return samples;
}

const walkJump = jumpArc();
const springJump = jumpArc(RUN.springBounce);

test("the walk-speed jump clears a comfortable gap", () => {
  assert.ok(walkJump.reach > 3, `reach ${walkJump.reach.toFixed(2)}`);
  assert.ok(walkJump.peak > 1.7, `peak ${walkJump.peak.toFixed(2)}`);
});

for (const id of WARP_LEVEL_IDS) {
  const level = WARP_LEVELS[id];

  test(`${level.name}: every gap on the route is jumpable at walking pace`, () => {
    const samples = samplePath(level);
    let gapStart = -1;
    let lastTop = samples[0].top;
    assert.ok(Number.isFinite(lastTop), "spawn has ground");
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      if (!Number.isFinite(sample.top)) {
        if (gapStart < 0) gapStart = i;
        continue;
      }
      if (gapStart >= 0) {
        const gap = Math.hypot(sample.x - samples[gapStart].x, sample.z - samples[gapStart].z);
        // Center must land over the far edge: keep most of a body width spare.
        assert.ok(
          gap <= walkJump.reach - 0.8,
          `gap of ${gap.toFixed(2)}m near z=${sample.z.toFixed(1)}`,
        );
        gapStart = -1;
      }
      const rise = sample.top - lastTop;
      if (rise > 0.01) {
        const spring = level.crates.some(
          (crate) =>
            (crate.kind === "spring" || crate.kind === "bounce") &&
            Math.hypot(crate.x - sample.x, crate.z - sample.z) < 3,
        );
        const limit = spring ? springJump.peak + CRATE_SIZE - 0.4 : walkJump.peak - 0.4;
        assert.ok(rise <= limit, `rise of ${rise.toFixed(2)}m near z=${sample.z.toFixed(1)}`);
      }
      lastTop = sample.top;
    }
    assert.equal(gapStart, -1, "the route ends on ground");
  });

  test(`${level.name}: pickups, crates, enemies and the exit rest on something`, () => {
    for (const crate of level.crates) {
      const floor = solidTop(level, crate.x, crate.z);
      const stacked = level.crates.some(
        (other) =>
          other !== crate &&
          other.x === crate.x &&
          other.z === crate.z &&
          Math.abs(other.y + CRATE_SIZE - crate.y) < 1e-9,
      );
      assert.ok(Math.abs(floor - crate.y) < 1e-9 || stacked, `crate at z=${crate.z}`);
    }
    for (const [x, y, z] of level.fruit) {
      // Fruit over a gap floats on the jump arc; everything else above ground.
      let top = supportTop(level, x, z);
      for (let dz = -3; !Number.isFinite(top) && dz <= 3; dz += 0.25)
        top = supportTop(level, x, z + dz);
      assert.ok(y - top > 0.3 && y - top < 6.5, `fruit at ${x},${y},${z}`);
    }
    for (const enemy of level.enemies) {
      for (const t of [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]) {
        const at = enemyPosition(enemy, (t * enemy.range * 4) / enemy.speed / 4);
        assert.equal(solidTop(level, at.x, at.z), enemy.y, `${enemy.kind} at z=${enemy.z}`);
      }
    }
    const [cx, cy, cz] = level.crystal;
    const crystalGround = solidTop(level, cx, cz);
    assert.ok(cy - crystalGround > 0.5 && cy - crystalGround < 1.6, "crystal floats reachably");
    assert.equal(solidTop(level, level.exit[0], level.exit[2]), level.exit[1], "exit on ground");
    assert.equal(
      solidTop(level, level.spawn[0], level.spawn[2]),
      level.spawn[1],
      "spawn on ground",
    );
    assert.ok(existsSync(`public${level.image}`));
  });

  test(`${level.name}: no crate stack walls off the route`, () => {
    // A double stack is too tall to hop; only a spin clears it. Keep them aside.
    for (const crate of level.crates) {
      if (crate.y - solidTop(level, crate.x, crate.z) < CRATE_SIZE - 1e-9) continue;
      const nearPath = samplePath(level, 0.25).some(
        (sample) => Math.abs(sample.x - crate.x) < 1.3 && Math.abs(sample.z - crate.z) < 0.5,
      );
      assert.ok(!nearPath, `stacked crate on the route at ${crate.x},${crate.z}`);
    }
  });

  test(`${level.name}: has a crystal, a checkpoint and enough crates for a gem`, () => {
    assert.ok(
      level.crates.filter((crate) => crate.kind === "check").length >= (id === "boulder" ? 0 : 1),
    );
    assert.ok(level.crates.length >= 8);
    assert.ok(level.fruit.length >= 15);
    assert.ok(level.crystal[2] < level.spawn[2] && level.crystal[2] > level.exit[2]);
  });
}

test("the levels are in order and each is distinct", () => {
  assert.deepEqual(
    WARP_LEVEL_IDS.map((id) => WARP_LEVELS[id].index),
    [0, 1, 2, 3, 4],
  );
  assert.equal(new Set(WARP_LEVEL_IDS.map((id) => WARP_LEVELS[id].theme.deco)).size, 5);
});
