import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import {
  capitalWorld,
  capitalNavigation,
  capitalCaches,
  capitalFloorHeight,
  capitalBlocked,
  capitalBosses,
  capitalEnemySpawns,
  capitalLifts,
  capitalSurfaces,
  capitalSolids,
  capitalLineClear,
  capitalShortcut,
  capitalCathedralShortcut,
  capitalTownGate,
  capitalBeaconSeal,
  capitalShrines,
  capitalNpcs,
  capitalBeacon,
  capitalLevel,
  capitalSurfaceHeight,
  CAPITAL_EXIT,
} from "../src/gameplay/capitalLayout.ts";
import {
  CAPITAL_SITES,
  TIER_H,
  TIER_R,
  LOWER_STREET_X,
  TIER_STAIRS,
  bandMid,
  onTier,
  CAPITAL_HOMES,
  polar,
} from "../src/gameplay/capitalDistricts.ts";
import { CAPITAL_METRICS } from "../src/gameplay/capitalMetrics.ts";
import { buildCapitalEnvironment } from "../src/gameplay/capitalEnvironment.ts";
import {
  beginCapitalBoss,
  activateCapitalBeacon,
  newCapitalLiftStates,
  requestCapitalLift,
  stepCapitalLift,
  capitalInteraction,
} from "../src/gameplay/capitalProgress.ts";
import { newParishProgress, type ParishPoint } from "../src/gameplay/ashenParish.ts";
import {
  createParishEncounter,
  resetParishEncounter,
  stepParishEncounter,
} from "../src/gameplay/parishEncounter.ts";
import { stepEncounter } from "../src/gameplay/bossEncounter.ts";

/** Eight offsets on a circle, so checks do not depend on how a shaft is turned. */
const ring8 = (r: number) =>
  Array.from({ length: 8 }, (_, i) => [
    Math.cos((i * Math.PI) / 4) * r,
    Math.sin((i * Math.PI) / 4) * r,
  ]);
const near = (p: ParishPoint, tolerance = 0.12) =>
  Math.abs((capitalFloorHeight(p[0], p[2], p[1]) ?? Infinity) - p[1]) < tolerance;

void test("the level is built only from catalogue kit pieces and kit floor panels", () => {
  const models = new Set(capitalLevel.pieces.map((p) => p.model));
  for (const model of [
    "wall",
    "pillar",
    "stairs",
    "curved-stairs",
    "walkway",
    "hallway",
    "elevator",
    "doorway",
    "double-door",
    "scaffold",
    "crate",
    "drum",
    "log-pile",
    "debris",
    "corner-wall",
    "fallen-beam",
    "post",
  ])
    assert.ok(models.has(model as never), `no ${model} in the level`);
  assert.ok(capitalLevel.pieces.length > 400);
});

void test("every anchor stands on its floor and outside every collider", () => {
  const anchors: Array<[string, ParishPoint]> = [
    ...capitalCaches.map((c): [string, ParishPoint] => [c.id, c.position]),
    ...capitalShrines.map((s): [string, ParishPoint] => [`shrine ${s.id}`, s.spawn]),
    ...capitalEnemySpawns.map((e): [string, ParishPoint] => [e.id, e.position]),
    ...capitalNpcs.map((n): [string, ParishPoint] => [n.id, n.position]),
    ...Object.entries(capitalBosses).flatMap(([id, b]): Array<[string, ParishPoint]> => [
      [`${id} spawn`, b.spawn],
      [`${id} entry`, b.entry],
      [`${id} origin`, b.origin],
    ]),
    ["beacon switch", capitalBeacon.position],
    ["forest exit", CAPITAL_EXIT],
  ];
  for (const [id, p] of anchors) {
    assert.ok(near(p), `${id} has no floor at ${p.join(",")}`);
    if (!id.startsWith("shrine") || id.endsWith("spawn"))
      assert.equal(capitalBlocked(p[0], p[1], p[2], 0.3), false, `${id} is inside a collider`);
  }
  for (const e of capitalEnemySpawns)
    assert.equal(
      capitalWorld.surfaceId(...([e.position[0], e.position[2], e.position[1]] as const)) !== null,
      true,
    );
});

