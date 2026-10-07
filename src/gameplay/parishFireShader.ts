/** Noise-driven fire informed by https://greentec.github.io/shadertoy-fire-shader-en/ . */
// The field cannot remain visible above y = 1.7, even at maximum turbulence.
export const PARISH_FLAME_DOMAIN_HEIGHT = 1.8;
export const PARISH_FLAME_STEPS = 16;

export const parishFlameVertex = /* glsl */ `
varying vec3 vFlamePosition;
varying vec3 vRayOrigin;
varying float vSeed;
#include <fog_pars_vertex>
void main() {
  mat4 flameMatrix = modelMatrix * instanceMatrix;
  vec3 center = flameMatrix[3].xyz;
  vec3 scale = vec3(length(flameMatrix[0].xyz), length(flameMatrix[1].xyz), length(flameMatrix[2].xyz));
  mat3 toLocal = transpose(mat3(flameMatrix[0].xyz / scale.x, flameMatrix[1].xyz / scale.y, flameMatrix[2].xyz / scale.z));
  vFlamePosition = position;
  vRayOrigin = (toLocal * (cameraPosition - center)) / scale;
  // Orthographic previews need parallel rays rather than rays converging on the camera.
  if (projectionMatrix[3][3] > 0.5) {
    vec3 cameraBack = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vRayOrigin = position + (toLocal * cameraBack) / scale * length(cameraPosition - center);
  }
  vSeed = dot(center.xz, vec2(0.137, 0.319));
  vec4 mvPosition = viewMatrix * flameMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export const parishFlameFragment = /* glsl */ `
uniform float parishTime;
uniform float parishMotion;
uniform float cold;
varying vec3 vFlamePosition;
varying vec3 vRayOrigin;
varying float vSeed;
#include <fog_pars_fragment>

float fireHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
float fireNoise(vec3 p) {
  vec3 cell = floor(p), f = fract(p);
  vec3 s = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(fireHash(cell), fireHash(cell + vec3(1,0,0)), s.x),
        mix(fireHash(cell + vec3(0,1,0)), fireHash(cell + vec3(1,1,0)), s.x), s.y),
    mix(mix(fireHash(cell + vec3(0,0,1)), fireHash(cell + vec3(1,0,1)), s.x),
        mix(fireHash(cell + vec3(0,1,1)), fireHash(cell + vec3(1,1,1)), s.x), s.y), s.z);
}
float fireFbm(vec3 p) {
  return fireNoise(p) * 0.67 + fireNoise(p * 2.03 + vec3(3.1,1.7,4.3)) * 0.33;
}

// This field lives in the brazier, so different views see the same moving tongues.
vec2 fireField(vec3 p, float t) {
  float y = (p.y + 0.5) * ${PARISH_FLAME_DOMAIN_HEIGHT.toFixed(1)};
  vec3 seed = vec3(vSeed * 2.7, vSeed * 0.83, vSeed * 1.31);
  vec2 sway = vec2(sin(y * 3.4 - t * 1.8 + vSeed), cos(y * 2.8 - t * 1.5 + vSeed)) * 0.045 * y;
  float radius = length(p.xz - sway);
  float fuel = 1.0 - y - pow(radius * 2.15, 1.3);
  // Skip the empty exterior before evaluating the more expensive noise.
  float distortion = 0.55 + min(y, 1.0) * 0.85;
  if (fuel + distortion * 0.5 < 0.035) return vec2(0.0);
  float turbulence = fireFbm(vec3(p.x * 8.0, y * 2.4 - t * 2.7, p.z * 8.0) + seed);
  float density = max(fuel + (turbulence - 0.5) * distortion - 0.035, 0.0);
  // Erode the thin fringe before integration so it reads as flame instead of a red haze.
  density *= smoothstep(0.0, 0.035, y) * smoothstep(0.02, 0.13, density);
  float heat = clamp(density * 1.1 + (turbulence - 0.5) * 0.2, 0.0, 1.0);
  float core = (1.0 - smoothstep(0.09, 0.22, radius)) * (1.0 - smoothstep(0.12, 0.65, y));
  heat = max(heat, core * 0.97);
  return vec2(density, heat);
}

vec3 fireColor(float heat) {
  // Only the hot centre reaches bloom levels; the translucent fringe stays saturated.
  vec3 warm = mix(vec3(0.85, 0.04, 0.001), vec3(1.4, 0.22, 0.005), smoothstep(0.02, 0.4, heat));
  warm = mix(warm, vec3(2.2, 0.65, 0.025), smoothstep(0.45, 0.85, heat));
  warm = mix(warm, vec3(2.8, 1.3, 0.12), smoothstep(0.92, 1.0, heat));
  vec3 blue = mix(vec3(0.015, 0.055, 0.45), vec3(0.025, 0.4, 1.8), smoothstep(0.0, 0.7, heat));
  blue = mix(blue, vec3(0.65, 1.6, 3.1), smoothstep(0.65, 1.0, heat));
  return mix(warm, blue, cold);
}

void main() {
  // Use the near shell for normal depth testing against the bowl and stonework.
  // An inside camera uses the exit shell, without rendering the volume twice.
  bool inside = all(lessThanEqual(abs(vRayOrigin), vec3(0.5)));
  if (gl_FrontFacing == inside) discard;
  vec3 ray = normalize(vFlamePosition - vRayOrigin);
  // Protect slab intersections when the view aligns exactly with a box axis.
  vec3 safeRay = mix(vec3(0.00001), ray, step(vec3(0.00001), abs(ray)));
  vec3 a = (vec3(-0.5) - vRayOrigin) / safeRay;
  vec3 b = (vec3(0.5) - vRayOrigin) / safeRay;
  vec3 nearSlab = min(a, b), farSlab = max(a, b);
  float nearDistance = max(max(nearSlab.x, nearSlab.y), max(nearSlab.z, 0.0));
  float farDistance = min(min(farSlab.x, farSlab.y), farSlab.z);
  if (farDistance <= nearDistance) discard;
  float stepLength = (farDistance - nearDistance) / float(${PARISH_FLAME_STEPS});
  float t = parishTime * parishMotion;
  vec4 flame = vec4(0.0);
  for (int i = 0; i < ${PARISH_FLAME_STEPS}; i++) {
    vec3 p = vRayOrigin + ray * (nearDistance + (float(i) + 0.5) * stepLength);
    vec2 field = fireField(p, t);
    float opacity = 1.0 - exp(-field.x * stepLength * 16.0);
    float contribution = (1.0 - flame.a) * opacity;
    flame.rgb += contribution * fireColor(field.y);
    flame.a += contribution;
    if (flame.a > 0.98) break;
  }
  if (flame.a < 0.06) discard;
  gl_FragColor = vec4(flame.rgb / flame.a, flame.a);
  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
