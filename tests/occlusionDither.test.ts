import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  OCCLUSION_RADIUS,
  SELF_FADE,
  SELF_FADE_MAX,
  ensureOcclusionDither,
  injectOcclusionDither,
  occlusionKeep,
  selfFade,
} from "../src/gameplay/occlusionDither.ts";

// Camera 7m behind and above a player whose chest is at (0, 1.1, 0), feet at 0.
const camera = { x: 0, y: 3, z: 7 };
const chest = { x: 0, y: 1.1, z: 0 };
const along = (t: number) => ({
  x: camera.x + (chest.x - camera.x) * t,
  y: camera.y + (chest.y - camera.y) * t,
  z: camera.z + (chest.z - camera.z) * t,
});

void test("whatever sits on the sight line dissolves; the player and the scene beyond do not", () => {
  assert.equal(occlusionKeep(along(0.5), camera, chest, 0), 0);
  assert.equal(occlusionKeep(along(0.8), camera, chest, 0), 0);
  // The player's own body, and a wall behind them, stay solid.
  assert.equal(occlusionKeep({ x: 0, y: 1.1, z: 0.3 }, camera, chest, 0), 1);
  assert.equal(occlusionKeep({ x: 0, y: 1.5, z: -2 }, camera, chest, 0), 1);
});

void test("the cleared area is a circle around the player on screen, not a slab", () => {
  const mid = along(0.6);
  // Off to the side beyond the cone's radius at that depth: solid.
  assert.equal(occlusionKeep({ ...mid, x: OCCLUSION_RADIUS * 0.6 + 0.05 }, camera, chest, 0), 1);
  // Its rim dithers partway.
  const rim = occlusionKeep({ ...mid, x: OCCLUSION_RADIUS * 0.6 * 0.8 }, camera, chest, 0);
  assert.ok(rim > 0 && rim < 1, `rim keeps ${rim}`);
});

void test("the floor at the player's feet never dissolves, however low the camera", () => {
  const low = { x: 0, y: 0.6, z: 5 };
  assert.equal(occlusionKeep({ x: 0, y: 0.05, z: 2 }, low, chest, 0), 1);
});

void test("geometry against the lens dissolves, like Sekiro's near fade", () => {
  // Outside the cone: gone 0.15m from the lens, solid 2m from it.
  assert.equal(occlusionKeep({ x: 0.15, y: 3, z: 7 }, camera, chest, 0), 0);
  assert.equal(occlusionKeep({ x: 2, y: 3, z: 7 }, camera, chest, 0), 1);
});

void test("the player ghosts out as the camera presses in, but never vanishes", () => {
  assert.equal(selfFade(SELF_FADE[1] + 0.1), 0);
  assert.equal(selfFade(0), SELF_FADE_MAX);
  assert.ok(SELF_FADE_MAX < 1);
  const close = { x: 0, y: 1.3, z: 0.9 };
  const keep = occlusionKeep({ x: 0.1, y: 1.6, z: -0.1 }, close, chest, 0, selfFade(0.9));
  assert.ok(keep < 1 && keep > 0, `player keeps ${keep}`);
});

function physicalShader() {
  const { vertexShader, fragmentShader, uniforms } = THREE.ShaderLib.physical;
  return { vertexShader, fragmentShader, uniforms: { ...uniforms } };
}

void test("injection patches built-in shaders once and leaves custom ones alone", () => {
  const shader = physicalShader();
  assert.equal(injectOcclusionDither(shader), true);
  assert.match(shader.vertexShader, /vOcclusionWorld = \( modelMatrix \* occlusionWorld \)/);
  assert.match(shader.fragmentShader, /occlusionKeep\(\)/);
  assert.ok("uOcclusionTarget" in shader.uniforms);
  assert.equal(injectOcclusionDither(shader), false);
  const custom = { vertexShader: "void main(){}", fragmentShader: "void main(){}", uniforms: {} };
  assert.equal(injectOcclusionDither(custom), false);
  assert.equal(custom.fragmentShader, "void main(){}");
});

void test("materials keep their own patches (fog, wind) and distinct programs", () => {
  const fogged = new THREE.MeshStandardMaterial();
  fogged.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <fog_fragment>",
      "#include <fog_fragment>\n// height fog",
    );
  };
  fogged.customProgramCacheKey = () => "fog";
  const plain = new THREE.MeshStandardMaterial();
  const version = fogged.version;
  assert.equal(ensureOcclusionDither(fogged), true);
  assert.equal(ensureOcclusionDither(plain), true);
  assert.equal(ensureOcclusionDither(fogged), false, "already patched");
  assert.ok(fogged.version > version, "recompiles");
  const shader = physicalShader();
  fogged.onBeforeCompile(shader as never, null as never);
  assert.match(shader.fragmentShader, /height fog/);
  assert.match(shader.fragmentShader, /occlusionKeep/);
  assert.notEqual(fogged.customProgramCacheKey(), plain.customProgramCacheKey());
  assert.match(fogged.customProgramCacheKey(), /^fog\|occlusion/);
  // A world swapping its patch in later gets wrapped again.
  fogged.onBeforeCompile = () => {};
  assert.equal(ensureOcclusionDither(fogged), true);
  // Shader materials and overlays drawn through everything are skipped.
  assert.equal(ensureOcclusionDither(new THREE.ShaderMaterial()), false);
  assert.equal(ensureOcclusionDither(new THREE.MeshBasicMaterial({ depthTest: false })), false);
});