void test("lift shafts hold no fixed floor or collider through their whole travel", () => {
  for (const lift of capitalLifts) {
    const [x, , z] = lift.center;
    for (let y = lift.low; y <= lift.high; y += 0.5) {
      assert.equal(capitalBlocked(x, y, z, 0.42), false, `${lift.id} shaft blocked at ${y}`);
      for (const [dx, dz] of [
        [0, 0],
        [2, 2],
        [-2, 2],
        [2, -2],
        [-2, -2],
      ])
        assert.ok(
          capitalSurfaces.every((s) => {
            const h = capitalSurfaceHeight(s, x + dx, z + dz);
            return h === null || h < lift.low - 0.5 || h > lift.high + 3;
          }),
          `${lift.id}: fixed floor in the shaft at ${y}`,
        );
    }
    // Each landing touches the deck edge on the floor it serves.
    for (const y of [lift.low, lift.high])
      assert.ok(
        ring8(3.6).some(([dx, dz]) => near([x + dx, y, z + dz])),
        `${lift.id} has no landing at ${y}`,
      );
  }
});

void test("the lowest tier keeps a broad open courtyard inside the great gate", () => {
  assert.ok(TIER_R[0] - TIER_R[1] >= 35);
  // A sixteen-metre-wide gathering space between the row houses and curtain wall.
  for (let radius = 0; radius <= 8; radius += 0.5)
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
      const x = CAPITAL_SITES.courtyard[0] + Math.cos(angle) * radius;
      const z = CAPITAL_SITES.courtyard[2] + Math.sin(angle) * radius;
      assert.ok(near([x, 0, z], 0.05), `courtyard floor missing at ${x},${z}`);
      assert.equal(capitalBlocked(x, 0, z, 0.42), false, `courtyard blocked at ${x},${z}`);
    }
});

void test("the boss rooms keep their whole leash circle open floor", () => {
  for (const [id, boss] of Object.entries(capitalBosses)) {
    const [ox, oy, oz] = boss.origin,
      keep = boss.radius + 1.5;
    for (let r = 0; r <= keep; r += 1.5)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const x = ox + Math.cos(a) * r,
          z = oz + Math.sin(a) * r;
        assert.ok(near([x, oy, z], 0.05), `${id}: no floor at ${x.toFixed(1)},${z.toFixed(1)}`);
        assert.equal(capitalBlocked(x, oy, z, 0), false, `${id}: blocked at ${x},${z}`);
      }
  }
});

void test("doors, rooms, paths, streets and hallways meet the reference metrics", () => {
  for (const d of capitalLevel.doors) {
    assert.ok(d.width >= CAPITAL_METRICS.doorWidth, `${d.id} is ${d.width} m wide`);
    assert.ok(d.height >= CAPITAL_METRICS.doorHeight, `${d.id} is ${d.height} m tall`);
  }
  assert.ok(capitalLevel.doors.length >= 20);
  for (const r of capitalLevel.rooms) {
    assert.ok(Math.min(r.width, r.depth) >= CAPITAL_METRICS.roomSize, `${r.id} is too small`);
    assert.ok(r.height >= CAPITAL_METRICS.hallwayHeight, `${r.id} is too low`);
  }
  for (const route of capitalLevel.routes) {
    const minimum =
      route.kind === "street" ? CAPITAL_METRICS.streetWidth : CAPITAL_METRICS.pathWidth;
    assert.ok(route.width >= minimum, `${route.id} is ${route.width} m wide`);
    if (route.headroom !== undefined)
      assert.ok(route.headroom >= CAPITAL_METRICS.hallwayHeight, `${route.id} headroom`);
  }
  // Exterior main flights are street-wide.
  for (const id of [...TIER_STAIRS.map((t) => `tier-stair-${t.k + 1}`), "outside-path-stair"])
    assert.ok(
      capitalLevel.routes.find((r) => r.id === id)!.width >= CAPITAL_METRICS.streetWidth,
      id,
    );
});

