import * as THREE from "three";

/**
 * Camera occlusion dithering, as in Mario Odyssey and Sekiro. A screen-door
 * dissolve, like distanceFade, so meshes stay opaque: no sorting, and depth and
 * AO stay intact. Shadow passes use their own depth materials, so shadows remain.
 *
 * - Anything between the lens and the player, within a cone that frames the
 *   player on screen, dissolves (Odyssey's circle around Mario).
 * - Geometry brushing the lens dissolves (Sekiro's near fade).
 * - With the camera pushed in tight, the player's own body thins out.
 *
 * The camera still collides with the world; this covers what it lets through
 * (enemies, the Warden, collider-less dressing) and what it presses against.
 */

/** Radius (m) of the cleared cone where it reaches the player. */
export const OCCLUSION_RADIUS = 1.7;
/** The cone stops this far (m) in front of the player's chest, sparing the player. */
export const OCCLUSION_STOP = 0.7;
/** Geometry nearer the lens than this (m) is gone; it is solid again from NEAR_FADE[1]. */
export const NEAR_FADE = [0.25, 0.9] as const;
/** The player thins out as the camera closes from SELF_FADE[1] to SELF_FADE[0] metres. */
export const SELF_FADE = [0.7, 1.6] as const;
/** The player never vanishes entirely: a ghost stays to steer by. */
export const SELF_FADE_MAX = 0.8;
/** Radius (m) of the column around the player that the self fade covers. */
const SELF_RADIUS = 0.55;
/** Floors at the player's feet never dissolve, however low the camera. */
const FLOOR_CLEARANCE = 0.15;

