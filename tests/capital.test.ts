import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  capitalWorld,
  capitalNavigation,
  capitalCaches,
  capitalSurfaceAt,
  capitalFloorHeight,
  capitalBlocked,
  capitalBosses,
  capitalEnemySpawns,
  capitalLifts,
  capitalSurfaces,
  capitalLineClear,
  capitalShortcut,
  capitalCathedralShortcut,
  capitalFoundations,
  capitalShrines,
  capitalSurfaceHeight,
} from "../src/gameplay/capitalLayout.ts";
import { buildCapitalEnvironment } from "../src/gameplay/capitalEnvironment.ts";
import {
  beginCapitalBoss,
  activateCapitalBeacon,
  newCapitalLiftStates,
  requestCapitalLift,
  stepCapitalLift,
  capitalInteraction,
} from "../src/gameplay/capitalProgress.ts";
import { newParishProgress } from "../src/gameplay/ashenParish.ts";
import {
  createParishEncounter,
  resetParishEncounter,
  stepParishEncounter,
} from "../src/gameplay/parishEncounter.ts";
import { stepEncounter } from "../src/gameplay/bossEncounter.ts";

void test("stacked cathedral floors stay distinct and both lift shafts contain no fixed paving", () => {
  for (const y of [24, 36, 44]) assert.equal(capitalFloorHeight(-12, -65, y), y);
  for (const lift of capitalLifts)
    for (const y of [lift.low, lift.high])
      assert.equal(
        capitalFloorHeight(lift.center[0], lift.center[2], y),
        null,
        "fixed paving traps a moving platform",
      );
  for (const e of capitalEnemySpawns)
    assert.ok(
      Math.abs(capitalFloorHeight(e.position[0], e.position[2], e.position[1])! - e.position[1]) <
        0.12,
      `${e.id} must stand on its intended floor`,
    );
  assert.ok(capitalSurfaces.some((s) => s.id.startsWith("beacon-spiral")));
});
void test("mini-boss victory unlocks the crown switch; final victory and both flags survive an in-place retry", () => {
  const p = newParishProgress(),
    s = createParishEncounter(p, capitalWorld),
    c = s.combat;
  assert.equal(beginCapitalBoss(s, "colosseum", p), null);
  assert.deepEqual(beginCapitalBoss(s, "cathedral", p), capitalBosses.cathedral.spawn);
  c.bossHealth = 0;
  stepParishEncounter(s, 0.016, p);
  assert.ok(p.cathedralFelled && !p.fogCleared);
  assert.equal(activateCapitalBeacon(p), true);
  assert.ok(p.fogCleared);
  assert.equal(s.bossFelled, false);
  assert.equal(c.bossActive, false);
  p.checkpoint = "kiln";
  resetParishEncounter(s, p);
  assert.equal(s.combat, c, "the mounted player keeps its combat binding");
  assert.equal(beginCapitalBoss(s, "cathedral", p), null);
  assert.deepEqual(beginCapitalBoss(s, "colosseum", p), capitalBosses.colosseum.spawn);
  c.bossHealth = 0;
  stepParishEncounter(s, 0.016, p);
  assert.ok(p.finalFelled && s.bossFelled);
  resetParishEncounter(s, p);
  assert.ok(s.bossFelled && p.cathedralFelled && p.finalFelled);
});
void test("lifts unlock below, can be recalled, and travel smoothly without overshooting", () => {
  const p = newParishProgress(),
    states = newCapitalLiftStates();
  assert.equal(requestCapitalLift("beacon", 24, p, states), false);
  assert.equal(requestCapitalLift("beacon", -4, p, states), false);
  p.fogCleared = true;
  assert.equal(requestCapitalLift("beacon", -4, p, states), true);
  assert.ok(p.beaconLift);
  for (let i = 0; i < 700; i++) stepCapitalLift(states.beacon, 1 / 60);
  assert.equal(states.beacon.y, -4);
  assert.equal(requestCapitalLift("beacon", -4, p, states), true);
  for (let i = 0; i < 700; i++) stepCapitalLift(states.beacon, 1 / 60);
  assert.equal(states.beacon.y, 24);
  requestCapitalLift("beacon", -4, p, states);
  assert.equal(states.beacon.target, -4);
  const before = states.beacon.y;
  stepCapitalLift(states.beacon, 0);
  assert.equal(states.beacon.y, before);
});
void test("the enclosed town lift uses the passage key and retains its release after retry", () => {
  const p = newParishProgress(),
    lifts = newCapitalLiftStates();
  assert.equal(lifts.town.y, 8);
  assert.equal(requestCapitalLift("town", 8, p, lifts), false);
  p.caches.push("town-key");
  assert.equal(requestCapitalLift("town", 8, p, lifts), true);
  assert.equal(lifts.town.target, 20);
  for (let i = 0; i < 300; i++) stepCapitalLift(lifts.town, 1 / 60);
  assert.equal(lifts.town.y, 20);
  assert.equal(requestCapitalLift("town", 20, p, lifts), true);
  const s = createParishEncounter(p, capitalWorld);
  resetParishEncounter(s, p);
  assert.ok(p.townLift);
});
void test("the terrace massing leaves every lift shaft open through its full travel", () => {
  for (const lift of capitalLifts) {
    for (let y = lift.low; y <= lift.high; y += 0.5) {
      assert.equal(
        capitalBlocked(lift.center[0], y, lift.center[2], 0.42),
        false,
        `${lift.id} shaft blocked at ${y}`,
      );
    }
    assert.ok(
      capitalFoundations.every(
        (f) => capitalSurfaceHeight(f.surface, lift.center[0], lift.center[2]) === null,
      ),
    );
  }
});
void test("a relocated cathedral encounter keeps leap targets inside its own arena", () => {
  const p = newParishProgress(),
    s = createParishEncounter(p, capitalWorld);
  beginCapitalBoss(s, "cathedral", p);
  const c = s.combat;
  Object.assign(c, { phase: "windup", move: "leap", timer: 3, playerX: 80, playerZ: -150 });
  stepEncounter(c, 0.016);
  assert.ok(Math.hypot(c.leapToX - c.arenaX, c.leapToZ - c.arenaZ) <= c.arenaRadius + 0.001);
  assert.ok(c.leapToZ < -50);
});
void test("cathedral combat cannot hit through another floor or chase outside the oratory", () => {
  const p = newParishProgress(),
    s = createParishEncounter(p, capitalWorld);
  beginCapitalBoss(s, "cathedral", p);
  const c = s.combat;
  Object.assign(c, {
    playerX: c.bossX,
    playerZ: c.bossZ + 2,
    playerY: 36,
    playerYaw: Math.PI,
    attackTime: 0.4,
    attackId: 1,
    phase: "strike",
    move: "sweep",
    timer: 0,
    bossYaw: 0,
  });
  stepEncounter(c, 0.016);
  assert.equal(c.bossHealth, 260);
  assert.equal(c.health, 100);
  Object.assign(c, { playerY: 44, attackId: 3, attackTime: 0.4, hitIndex: 0, timer: 0 });
  stepEncounter(c, 0.016);
  assert.ok(c.bossHealth < 260 && c.health < 100);
  Object.assign(c, {
    phase: "approach",
    playerX: 100,
    playerZ: 100,
    bossX: 50,
    bossZ: 20,
    attackTime: 0,
  });
  stepEncounter(c, 0.016);
  assert.ok(Math.hypot(c.bossX - c.arenaX, c.bossZ - c.arenaZ) <= c.arenaRadius + 0.001);
});
void test("the early return is barred to navigation and only releases from the town side", () => {
  const p = newParishProgress(),
    g = capitalShortcut,
    nx = Math.sin(g.yaw),
    nz = Math.cos(g.yaw);
  const a = [g.position[0] - nx * 2, 8, g.position[2] - nz * 2] as [number, number, number],
    b = [g.position[0] + nx * 2, 8, g.position[2] + nz * 2] as [number, number, number];
  assert.equal(capitalInteraction(...a, p, false, false)?.available, true);
  assert.equal(capitalInteraction(...b, p, false, false)?.available, false);
  assert.equal(capitalLineClear(a[0], a[2], b[0], b[2], p, 8), false);
  p.refuge = true;
  assert.equal(capitalLineClear(a[0], a[2], b[0], b[2], p, 8), true);
  const s = createParishEncounter(p, capitalWorld);
  resetParishEncounter(s, p);
  assert.ok(p.refuge);
});
void test("the cathedral return opens only from inside and survives a checkpoint retry", () => {
  const p = newParishProgress();
  const [x, y, z] = capitalCathedralShortcut.position;
  const outside = capitalInteraction(x, y, z + 2, p, false, false);
  const inside = capitalInteraction(x, y, z - 2, p, false, false);
  assert.equal(outside?.kind, "gate");
  assert.equal(outside?.available, false);
  assert.equal(inside?.kind, "gate");
  assert.equal(inside?.id, "court");
  assert.equal(inside?.available, true);
  assert.equal(capitalInteraction(x, y, z - 2, p, true, false)?.available, false);
  assert.equal(capitalInteraction(x, y, z - 2, p, false, true)?.available, false);
  assert.equal(capitalLineClear(x, z + 2, x, z - 2, p, y), false);
  p.court = true;
  assert.equal(capitalLineClear(x, z + 2, x, z - 2, p, y), true);
  const s = createParishEncounter(p, capitalWorld);
  p.checkpoint = "kiln";
  resetParishEncounter(s, p);
  assert.ok(p.court);
});
await RAPIER.init();
function fixture() {
  const environment = buildCapitalEnvironment(false),
    world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  for (const c of environment.colliders)
    world.createCollider(RAPIER.ColliderDesc.trimesh(c.vertices, c.indices));
  for (const s of environment.solids)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)
        .setTranslation(s.position[0], s.position[1] + s.size[1] / 2, s.position[2])
        .setRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) }),
    );
  world.step();
  return { environment, world };
}
function walkRoute(start: number[], route: number[][]) {
  const { environment, world } = fixture();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      start[0],
      start[1] + 0.95,
      start[2],
    ),
  );
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.42), body),
    controller = world.createCharacterController(0.03);
  controller.enableAutostep(0.55, 0.3, false);
  controller.enableSnapToGround(0.5);
  controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
  try {
    for (const [x, y, z] of route) {
      const budget = Math.max(
        1400,
        Math.ceil(Math.hypot(x - body.translation().x, z - body.translation().z) / 0.015) + 120,
      );
      for (let i = 0; i < budget; i++) {
        const p = body.translation(),
          length = Math.hypot(x - p.x, z - p.z);
        if (length < 0.2) break;
        controller.computeColliderMovement(
          collider,
          {
            x: ((x - p.x) / length) * Math.min(0.07, length),
            y: -0.06,
            z: ((z - p.z) / length) * Math.min(0.07, length),
          },
          undefined,
          undefined,
          (c) => c.handle !== collider.handle,
        );
        const move = controller.computedMovement();
        body.setNextKinematicTranslation({ x: p.x + move.x, y: p.y + move.y, z: p.z + move.z });
        world.step();
      }
      // Let gravity settle the capsule after reaching a downhill waypoint.
      // Horizontal arrival alone does not imply that a descent has landed.
      for (let i = 0; i < 60; i++) {
        const p = body.translation();
        controller.computeColliderMovement(
          collider,
          { x: 0, y: -0.06, z: 0 },
          undefined,
          undefined,
          (c) => c.handle !== collider.handle,
        );
        const move = controller.computedMovement();
        body.setNextKinematicTranslation({ x: p.x + move.x, y: p.y + move.y, z: p.z + move.z });
        world.step();
      }
      const p = body.translation();
      assert.ok(
        Math.hypot(x - p.x, z - p.z) < 0.25,
        `blocked toward ${x},${y},${z}; stopped ${p.x},${p.y},${p.z}`,
      );
      assert.ok(
        Math.abs(p.y - 0.95 - y) < 0.3,
        `wrong floor at ${x},${z}: foot ${p.y - 0.95}, expected ${y}`,
      );
      assert.equal(capitalBlocked(x, y, z, 0.42), false, `AI blocking at ${x},${y},${z}`);
    }
  } finally {
    world.free();
    environment.dispose();
  }
}
function walkReflectedRoute(start: number[], route: number[][]) {
  walkRoute(
    [-start[0], start[1], start[2]],
    route.map(([x, y, z]) => [-x, y, z]),
  );
}
void test("the real player capsule walks from the entry wall to the chapel through every ramp join", () => {
  walkReflectedRoute(
    [0, 0, 73],
    [
      [0, 8, 44],
      [-18, 8, 36],
      [-35, 8, 36],
      [-54, 8, 31],
      [-54, 8, 4],
      [-54, 16, -16],
      [-34, 24, -16],
      [-34, 24, -32],
      [0, 24, -32],
      [0, 24, -12],
    ],
  );
});
void test("the entire curved entry terrace stays clear of town walls and rounded buttresses", () => {
  const route = Array.from({ length: 40 }, (_, i) => {
    const angle = (-2 * (i + 1)) / 40;
    return [Math.sin(angle) * 29, 8, 12 + Math.cos(angle) * 29];
  });
  walkReflectedRoute([0, 8, 41], route);
});
void test("cathedral galleries and exterior ramps form a complete playable return loop", () => {
  walkRoute(
    [0, 24, -32],
    [
      [-18, 24, -32],
      [-34, 24, -40],
      [-34, 36, -72],
      [-12, 36, -72],
      [-12, 36, -84],
      [12, 36, -84],
      [15, 36, -84],
      [44, 36, -84],
      [44, 24, -52],
      [18, 24, -32],
      [0, 24, -32],
    ],
  );
});
void test("the opened town return and garden return are walkable shortcuts", () => {
  walkReflectedRoute(
    [-54, 8, 36],
    [
      [-86, 8, 36],
      [-86, 0, 52],
      [-59, 0, 45],
    ],
  );
  walkRoute(
    [-62, 24, -48],
    [
      [-70, 24, -70],
      [-70, 36, -98],
      [-42, 36, -98],
      [-30, 36, -84],
      [-34, 36, -72],
      [-12, 36, -72],
    ],
  );
});
void test("the entry battlements leave a clear approach to the forest return", () => {
  walkRoute([0, 0, 73], [[0, 0, 85]]);
});
void test("the opening checkpoint walks along the curtain to the first exposed bridge", () => {
  const start = capitalShrines[0].spawn;
  const angle = Math.atan2(start[0], start[2]);
  const route = Array.from({ length: 30 }, (_, i) => {
    const a = angle * (1 - (i + 1) / 30);
    return [Math.sin(a) * 73.5, 0, Math.cos(a) * 73.5];
  });
  route.push([0, 0, 73], [0, 8, 44]);
  walkRoute(start, route);
});
void test("the enclosed town lift has reachable landings on both inhabited floors", () => {
  walkReflectedRoute(
    [-65, 8, 34],
    [
      [-76, 8, 34],
      [-84, 8, 34],
    ],
  );
  walkReflectedRoute(
    [-65, 20, 29],
    [
      [-76, 20, 29],
      [-76, 20, 34],
      [-84, 20, 34],
    ],
  );
});
void test("the beacon descent and lower street lead continuously to the colosseum", () => {
  const route: number[][] = [
    [42, 24, -24],
    [42, 24, -14],
  ];
  for (let i = 1; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2.5;
    route.push([
      42 + Math.sin(t) * 10,
      24 - 28 * Math.max(0, (t - 0.4) / (Math.PI * 2.5 - 0.4)),
      -24 + Math.cos(t) * 10,
    ]);
  }
  route.push([52, -4, -24], [60, -4, -24], [60, -8, 30], [20, -8, 38], [0, -12, 24], [0, -12, 18]);
  walkReflectedRoute([18, 24, -32], route);
});
void test("the lower beacon landing returns to the street without crossing the descending spiral", () => {
  walkReflectedRoute(
    [38, -4, -11],
    [
      [38, -4, -30],
      [42, -4, -38],
      [60, -4, -38],
      [60, -4, -24],
      [60, -8, 30],
    ],
  );
});
void test("the capital batches architecture and releases every owned resource exactly once", () => {
  const env = buildCapitalEnvironment(false),
    geometries = new Set<THREE.BufferGeometry>();
  let visible = 0,
    hidden = 0;
  env.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      geometries.add(o.geometry);
      if (o.visible) visible++;
      else hidden++;
    }
  });
  assert.ok(visible < hidden / 3, `${visible} visible, ${hidden} source meshes`);
  const counts = new Map<THREE.BufferGeometry, number>();
  geometries.forEach((g) =>
    g.addEventListener("dispose", () => counts.set(g, (counts.get(g) ?? 0) + 1)),
  );
  env.dispose();
  env.dispose();
  assert.equal(counts.size, geometries.size);
  assert.ok([...counts.values()].every((n) => n === 1));
});
void test("the buried town key and three inhabited floors are reachable without jumps", () => {
  walkReflectedRoute(
    [-54, 8, 31],
    [
      [-54, 8, 36],
      [-45, 8, 36],
      [-45, 8, 32],
      [-45, 4, 18],
      [-63, 4, 10],
      [-45, 4, 18],
      [-45, 8, 32],
      [-45, 8, 36],
      [-54, 8, 36],
      [-54, 8, 31],
      [-54, 8, 21],
      [-52, 8, 21],
      [-52, 14, 9],
      [-54, 14, 9],
      [-54, 14, 15],
      [-57, 14, 15],
      [-57, 14, 6],
      [-65, 14, 6],
      [-65, 14, 7],
      [-65, 20, 29],
      [-54, 20, 29],
      [-54, 20, 15],
      [-54, 20, 17],
      [-39, 20, 17],
      [-39, 20, 15],
      [-39, 24, 2],
      [-34, 24, 2],
    ],
  );
});
void test("the cathedral third floor, western oratory and crown beacon share a walkable route", () => {
  walkRoute(
    [-12, 36, -84],
    [
      [-20, 36, -84],
      [-20, 44, -54],
      [-12, 44, -54],
      [-26, 44, -54],
      [-36, 44, -65],
      [-26, 44, -54],
      [-12, 44, -54],
      [-12, 50, -76],
      [-7, 50, -76],
      [-7, 50, -77],
      [-2, 50, -77],
    ],
  );
});
void test("the roof chapel reconnects to the third cathedral gallery", () => {
  walkRoute(
    [12, 44, -55],
    [
      [12, 44, -54],
      [24, 44, -54],
      [24, 44, -28],
      [0, 45.45, -17],
      [0, 45.45, -5],
    ],
  );
});
void test("the royal backyard reconnects with the upper town through the vaulted undercroft", () => {
  walkRoute(
    [-70, 24, -48],
    [
      [-70, 14, -28],
      [88, 14, -28],
      [88, 14, 22],
      [75, 14, 22],
      [75, 14, 12],
      [75, 16, -16],
      [54, 16, -16],
    ],
  );
});
void test("the newly revealed street has a continuous city-wall shortcut", () => {
  walkReflectedRoute(
    [60, -8, 30],
    [
      [70, -8, 30],
      [70, -8, 49],
      [74, 0, 65],
      [54, 0, 51],
    ],
  );
});
void test("the side chapel and right crown road can be entered from the main level", () => {
  walkRoute(
    [0, 24, -65],
    [
      [12, 24, -72],
      [29, 24, -72],
      [29, 24, -61],
      [29, 24, -52],
      [44, 24, -52],
      [18, 24, -32],
      [18.5, 24, -18],
      [18.5, 24, 9],
      [18, 24, 10],
    ],
  );
});
void test("the crown switch is guarded and its unlocked state survives a retry", () => {
  const p = newParishProgress();
  assert.equal(activateCapitalBeacon(p), false);
  assert.equal(capitalInteraction(-2, 50, -77, p, false, false)?.available, false);
  p.cathedralFelled = true;
  assert.equal(capitalInteraction(-2, 50, -77, p, false, false)?.available, true);
  assert.equal(activateCapitalBeacon(p), true);
  assert.equal(activateCapitalBeacon(p), false);
  const s = createParishEncounter(p, capitalWorld);
  resetParishEncounter(s, p);
  assert.ok(p.fogCleared && p.cathedralFelled);
});
void test("the second town gallery connects around the stairwell to its western rooms", () => {
  walkReflectedRoute(
    [-54, 14, 9],
    [
      [-49.2, 14, 9],
      [-49.2, 14, 14],
      [-39, 14, 14],
      [-39, 14, 26],
    ],
  );
});
void test("authored navigation reaches the hidden town key, upper sanctuaries and lower homes", () => {
  const visited = new Set<string>(),
    queue = [capitalWorld.surfaceId(0, 73, 0)!];
  while (queue.length) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    queue.push(...capitalNavigation.links.get(id)!);
  }
  for (const cache of capitalCaches) {
    const [x, y, z] = cache.position,
      id = capitalSurfaceAt(x, z, y)?.id;
    assert.ok(id && visited.has(id), `${cache.name} has no connected route`);
  }
  const low = capitalSurfaceAt(-12, -65, 24)!,
    high = capitalSurfaceAt(-12, -65, 44)!;
  assert.equal(
    capitalNavigation.connected(low.id, high.id),
    false,
    "stacked galleries cannot connect through the nave projection",
  );
});
void test("the lower street homes are physically enterable from their matching street elevation", () => {
  const y = -4 - ((8 + 18.5) * 4) / 43;
  walkReflectedRoute(
    [60, y, 8],
    [
      [70, y, 8],
      [60, y, 8],
      [50, y, 8],
      [60, y, 8],
    ],
  );
});
void test("the second exposed wall bridge connects the broken eastern arc to the town terrace", () => {
  walkReflectedRoute(
    [-34, 0, 65],
    [
      [-18, 8, 37],
      [0, 8, 44],
      [0, 0, 73],
    ],
  );
});

void test("the town sits on the entry side of the chapel and connects without a rear scaffold loop", () => {
  walkReflectedRoute(
    [-18, 8, 36],
    [
      [-54, 8, 31],
      [-54, 8, 21],
    ],
  );
});
void test("the furnished cathedral retains a clear nave aisle between the pew banks", () => {
  walkRoute(
    [0, 24, -43],
    [
      [0, 24, -80],
      [0, 24, -43],
    ],
  );
});
void test("the cathedral interior stair connects the nave and gallery without trapping the capsule", () => {
  walkRoute(
    [14.5, 24, -48],
    [
      [14.5, 36, -82],
      [12, 36, -84],
      [14.5, 36, -82],
      [14.5, 24, -48],
      [0, 24, -48],
      [0, 24, -43],
    ],
  );
});

void test("the eastern retaining crown and clock bay are walkable above the town arcade", () => {
  walkRoute(
    [24, 44, -28],
    [
      [29, 44.04, -20],
      [29, 44, -28],
      [43, 44, -28],
      [29, 44, -28],
      [29, 44.04, -20],
      [29, 24.04, 9],
      [18, 24, 10],
    ],
  );
});