void test("every walkable surface joins one network through doors, stairs and lifts", () => {
  const links = new Map(
    capitalSurfaces.map((s) => [s.id, new Set(capitalNavigation.links.get(s.id))]),
  );
  const at = (x: number, y: number, z: number) => capitalWorld.surfaceId(x, z, y)!;
  for (const lift of capitalLifts) {
    const ends = [lift.low, lift.high].map((y) => {
      const [dx, dz] = ring8(3.6).find(([dx, dz]) =>
        near([lift.center[0] + dx, y, lift.center[2] + dz]),
      )!;
      return at(lift.center[0] + dx, y, lift.center[2] + dz);
    });
    links.get(ends[0])!.add(ends[1]);
    links.get(ends[1])!.add(ends[0]);
  }
  const first = at(...([capitalShrines[0].spawn[0], 0, capitalShrines[0].spawn[2]] as const));
  const seen = new Set<string>([first]),
    queue = [first];
  while (queue.length)
    for (const next of links.get(queue.shift()!)!)
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  const missing = capitalSurfaces.filter((s) => !seen.has(s.id)).map((s) => s.id);
  assert.deepEqual(missing, []);
});

void test("boss victories, the switch and lift releases survive in-place retries", () => {
  const p = newParishProgress(),
    s = createParishEncounter(p, capitalWorld),
    c = s.combat;
  assert.equal(beginCapitalBoss(s, "colosseum", p), null);
  assert.deepEqual(beginCapitalBoss(s, "cathedral", p), capitalBosses.cathedral.spawn);
  c.bossHealth = 0;
  stepParishEncounter(s, 0.016, p);
  assert.ok(p.cathedralFelled && !p.fogCleared);
  const [bx, by, bz] = capitalBeacon.position;
  assert.equal(capitalInteraction(bx, by, bz - 1, p, false, false)?.available, true);
  assert.equal(activateCapitalBeacon(p), true);
  p.checkpoint = "kiln";
  resetParishEncounter(s, p);
  assert.equal(beginCapitalBoss(s, "cathedral", p), null);
  assert.deepEqual(beginCapitalBoss(s, "colosseum", p), capitalBosses.colosseum.spawn);
  c.bossHealth = 0;
  stepParishEncounter(s, 0.016, p);
  assert.ok(p.finalFelled && s.bossFelled);
  resetParishEncounter(s, p);
  assert.ok(s.bossFelled && p.cathedralFelled && p.finalFelled && p.fogCleared);
});

void test("ground lifts release from below after the fog, then recall and travel smoothly", () => {
  for (const id of ["beacon", "arena"] as const) {
    const lift = capitalLifts.find((l) => l.id === id)!,
      p = newParishProgress(),
      states = newCapitalLiftStates();
    assert.equal(states[id].y, lift.high);
    assert.equal(requestCapitalLift(id, lift.high, p, states), false);
    assert.equal(requestCapitalLift(id, lift.low, p, states), false);
    p.fogCleared = true;
    assert.equal(requestCapitalLift(id, lift.high, p, states), false);
    assert.equal(requestCapitalLift(id, lift.low, p, states), true);
    for (let i = 0; i < 2000; i++) stepCapitalLift(states[id], 1 / 60);
    assert.equal(states[id].y, lift.low);
    assert.equal(requestCapitalLift(id, lift.low, p, states), true);
    for (let i = 0; i < 2000; i++) stepCapitalLift(states[id], 1 / 60);
    assert.equal(states[id].y, lift.high);
    assert.equal(requestCapitalLift(id, lift.high, p, states), true);
    assert.equal(states[id].target, lift.low);
  }
});

