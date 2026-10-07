import assert from "node:assert/strict";
import test from "node:test";
import { createTreeBlueprint, type TreeKind } from "../src/gameplay/proceduralTrees.ts";

const kinds: TreeKind[] = ["broad", "spreading", "evergreen", "young"];

void test("tree seeds reproduce a specimen and change its silhouette", () => {
  for (const kind of kinds) {
    const first = createTreeBlueprint(kind, 1248);
    assert.deepEqual(first, createTreeBlueprint(kind, 1248));
    assert.notDeepEqual(first.foliage, createTreeBlueprint(kind, 1249).foliage);
  }
});

void test("each crown has foliage in every direction and valid geometry inputs", () => {
  for (const kind of kinds) {
    const tree = createTreeBlueprint(kind, 1248);
    const quadrants = new Set(
      tree.foliage
        .slice(1)
        .map(({ center: [x, , z] }) => `${x >= 0 ? "+" : "-"}${z >= 0 ? "+" : "-"}`),
    );
    assert.equal(quadrants.size, 4, `${kind} should have a complete crown`);
    for (const lobe of tree.foliage) {
      assert.ok(lobe.center.every(Number.isFinite));
      assert.ok(lobe.radius.every((radius) => radius > 0 && Number.isFinite(radius)));
    }
    for (const segment of tree.wood) {
      assert.ok(segment.from.every(Number.isFinite));
      assert.ok(segment.to.every(Number.isFinite));
      assert.ok(segment.baseRadius > segment.tipRadius && segment.tipRadius > 0);
    }
  }
});

void test("deciduous crowns get their outline from branch clusters", () => {
  for (const kind of ["broad", "spreading", "young"] as const) {
    const { foliage } = createTreeBlueprint(kind, 1248);
    const outerReach = Math.max(
      ...foliage.slice(1).map(({ center, radius }) => Math.abs(center[0]) + radius[0]),
    );
    assert.ok(foliage[0].radius[0] < outerReach * 0.55, `${kind} core hides its clusters`);
  }
});

void test("live shape settings change the crown while keeping generation repeatable", () => {
  const base = createTreeBlueprint("broad", 9067);
  const options = { spread: 1.3, height: 1.2, clusterSize: 0.8, density: 1.5 };
  const edited = createTreeBlueprint("broad", 9067, "day", options);
  assert.deepEqual(edited, createTreeBlueprint("broad", 9067, "day", options));
  assert.ok(edited.foliage.length > base.foliage.length);
  assert.ok(edited.wood[0].to[1] > base.wood[0].to[1]);
  assert.ok(Math.abs(edited.foliage[1].center[0]) > Math.abs(base.foliage[1].center[0]));
  assert.ok(edited.foliage[0].radius[0] < base.foliage[0].radius[0] * options.spread);
  assert.deepEqual(edited.wood[3].to, edited.foliage[1].center);
  assert.deepEqual(
    createTreeBlueprint("broad", 9067, "halloween", options).foliage,
    edited.foliage,
  );
});

void test("Halloween uses the same seeded crown with additional exposed branches", () => {
  for (const kind of kinds) {
    const day = createTreeBlueprint(kind, 5227);
    const halloween = createTreeBlueprint(kind, 5227, "halloween");
    assert.deepEqual(halloween.foliage, day.foliage);
    assert.deepEqual(halloween.wood.slice(0, day.wood.length), day.wood);
    assert.ok(halloween.wood.length > day.wood.length);
  }
});
