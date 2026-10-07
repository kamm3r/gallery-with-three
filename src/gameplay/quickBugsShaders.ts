import * as THREE from "three";
import { WATER_LEVEL } from "./terrain.ts";

/**
 * Quick_Grass BUGS port (MIT, simondevyoutube/Quick_Grass): moths that fly
 * entirely in the vertex shader. Each bug orbits its home offset on a ~2m
 * loop with noise bobbing, faces its travel direction, folds its wings
 * (x *= |cos(flap)|, y += sin(flap) * |x|), follows the terrain via the
 * baked height texture, and sinks over water. The CPU only advances time and
 * assigns pooled meshes to cells around the camera.
 *
 * Adaptations for this project:
 * - Terrain height comes from our baked height texture (scale 1, offset 0)
 *   instead of Quick_Grass's terrain texture.
 * - The over-water sink uses our water level instead of theirs (-11).
 * - Two dead lines (TIME_PERIOD/repeatingTime, computed but never used)
 *   are dropped. Fog uses the standard chunks (their bugs shader already
 *   did; only the grass shader had custom sky fog).
 * - Flight altitude is low over the meadow (~0.5-0.9m) instead of 2-3m.
 * - The moth sprite is generated on a canvas (no moth.png asset).
 */

// Minimal GLSL helpers from Quick_Grass's common.glsl / noise.glsl: only
// what the BUGS shaders use.
const QUICK_BUGS_GLOBALS = /* glsl */ `
float remap(float v, float inMin, float inMax, float outMin, float outMax) {
  float t = (v - inMin) / (inMax - inMin);
  return mix(outMin, outMax, t);
}

mat3 rotateY(float theta) {
  float c = cos(theta);
  float s = sin(theta);
  return mat3(
      vec3(c, 0, s),
      vec3(0, 1, 0),
      vec3(-s, 0, c));
}

uint murmurHash11(uint src) {
  const uint M = 0x5bd1e995u;
  uint h = 1190494759u;
  src *= M; src ^= src >> 24u; src *= M;
  h *= M; h ^= src;
  h ^= h >> 13u; h *= M; h ^= h >> 15u;
  return h;
}

uvec4 murmurHash42(uvec2 src) {
  const uint M = 0x5bd1e995u;
  uvec4 h = uvec4(1190494759u, 2147483647u, 3559788179u, 179424673u);
  src *= M; src ^= src >> 24u; src *= M;
  h *= M; h ^= src.x; h *= M; h ^= src.y;
  h ^= h >> 13u; h *= M; h ^= h >> 15u;
  return h;
}

float hash11(float src) {
  uint h = murmurHash11(floatBitsToUint(src));
  return uintBitsToFloat(h & 0x007fffffu | 0x3f800000u) - 1.0;
}

vec4 hash42(vec2 src) {
  uvec4 h = murmurHash42(floatBitsToUint(src));
  return uintBitsToFloat(h & 0x007fffffu | 0x3f800000u) - 1.0;
}

float noise11(float p) {
  float i = floor(p);
  float f = fract(p);
  float u = smoothstep(0.0, 1.0, f);
  float val = mix(hash11(i + 0.0), hash11(i + 1.0), u);
  return val * 2.0 - 1.0;
}
`;

const QUICK_BUGS_VSH = /* glsl */ `
#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

varying vec3 vWorldNormal;

uniform vec2 bugsSize;
uniform vec4 bugsParams;
uniform float time;

uniform sampler2D heightmap;
uniform vec3 heightmapParams;

attribute vec3 offset;

void main() {
  #include <uv_vertex>
  #include <color_vertex>
  #include <morphcolor_vertex>

  vec3 objectNormal = vec3(0.0, 1.0, 0.0);
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif

  vec3 transformed = vec3(position);

  vec4 bugHashVal = hash42(offset.xz);

  float BUG_SCALE = mix(0.35, 0.55, bugHashVal.z);
  transformed *= BUG_SCALE;

  const float FLAP_SPEED = 20.0;
  float flapTimeSample = time * FLAP_SPEED + bugHashVal.x * 100.0;
  transformed.y += mix(0.0, sin(flapTimeSample), abs(position.x)) * BUG_SCALE;
  transformed.x *= abs(cos(flapTimeSample));

  float height = noise11(time * 3.0 + bugHashVal.x * 100.0);

  // Loop
  float loopTime = time * 0.5 + bugHashVal.x * 123.23;
  float loopSize = 2.0;
  vec3 bugsOffset = vec3(sin(loopTime) * loopSize, height * 0.125, cos(loopTime) * loopSize) + offset;

  // Forward
  transformed = rotateY(-loopTime + PI / 2.0) * transformed;
  transformed += bugsOffset;

  // Center
  vec3 bugCenter = offset;

  vec3 bugsWorldPos = (modelMatrix * vec4(bugCenter, 1.0)).xyz;
  vec2 heightmapUV = vec2(
      remap(bugsWorldPos.x, -heightmapParams.z * 0.5, heightmapParams.z * 0.5, 0.0, 1.0),
      remap(bugsWorldPos.z, -heightmapParams.z * 0.5, heightmapParams.z * 0.5, 1.0, 0.0));
  float terrainHeight = texture2D(heightmap, heightmapUV).x * heightmapParams.x - heightmapParams.y;
  transformed.y += terrainHeight;

  if (terrainHeight < ${WATER_LEVEL + 0.25}) {
    transformed.y -= 1000.0;
  }

  objectNormal = normal;

  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <normal_vertex>

  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <displacementmap_vertex>

  vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;

  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  vViewPosition = -mvPosition.xyz;
  #include <worldpos_vertex>
  #include <envmap_vertex>
  #include <shadowmap_vertex>
  #include <fog_vertex>

  vWorldNormal = (modelMatrix * vec4(normal.xyz, 0.0)).xyz;
}
`;