void test("the town lift needs the passage key and keeps its release after a retry", () => {
  const p = newParishProgress(),
    lifts = newCapitalLiftStates(),
    town = capitalLifts.find((l) => l.id === "town")!;
  assert.equal(lifts.town.y, town.low);
  assert.equal(requestCapitalLift("town", town.low, p, lifts), false);
  p.caches.push("town-key");
  assert.equal(requestCapitalLift("town", town.low, p, lifts), true);
  assert.equal(lifts.town.target, town.high);
  for (let i = 0; i < 300; i++) stepCapitalLift(lifts.town, 1 / 60);
  assert.equal(lifts.town.y, town.high);
  resetParishEncounter(createParishEncounter(p, capitalWorld), p);
  assert.ok(p.townLift);
});

void test("gates bar navigation until opened, and open only from their proper side", () => {
  const across = (g: { position: ParishPoint; yaw: number }, d: number): ParishPoint => [
    g.position[0] + Math.sin(g.yaw) * d,
    g.position[1],
    g.position[2] + Math.cos(g.yaw) * d,
  ];
  const p = newParishProgress();
  // The great gate opens from the stairs outside the walls.
  const street = across(capitalShortcut, -0.9),
    wall = across(capitalShortcut, 1.4);
  assert.ok(near(street, 0.3) && near(wall));
  assert.equal(capitalInteraction(...street, p, false, false)?.available, true);
  assert.equal(capitalInteraction(...wall, p, false, false)?.available, false);
  assert.equal(capitalLineClear(street[0], street[2], wall[0], wall[2], p, 0), false);
  p.refuge = true;
  assert.equal(capitalLineClear(street[0], street[2], wall[0], wall[2], p, 0), true);
  // The cathedral door opens only from the nave.
  const court = across(capitalCathedralShortcut, -2),
    nave = across(capitalCathedralShortcut, 2);
  assert.ok(nave[2] < court[2], "the nave lies north of its door");
  assert.ok(near(court) && near(nave));
  assert.equal(capitalInteraction(...court, p, false, false)?.available, false);
  assert.equal(capitalInteraction(...nave, p, false, false)?.id, "court");
  assert.equal(capitalInteraction(...nave, p, false, false)?.available, true);
  assert.equal(capitalLineClear(court[0], court[2], nave[0], nave[2], p, 48), false);
  p.court = true;
  assert.equal(capitalLineClear(court[0], court[2], nave[0], nave[2], p, 48), true);
  // The tunnel gate and the beacon seal.
  const town = across(capitalTownGate, -2),
    tunnel = across(capitalTownGate, 2);
  const gy = capitalTownGate.position[1];
  assert.equal(capitalLineClear(town[0], town[2], tunnel[0], tunnel[2], p, gy), false);
  assert.equal(capitalInteraction(...town, p, false, false)?.kind, "town-lock");
  p.caches.push("town-key");
  assert.equal(capitalLineClear(town[0], town[2], tunnel[0], tunnel[2], p, gy), true);
  const gallery = across(capitalBeaconSeal, 2),
    path = across(capitalBeaconSeal, -2);
  assert.ok(near(gallery) && near(path));
  assert.equal(capitalLineClear(gallery[0], gallery[2], path[0], path[2], p, 54), false);
  p.fogCleared = true;
  assert.equal(capitalLineClear(gallery[0], gallery[2], path[0], path[2], p, 54), true);
});