export const occlusionUniforms = {
  uOcclusionEnabled: { value: 0 },
  /** The player's chest, world space. */
  uOcclusionTarget: { value: new THREE.Vector3() },
  uOcclusionFeet: { value: 0 },
  uOcclusionRadius: { value: OCCLUSION_RADIUS },
  /** 0..SELF_FADE_MAX: how far the player's own body has dissolved. */
  uOcclusionSelf: { value: 0 },
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** How far the player's own body dissolves with the lens this far (m) from the chest. */
export function selfFade(cameraDistance: number) {
  return SELF_FADE_MAX * (1 - smoothstep(SELF_FADE[0], SELF_FADE[1], cameraDistance));
}

type V3 = { x: number; y: number; z: number };

/**
 * How much of a surface point stays (1 solid, 0 gone). Mirrors the shader, for tests
 * and tuning; the dither discards a pixel when its noise is at or above this.
 */
export function occlusionKeep(
  point: V3,
  camera: V3,
  target: V3,
  feet: number,
  self = 0,
  radius = OCCLUSION_RADIUS,
) {
  const near = Math.hypot(point.x - camera.x, point.y - camera.y, point.z - camera.z);
  let keep = smoothstep(NEAR_FADE[0], NEAR_FADE[1], near);
  if (point.y < feet + FLOOR_CLEARANCE) return keep;
  const ax = target.x - camera.x,
    ay = target.y - camera.y,
    az = target.z - camera.z,
    length = Math.max(1e-4, Math.hypot(ax, ay, az));
  const t =
    ((point.x - camera.x) * ax + (point.y - camera.y) * ay + (point.z - camera.z) * az) /
    (length * length);
  const stop = 1 - OCCLUSION_STOP / Math.max(length, OCCLUSION_STOP);
  if (t > 0 && t < stop) {
    const r = Math.hypot(
      point.x - camera.x - ax * t,
      point.y - camera.y - ay * t,
      point.z - camera.z - az * t,
    );
    const cone = radius * t;
    const fade = (1 - smoothstep(cone * 0.55, cone, r)) * (1 - smoothstep(stop - 0.08, stop, t));
    keep = Math.min(keep, 1 - fade);
  }
  if (
    self > 0 &&
    Math.hypot(point.x - target.x, point.z - target.z) < SELF_RADIUS &&
    point.y < feet + 2.1
  )
    keep = Math.min(keep, 1 - self);
  return keep;
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vOcclusionWorld;`;

const VERTEX_BODY = /* glsl */ `
vec4 occlusionWorld = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  occlusionWorld = batchingMatrix * occlusionWorld;
#endif
#ifdef USE_INSTANCING
  occlusionWorld = instanceMatrix * occlusionWorld;
#endif
vOcclusionWorld = ( modelMatrix * occlusionWorld ).xyz;`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec3 vOcclusionWorld;
uniform float uOcclusionEnabled;
uniform vec3 uOcclusionTarget;
uniform float uOcclusionFeet;
uniform float uOcclusionRadius;
uniform float uOcclusionSelf;
float occlusionKeep() {
  vec3 p = vOcclusionWorld;
  float keep = smoothstep( ${NEAR_FADE[0].toFixed(3)}, ${NEAR_FADE[1].toFixed(3)}, distance( p, cameraPosition ) );
  if ( p.y < uOcclusionFeet + ${FLOOR_CLEARANCE.toFixed(3)} ) return keep;
  vec3 axis = uOcclusionTarget - cameraPosition;
  float len = max( length( axis ), 1e-4 );
  float t = dot( p - cameraPosition, axis ) / ( len * len );
  float stop = 1.0 - ${OCCLUSION_STOP.toFixed(3)} / max( len, ${OCCLUSION_STOP.toFixed(3)} );
  if ( t > 0.0 && t < stop ) {
    float r = length( p - cameraPosition - axis * t );
    float cone = uOcclusionRadius * t;
    float fade = ( 1.0 - smoothstep( cone * 0.55, cone, r ) ) * ( 1.0 - smoothstep( stop - 0.08, stop, t ) );
    keep = min( keep, 1.0 - fade );
  }
  if ( uOcclusionSelf > 0.0 && distance( p.xz, uOcclusionTarget.xz ) < ${SELF_RADIUS.toFixed(3)} && p.y < uOcclusionFeet + 2.1 )
    keep = min( keep, 1.0 - uOcclusionSelf );
  return keep;
}`;

// Interleaved gradient noise: an even, stable screen-door pattern.
const FRAGMENT_BODY = /* glsl */ `
if ( uOcclusionEnabled > 0.5 ) {
  float occlusion = occlusionKeep();
  if ( occlusion < 0.999 && occlusion <= fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;
}`;

const ANCHORS = {
  common: "#include <common>",
  project: "#include <project_vertex>",
  clip: "#include <clipping_planes_fragment>",
};

/** Adds the dither to a built-in material's shader; leaves anything else untouched. */
export function injectOcclusionDither(shader: {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}) {
  const { vertexShader: vertex, fragmentShader: fragment } = shader;
  if (
    vertex.includes("vOcclusionWorld") ||
    !vertex.includes(ANCHORS.common) ||
    !vertex.includes(ANCHORS.project) ||
    !fragment.includes(ANCHORS.common) ||
    !fragment.includes(ANCHORS.clip)
  )
    return false;
  shader.vertexShader = vertex
    .replace(ANCHORS.common, ANCHORS.common + VERTEX_HEAD)
    .replace(ANCHORS.project, ANCHORS.project + VERTEX_BODY);
  shader.fragmentShader = fragment
    .replace(ANCHORS.common, ANCHORS.common + FRAGMENT_HEAD)
    .replace(ANCHORS.clip, ANCHORS.clip + FRAGMENT_BODY);
  Object.assign(shader.uniforms, occlusionUniforms);
  return true;
}

const CACHE_KEY = "|occlusion-dither-v1";
const patched = new WeakMap<
  THREE.Material,
  { compile: THREE.Material["onBeforeCompile"]; key: () => string }
>();

/**
 * Chains the dither onto a material's own shader patch (fog, wind) and program key.
 * Re-wraps when a world swaps its patch in later. Returns whether it changed anything.
 */
export function ensureOcclusionDither(material: THREE.Material) {
  if ((material as THREE.ShaderMaterial).isShaderMaterial || !material.depthTest) return false;
  const entry = patched.get(material);
  if (
    entry &&
    material.onBeforeCompile === entry.compile &&
    material.customProgramCacheKey === entry.key
  )
    return false;
  // Both are re-invoked below with the material as `this`.
  // oxlint-disable-next-line typescript/unbound-method
  const previousCompile = material.onBeforeCompile;
  // oxlint-disable-next-line typescript/unbound-method
  const previousKey = material.customProgramCacheKey;
  // The default key is the patch's source text, which is now always our wrapper's.
  const defaultKey = previousKey === THREE.Material.prototype.customProgramCacheKey;
  const compile: THREE.Material["onBeforeCompile"] = function (this: THREE.Material, ...args) {
    previousCompile.apply(this, args);
    injectOcclusionDither(args[0]);
  };
  const key = function (this: THREE.Material) {
    return (defaultKey ? previousCompile.toString() : previousKey.call(this)) + CACHE_KEY;
  };
  material.onBeforeCompile = compile;
  material.customProgramCacheKey = key;
  patched.set(material, { compile, key });
  material.needsUpdate = true;
  return true;
}

/** Patches every mesh material under `root`; cheap to repeat for late arrivals. */
export function ditherOccluders(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh || object.userData.noOcclusionDither) return;
    const { material } = object as THREE.Mesh;
    for (const m of Array.isArray(material) ? material : [material]) ensureOcclusionDither(m);
  });
}