const QUICK_BUGS_FSH = /* glsl */ `
#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

varying vec3 vWorldNormal;

void main() {
  #include <clipping_planes_fragment>
  vec4 diffuseColor = vec4(diffuse, opacity);

  ReflectedLight reflectedLight = ReflectedLight(vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
  vec3 totalEmissiveRadiance = emissive;
  #include <logdepthbuf_fragment>
  #include <map_fragment>
  #include <color_fragment>
  #include <alphamap_fragment>
  #include <alphatest_fragment>
  #include <alphahash_fragment>
  #include <specularmap_fragment>
  #include <normal_fragment_begin>
  #include <normal_fragment_maps>
  #include <emissivemap_fragment>
  #include <lights_phong_fragment>
  #include <lights_fragment_begin>
  #include <lights_fragment_maps>
  #include <lights_fragment_end>
  #include <aomap_fragment>
  vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;

  #include <envmap_fragment>
  #include <opaque_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <premultiplied_alpha_fragment>
  #include <dithering_fragment>
}
`;

const BUGS_COUNT = 8;
export const BUGS_SPAWN_RANGE = 40;
export const BUGS_MAX_DIST = 100;

/**
 * Shared bug layout like Quick_Grass: one instanced quad (PlaneGeometry,
 * laid flat) plus a per-bug home offset. Flight, flap, and terrain following
 * all happen in the shader from the offset hash.
 */
export function createBugsGeometry(seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const offsets = new Float32Array(BUGS_COUNT * 3);
  for (let i = 0; i < BUGS_COUNT; i++) {
    offsets[i * 3] = (random() * 2 - 1) * (BUGS_SPAWN_RANGE / 2);
    // Low drift over the meadow instead of Quick_Grass's 2-3m altitude.
    offsets[i * 3 + 1] = 0.5 + random() * 0.4;
    offsets[i * 3 + 2] = (random() * 2 - 1) * (BUGS_SPAWN_RANGE / 2);
  }

  const plane = new THREE.PlaneGeometry(1, 1, 2, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.instanceCount = BUGS_COUNT;
  geometry.setAttribute("position", plane.attributes.position);
  geometry.setAttribute("uv", plane.attributes.uv);
  geometry.setAttribute("normal", plane.attributes.normal);
  geometry.setAttribute("offset", new THREE.InstancedBufferAttribute(offsets, 3));
  const index = plane.getIndex();
  if (index) geometry.setIndex(index);
  geometry.rotateX(-Math.PI / 2);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), BUGS_SPAWN_RANGE);
  plane.dispose();
  return geometry;
}

/** Pale moth sprite (replaces Quick_Grass's moth.png) on transparency. */
export function createMothTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#f7f3e8";
  // Wings as two soft ellipses; the body bar down the middle.
  ctx.beginPath();
  ctx.ellipse(size * 0.32, size * 0.5, size * 0.2, size * 0.32, 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.68, size * 0.5, size * 0.2, size * 0.32, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#d9d0b4";
  ctx.fillRect(size * 0.47, size * 0.22, size * 0.06, size * 0.56);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface QuickBugsUniforms {
  time: { value: number };
}

export function createBugsMaterial(
  moth: THREE.Texture,
  heightmap: THREE.Texture,
  heightmapWorld: number,
) {
  const uniforms: QuickBugsUniforms = { time: { value: 0 } };
  const material = new THREE.MeshPhongMaterial({
    map: moth,
    emissive: new THREE.Color("#fff4d6"),
    emissiveIntensity: 0.35,
    emissiveMap: moth,
    shininess: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      time: uniforms.time,
      bugsSize: { value: new THREE.Vector2(0.5, 1.25) },
      bugsParams: { value: new THREE.Vector4(2, 6, 0, 0) },
      heightmap: { value: heightmap },
      heightmapParams: { value: new THREE.Vector3(1, 0, heightmapWorld) },
    });
    shader.vertexShader = QUICK_BUGS_GLOBALS + QUICK_BUGS_VSH;
    shader.fragmentShader = QUICK_BUGS_GLOBALS + QUICK_BUGS_FSH;
  };
  material.customProgramCacheKey = () => "quick-bugs-v1";
  return { material, uniforms };
}