void test("boss arenas keep leaps inside and refuse hits from another floor", () => {
  const p = newParishProgress(),
    s = createParishEncounter(p, capitalWorld);
  beginCapitalBoss(s, "cathedral", p);
  const c = s.combat;
  Object.assign(c, { phase: "windup", move: "leap", timer: 3, playerX: 80, playerZ: -150 });
  stepEncounter(c, 0.016);
  assert.ok(Math.hypot(c.leapToX - c.arenaX, c.leapToZ - c.arenaZ) <= c.arenaRadius + 0.001);
  Object.assign(c, {
    playerX: c.bossX,
    playerZ: c.bossZ + 2,
    playerY: 54,
    playerYaw: Math.PI,
    attackTime: 0.4,
    attackId: 1,
    phase: "strike",
    move: "sweep",
    timer: 0,
    bossYaw: 0,
    bossY: 48,
    groundY: 48,
  });
  stepEncounter(c, 0.016);
  assert.equal(c.bossHealth, capitalBosses.cathedral.health);
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
const shared = fixture();
test.after(() => {
  shared.world.free();
  shared.environment.dispose();
});
void test("the five repaired doorway gaps have visible paving at the original failing points", () => {
  shared.environment.root.updateMatrixWorld(true);
  for (const [name, x, y, z] of [
    ["backyard lower door", 35.819, 24, -7.143],
    ["great gate", CAPITAL_SITES.greatGate[0], 0, CAPITAL_SITES.greatGate[2]],
    ["west gallery door", -16.428, 54, -59.481],
    ["colosseum gate", -21.721, -20, -2.98],
    ["colosseum lift door", 1.981, -20, -21.72],
  ] as const) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, y + 0.65, z),
      new THREE.Vector3(0, -1, 0),
      0,
      1.3,
    );
    assert.ok(
      ray.intersectObject(shared.environment.root, true).length > 0,
      `${name}: visible paving is missing`,
    );
  }
});

/** Walk the real player capsule through waypoints, checking arrival, floor and AI clearance. */
function walkRoute(name: string, start: ParishPoint, route: ParishPoint[]) {
  const { world } = shared;
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
  const settle = () => {
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
  };
  try {
    settle();
    for (const [x, y, z] of route) {
      const budget =
        Math.ceil(Math.hypot(x - body.translation().x, z - body.translation().z) / 0.015) + 400;
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
      settle();
      const p = body.translation();
      assert.ok(
        Math.hypot(x - p.x, z - p.z) < 0.25,
        `${name}: blocked toward ${x},${y},${z}; stopped at ${p.x.toFixed(2)},${(p.y - 0.95).toFixed(2)},${p.z.toFixed(2)}`,
      );
      assert.ok(
        Math.abs(p.y - 0.95 - y) < 0.3,
        `${name}: foot ${(p.y - 0.95).toFixed(2)} at ${x},${z}, expected ${y}`,
      );
      assert.equal(capitalBlocked(x, y, z, 0.42), false, `${name}: AI blocking at ${x},${y},${z}`);
    }
  } finally {
    world.removeCollider(collider, false);
    world.removeRigidBody(body);
    world.removeCharacterController(controller);
  }
}
/** Mid-radius waypoints down a kit half-turn, from its high end to its low end. */
function spiralDown(center: ParishPoint, outer: number, base: number, rise: number, half: 0 | 1) {
  const yaw = half ? Math.PI : 0,
    r = (outer + outer * 0.45) / 2;
  return Array.from({ length: 9 }, (_, i): ParishPoint => {
    const a = (Math.PI * i) / 8,
      x = r * Math.cos(a),
      z = -r * Math.sin(a);
    return [
      center[0] + x * Math.cos(yaw) + z * Math.sin(yaw),
      base + rise * (1 - a / Math.PI),
      center[2] - x * Math.sin(yaw) + z * Math.cos(yaw),
    ];
  });
}

/** Waypoints along a tier's street, `d0` to `d1` metres from the prow on one side. */
function street(k: number, side: 1 | -1, d0: number, d1: number) {
  const r = TIER_R[k] - 1.6,
    steps = Math.max(1, Math.ceil(Math.abs(d1 - d0) / 5));
  return Array.from({ length: steps + 1 }, (_, i) =>
    onTier(k, side, d0 + ((d1 - d0) * i) / steps, r),
  );
}
/** Through tier `k`'s prow gate from one side to the other. */
function prowGate(k: number, from: 1 | -1): ParishPoint[] {
  const z = bandMid(k),
    y = TIER_H[k];
  return [
    [from * 8, y, z],
    [-from * 8, y, z],
  ];
}
/** From tier `k`'s street up its stair onto the next tier. */
function climb(k: number): ParishPoint[] {
  const s = TIER_STAIRS[k],
    before: ParishPoint = [s.low[0] - s.dir[0] * 2.5, s.low[1], s.low[2] - s.dir[1] * 2.5];
  return [before, s.low, s.top, s.arrival];
}
const dOf = (k: number, p: ParishPoint) =>
  Math.abs(Math.PI - Math.atan2(p[0], -p[2]) + (p[0] < 0 ? -2 * Math.PI : 0)) * bandMid(k);

