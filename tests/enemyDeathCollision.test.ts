import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

await RAPIER.init();
// Execute the actual collision preamble, before rendering/pose work, using
// real Rapier bodies and the same character sweep as CharacterController.
function collisionFrame(file: string, stop: string) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let statements = "";
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "useFrame") {
      const callback = node.arguments[0];
      if (callback && ts.isArrowFunction(callback) && ts.isBlock(callback.body)) {
        const list = callback.body.statements;
        const end = list.findIndex((statement) => statement.getText(source).includes(stop));
        if (end >= 0)
          statements = list
            .slice(0, end)
            .map((statement) => statement.getText(source))
            .join("\n");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(statements, `${file} frame preamble missing`);
  return (bindings: Record<string, unknown>) => {
    // oxlint-disable-next-line typescript/no-implied-eval
    new Function(...Object.keys(bindings), statements)(...Object.values(bindings));
  };
}
const bossFrame = collisionFrame("AshWarden.tsx", "s.phase !== r.lastPhase");
const enemyFrame = collisionFrame("ParishEnemies.tsx", "const distance");
// Use the controller's real query predicate against a stale broad-phase entry.
const controllerSource = ts.createSourceFile(
  "CharacterController.tsx",
  readFileSync(new URL("../src/components/CharacterController.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let filterExpression = "";
function findFilter(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(controllerSource) === "notRidden")
    filterExpression = node.initializer!.getText(controllerSource);
  ts.forEachChild(node, findFilter);
}
findFilter(controllerSource);
assert.ok(filterExpression);
const filterCode = ts.transpileModule(`const filter = ${filterExpression};`, {
  compilerOptions: { target: ts.ScriptTarget.ESNext },
}).outputText;
// oxlint-disable-next-line typescript/no-implied-eval
const obstacleFilter = new Function("ridden", `${filterCode}; return filter;`)(() => false) as (
  collider: RAPIER.Collider,
) => boolean;
function fixture() {
  const world = new RAPIER.World({ x: 0, y: -30, z: 0 });
  const enemy = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  world.createCollider(RAPIER.ColliderDesc.cylinder(1.8, 1.05).setTranslation(0, 1.8, 0), enemy);
  const player = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1, 1.4),
  );
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.65, 0.3), player);
  const kcc = world.createCharacterController(0.01);
  const sweep = (step = true, filter?: (collider: RAPIER.Collider) => boolean) => {
    if (step) world.step();
    kcc.computeColliderMovement(
      collider,
      { x: 0, y: 0, z: -3 },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      filter,
    );
    return kcc.computedMovement().z;
  };
  assert.ok(sweep() > -0.1, "living enemy must block passage");
  return { world, enemy, sweep };
}
void test("a defeated Warden immediately releases a player touching its collider", () => {
  const { world, enemy, sweep } = fixture();
  try {
    bossFrame({
      combat: { current: { bossHealth: 0, phase: "defeated", bossX: 0, bossZ: 0, move: "slam" } },
      runtime: { current: { resetVersion: 0 } },
      resetVersion: 0,
      root: { current: { visible: true } },
      simulate: false,
      state: { camera: { position: { x: 0, z: 0 } }, clock: { elapsedTime: 0 } },
      delta: 1 / 60,
      body: { current: enemy },
      moveSpec: () => ({}),
    });
    assert.ok(sweep() < -2.8, "dead Warden collider must not trap the player");
    assert.equal(enemy.isEnabled(), false);
    const bindings = {
      combat: { current: { bossHealth: 300, bossX: 0, bossZ: 0, move: "slam" } },
      runtime: { current: { resetVersion: 0 } },
      resetVersion: 0,
      root: { current: { visible: true } },
      simulate: false,
      state: { camera: { position: { x: 0, z: 0 } }, clock: { elapsedTime: 0 } },
      delta: 1 / 60,
      body: { current: enemy },
      moveSpec: () => ({}),
    };
    bossFrame(bindings);
    assert.ok(sweep() > -0.1, "resetting the boss must restore collision");
  } finally {
    world.free();
  }
});
void test("ordinary enemy death releases its collision, and shrine respawn restores it", () => {
  const { world, enemy, sweep } = fixture();
  try {
    const e = { health: 0 },
      enabled = { current: true };
    const bindings = {
      state: { current: { enemies: [e] } },
      index: 0,
      enabled,
      observedEnemy: { current: e },
      body: { current: enemy },
    };
    enemyFrame(bindings);
    assert.ok(sweep() < -2.8);
    e.health = 120;
    enemyFrame(bindings);
    assert.ok(sweep() > -0.1);
  } finally {
    world.free();
  }
});

void test("character sweeps ignore a corpse before the physics broad phase refreshes", () => {
  const { world, enemy, sweep } = fixture();
  try {
    enemy.userData = { nonBlocking: true };
    enemy.setEnabled(false);
    assert.ok(sweep(false) > -0.1, "reproduce Rapier's stale disabled collider");
    assert.ok(sweep(false, obstacleFilter) < -2.8, "controller must reject the stale corpse");
  } finally {
    world.free();
  }
});

void test("respawn moves a retained enemy collider home before distant animation culling", () => {
  const { world, enemy, sweep } = fixture();
  try {
    const previous = { health: 0 },
      fresh = { health: 120, x: 100, y: 0, z: 100, yaw: Math.PI },
      observedEnemy = { current: previous as typeof previous | typeof fresh },
      visualTime = { current: 0.1 },
      rig = { root: { position: { y: -4 } } };
    enemy.setEnabled(false);
    enemyFrame({
      state: { current: { enemies: [fresh] } },
      index: 0,
      enabled: { current: false },
      observedEnemy,
      visualTime,
      rig,
      rotation: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      body: { current: enemy },
    });
    assert.equal(observedEnemy.current, fresh);
    assert.equal(visualTime.current, 0);
    assert.equal(rig.root.position.y, 0);
    assert.equal(enemy.isEnabled(), true);
    assert.deepEqual({ ...enemy.translation() }, { x: 100, y: 0, z: 100 });
    assert.ok(sweep() < -2.8, "the old death location must be clear after respawn");
  } finally {
    world.free();
  }
});
