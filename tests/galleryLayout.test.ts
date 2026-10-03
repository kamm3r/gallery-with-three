import assert from "node:assert/strict";
import test from "node:test";
import {
  GALLERY_BOUNDS,
  GALLERY_SEQUENCE,
  GALLERY_SIGILS,
  advanceGallerySequence,
  archiveMaze,
  galleryRooms,
  mirrorMaze,
  reachableRooms,
  roomBounds,
  sealedDoors,
  wallCores,
} from "../src/gameplay/galleryLayout.ts";

test("every room can be reached from the entrance hall", () => {
  assert.equal(reachableRooms().size, galleryRooms.length);
});

test("secret rooms and the vault stay hidden behind illusions and seals", () => {
  const plain = reachableRooms((door) => !door.kind || door.kind === "open");
  for (const room of galleryRooms) {
    const hidden = room.secret || room.id === "vault" || room.id === "vaultHall";
    assert.equal(plain.has(room.id), !hidden, room.id);
  }
});

test("illusory walls render but never collide", () => {
  assert.ok(wallCores.some((core) => !core.collide));
  assert.deepEqual(sealedDoors.map((door) => door.key).sort(), ["conservatory", "vault"]);
});

test("the mazes hide their sigils deep and leave dead ends for secrets", () => {
  for (const maze of [archiveMaze, mirrorMaze]) {
    assert.ok(maze.distance >= 12, `${maze.room} is only ${maze.distance} steps deep`);
    assert.ok(maze.deadEnds.length >= 2);
    const [minX, maxX, minZ, maxZ] = roomBounds(maze.room);
    for (const [x, z] of [maze.deepest, ...maze.deadEnds]) {
      assert.ok(x > minX && x < maxX && z > minZ && z < maxZ);
    }
  }
});

test("the player clamp covers the whole building", () => {
  for (const room of galleryRooms) {
    const [minX, maxX, minZ, maxZ] = roomBounds(room.id);
    assert.ok(Math.max(-minX, maxX) < GALLERY_BOUNDS[0], room.id);
    assert.ok(Math.max(-minZ, maxZ) < GALLERY_BOUNDS[1], room.id);
  }
});

test("the journey needs every sigil and uses each of them", () => {
  assert.deepEqual(new Set(GALLERY_SEQUENCE), new Set(GALLERY_SIGILS));
  assert.equal(advanceGallerySequence(0, "star", ["star", "sun"]), 0);
});

test("the keeper's journey opens the vault in order", () => {
  let progress = 0;
  for (const step of GALLERY_SEQUENCE)
    progress = advanceGallerySequence(progress, step, GALLERY_SIGILS);
  assert.equal(progress, GALLERY_SEQUENCE.length);
  assert.equal(advanceGallerySequence(progress, "moon", GALLERY_SIGILS), progress);
});

test("a wrong step restarts the journey", () => {
  assert.equal(advanceGallerySequence(3, "moon", GALLERY_SIGILS), 0);
  assert.equal(advanceGallerySequence(4, GALLERY_SEQUENCE[0], GALLERY_SIGILS), 1);
});