void test("the zig-zag climb crosses every prow gate from the great gate to the citadel", () => {
  const route: ParishPoint[] = [...street(0, 1, 18, dOf(0, TIER_STAIRS[0].low) - 4), ...climb(0)];
  for (let k = 1; k < 6; k++) {
    const arrive = TIER_STAIRS[k - 1].side,
      leave = TIER_STAIRS[k].side,
      r = TIER_R[k] - 1.6;
    route.push(onTier(k, arrive, dOf(k, TIER_STAIRS[k - 1].arrival), r));
    route.push(...street(k, arrive, dOf(k, TIER_STAIRS[k - 1].arrival), 9));
    route.push(...prowGate(k, arrive));
    route.push(...street(k, leave, 9, dOf(k, TIER_STAIRS[k].low) - 4));
    route.push(...climb(k));
  }
  route.push([-8, 48, 2], [4, 48, -20]);
  walkRoute("great gate to citadel", capitalShrines[0].spawn, route);
});

void test("lower-city side streets join the forecourt and outer street between blocks", () => {
  for (const side of [1, -1] as const) {
    const inner = 72,
      outer = TIER_R[0] - 1.6;
    const arc = (r: number, from: number, to: number) =>
      Array.from({ length: 15 }, (_, i) => onTier(0, side, from + ((to - from) * i) / 14, r));
    walkRoute(`lower-city ${side}: branching streets`, onTier(0, side, 30, inner), [
      ...arc(inner, 30, 70),
      onTier(0, side, 70, outer),
      ...arc(outer, 70, 105),
      onTier(0, side, 105, inner),
      ...arc(inner, 105, 30),
    ]);
  }
});

void test("the second tier's west house holds the prow gate key", () => {
  const key = capitalCaches.find((c) => c.id === "town-key")!.position;
  const door = onTier(1, -1, 34, TIER_R[2] + 0.4 + Math.min(7, TIER_R[1] - TIER_R[2] - 4.4) + 1);
  walkRoute("town key", onTier(1, -1, 26, TIER_R[1] - 1.6), [
    onTier(1, -1, 34, TIER_R[1] - 1.6),
    door,
    key,
  ]);
});

void test("the citadel court leads to the chapel and its roof, the prow walk and the white tower", () => {
  const [cx, , cz] = CAPITAL_SITES.chapel;
  walkRoute(
    "citadel",
    [0, 48, -20],
    [
      [-2, 48, -12],
      [cx + 8, 48, cz],
      [cx + 3, 48, cz],
      [cx + 8, 48, cz],
      [cx + 9, 48, cz - 6],
      [cx + 10.5, 48, cz - 11],
      [cx + 1, 54, cz - 11],
      [cx - 1.5, 54, cz - 9],
      [cx - 1.5, 54, cz - 4],
      [cx - 1.5, 54, cz - 9],
      [cx + 1, 54, cz - 11],
      [cx + 10.5, 48, cz - 11],
      [8, 48, -6],
      [8, 48, 14],
      [0, 48, 22],
      [0, 48, 49],
    ],
  );
});

void test("the outside path climbs to the galleries and the gallery stair reaches the apse", () => {
  walkRoute(
    "citadel to apse",
    [12, 48, -20],
    [
      [22, 48, -24],
      [22, 48, -46],
      [22, 54, -55],
      [20, 54, -60],
      [16.6, 54, -60],
      [13, 54, -60],
      [13, 54, -67],
      [13, 48, -77],
      [2, 48, -77],
      [0, 48, -81],
      [0, 48, -86],
      [0, 48, -93],
    ],
  );
  walkRoute(
    "nave to court",
    [0, 48, -60],
    [
      [0, 48, -37],
      [0, 48, -34],
      [6, 48, -34],
    ],
  );
});

void test("the royal backyard descends through its stair tower to Up Town", () => {
  const [tx, , tz] = CAPITAL_SITES.stairTower;
  const door = polar((TIER_R[3] + TIER_R[4]) / 2 + 0.5, Math.PI - 1.75);
  walkRoute(
    "backyard below",
    [20, 54, -62],
    [
      [24, 54, -64],
      [37, 54, -64],
      [44, 54, -62],
      [39.5, 54, -55],
      [tx - 5.8, 54, -50],
      [tx - 5.8, 54, tz - 1],
      ...[3, 2, 1, 0].flatMap((i) =>
        spiralDown([tx, 0, tz], 8, 24 + 7.5 * i, 7.5, (i % 2) as 0 | 1).slice(1),
      ),
      [tx - 5.8, 24, tz + 4],
      [tx - 5.8, 24, door[1] - 2.2],
      [door[0], 24, door[1]],
      [door[0] + 0.18 * 2.5, 24, door[1] + 0.98 * 2.5],
      onTier(3, 1, 58, 40),
    ],
  );
});

void test("the beacon pathway spirals to the plain, Grand Street and the colosseum gate", () => {
  const [bx, , bz] = CAPITAL_SITES.beaconTower,
    rise = (54 + 20) / 6;
  walkRoute(
    "beacon descent",
    [-13, 54, -58],
    [
      [-17, 54, -58],
      [-50, 54, -58],
      [-56, 54, -52.5],
      [-63.5, 54, -53],
      [-63.5, 54, bz + 1],
      ...Array.from({ length: 6 }, (_, i) =>
        spiralDown([bx, 0, bz], 9, 54 - rise * (i + 1), rise, (i % 2) as 0 | 1).slice(1),
      ).flat(),
      [-63.5, -20, bz - 6],
      [-74, -20, -76],
      [LOWER_STREET_X, -20, -40],
      [LOWER_STREET_X, -20, 0],
      [LOWER_STREET_X + 8, -20, 0],
      [-40, -20, 0],
      [-22, -20, 0],
      [-10, -20, 0],
      [0, -20, -18],
      [0, -20, -24.5],
    ],
  );
});

void test("the great gate opens from the apron straight into the lowest tier", () => {
  walkRoute(
    "apron to gate",
    [-40, 0, 104],
    [
      // Round the barbican's west tower into its mouth.
      [-14, 0, 127],
      CAPITAL_SITES.greatGateFoot,
      [0, 0, CAPITAL_SITES.greatGate[2] + 2],
      [0, 0, CAPITAL_SITES.greatGate[2] - 2.4],
      [0, 0, bandMid(0)],
      [8, 0, bandMid(0)],
      CAPITAL_SITES.startSpawn,
    ],
  );
});

void test("the town lift pad and the Break Wall are reachable", () => {
  const lift = capitalLifts.find((l) => l.id === "town")!;
  walkRoute("lift pad", onTier(2, 1, 30, TIER_R[2] - 2.5), [lift.upper]);
  walkRoute("lift foot", onTier(1, 1, 40, TIER_R[1] - 1.6), [lift.lower]);
  const breach = Math.PI + 0.7;
  walkRoute("break wall", onTier(0, -1, 50, TIER_R[0] - 1.6), [
    [...polar(TIER_R[0] - 2, breach)].flatMap((v, i) => (i ? [0, v] : [v])) as ParishPoint,
    capitalCaches.find((c) => c.id === "wall")!.position,
  ]);
  walkRoute(
    "street offering",
    [LOWER_STREET_X, -20, -10],
    [capitalCaches.find((c) => c.id === "street")!.position],
  );
});

void test("every open home in the row quarters can be entered from its street", () => {
  assert.ok(CAPITAL_HOMES.length >= 6);
  for (const h of CAPITAL_HOMES) walkRoute(h.id, h.approach[0], [h.approach[1], h.spot]);
});

void test("the capital batches its kit pieces and releases every owned resource exactly once", () => {
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
  assert.ok(capitalSolids.length > 300);
});
