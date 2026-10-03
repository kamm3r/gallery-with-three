import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import * as THREE from "three";
import { sunlight } from "../gameplay/sunlight";

// Exponential height fog with sun in-scattering, plus volumetric light shafts
// raymarched through the sun's shadow map: canopy gaps become god rays in
// the haze, exactly where the real shadows say light gets through.
const fragmentShader = /* glsl */ `
uniform mat4 uProjectionInverse;
uniform mat4 uCameraWorld;
uniform vec3 uCameraPosition;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform float uDensity;
uniform float uFalloff;
uniform float uFogStart;
uniform float uSkyFog;
uniform float uScatter;
uniform float uShafts;
uniform float uShaftDensity;
uniform float uShaftDistance;
uniform float uHasShadow;
uniform mat4 uShadowMatrix;
uniform sampler2DShadow uShadowMap;

float gradientNoise(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float sunVisibility(vec3 p) {
  vec4 coord = uShadowMatrix * vec4(p, 1.0);
  vec3 s = coord.xyz / coord.w;
  // Outside the shadow frustum: assume an average, half-lit canopy.
  if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 0.5;
  return texture(uShadowMap, s);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  bool sky = depth >= 0.99999;
  vec4 view = uProjectionInverse * vec4(uv * 2.0 - 1.0, (sky ? 0.5 : depth) * 2.0 - 1.0, 1.0);
  vec3 world = (uCameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
  vec3 ray = world - uCameraPosition;
  float dist = sky ? 420.0 : length(ray);
  vec3 dir = normalize(ray);

  // Analytic integral of density * exp(-falloff * height) along the ray.
  float march = max(dist - uFogStart, 0.0);
  float rise = dir.y * uFalloff * march;
  float heightTerm = abs(rise) > 1e-4 ? (1.0 - exp(-rise)) / rise : 1.0;
  float optical = uDensity * exp(-uFalloff * max(uCameraPosition.y, 0.0)) * march * heightTerm;
  float fog = 1.0 - exp(-optical);
  if (sky) fog *= uSkyFog;

  float cosTheta = dot(dir, uSunDirection);
  // Henyey-Greenstein forward scattering, normalised to 1 facing the sun.
  float g = 0.62;
  float phase = pow((1.0 - g) * (1.0 - g) / (1.0 + g * g - 2.0 * g * cosTheta), 1.5);

  // March the sun's shadow map along the view ray: 'light' is the sunlight
  // scattered toward the eye, 'lit' the average visibility, which also dims
  // the warm sun glow in the haze wherever the canopy blocks it.
  float light = 0.0;
  float lit = 1.0;
  if (uShafts > 0.0 && uHasShadow > 0.5) {
    const int STEPS = 28;
    float span = min(dist, uShaftDistance);
    float stepLength = span / float(STEPS);
    float jitter = gradientNoise(gl_FragCoord.xy);
    float weight = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float t = (float(i) + jitter) * stepLength;
      float w = exp(-t * uShaftDensity) * uShaftDensity * stepLength;
      light += sunVisibility(uCameraPosition + dir * t) * w;
      weight += w;
    }
    lit = light / max(weight, 1e-5);
  }
  vec3 haze = uFogColor + uSunColor * pow(max(cosTheta, 0.0), 6.0) * uScatter * mix(1.0, lit, 0.75);
  vec3 color = mix(inputColor.rgb, haze, fog);
  color += uSunColor * light * uShafts * (0.03 + phase * 0.6);
  outputColor = vec4(color, inputColor.a);
}
`;

export interface AtmosphereSettings {
  density: number;
  falloff: number;
  fogStart: number;
  skyFog: number;
  scatter: number;
  shafts: number;
  shaftDensity: number;
  shaftDistance: number;
}

export const FOREST_ATMOSPHERE: AtmosphereSettings = {
  density: 0.012,
  falloff: 0.05,
  fogStart: 8,
  skyFog: 0.75,
  scatter: 0.25,
  shafts: 0.8,
  shaftDensity: 0.02,
  shaftDistance: 46,
};

// Bound until the sun's shadow map exists: a shadow sampler must always see
// a compare-mode depth texture, or the whole draw is rejected.
function placeholderShadowMap() {
  const texture = new THREE.DepthTexture(1, 1);
  texture.compareFunction = THREE.LessEqualCompare;
  texture.needsUpdate = true;
  return texture;
}

export class AtmosphereEffect extends Effect {
  private light: THREE.DirectionalLight | null = null;
  private readonly placeholder = placeholderShadowMap();
  private readonly lightDirection = new THREE.Vector3();
  private readonly lightTarget = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.Camera,
    private readonly scene: THREE.Scene,
  ) {
    super("AtmosphereEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ["uProjectionInverse", new THREE.Uniform(new THREE.Matrix4())],
        ["uCameraWorld", new THREE.Uniform(new THREE.Matrix4())],
        ["uCameraPosition", new THREE.Uniform(new THREE.Vector3())],
        ["uSunDirection", new THREE.Uniform(new THREE.Vector3(0, 1, 0))],
        ["uSunColor", new THREE.Uniform(new THREE.Color())],
        ["uFogColor", new THREE.Uniform(new THREE.Color())],
        ["uDensity", new THREE.Uniform(0)],
        ["uFalloff", new THREE.Uniform(0)],
        ["uFogStart", new THREE.Uniform(0)],
        ["uSkyFog", new THREE.Uniform(0)],
        ["uScatter", new THREE.Uniform(0)],
        ["uShafts", new THREE.Uniform(0)],
        ["uShaftDensity", new THREE.Uniform(0)],
        ["uShaftDistance", new THREE.Uniform(0)],
        ["uHasShadow", new THREE.Uniform(0)],
        ["uShadowMatrix", new THREE.Uniform(new THREE.Matrix4())],
        ["uShadowMap", new THREE.Uniform<THREE.Texture | null>(null)],
      ]),
    });
  }

  override dispose() {
    this.placeholder.dispose();
    super.dispose();
  }

  configure(settings: AtmosphereSettings) {
    const u = this.uniforms;
    u.get("uDensity")!.value = settings.density;
    u.get("uFalloff")!.value = settings.falloff;
    u.get("uFogStart")!.value = settings.fogStart;
    u.get("uSkyFog")!.value = settings.skyFog;
    u.get("uScatter")!.value = settings.scatter;
    u.get("uShafts")!.value = settings.shafts;
    u.get("uShaftDensity")!.value = settings.shaftDensity;
    u.get("uShaftDistance")!.value = settings.shaftDistance;
  }

  private findLight() {
    if (this.light?.parent) return this.light;
    this.light = null;
    this.scene.traverse((object) => {
      if (!this.light && object instanceof THREE.DirectionalLight && object.castShadow)
        this.light = object;
    });
    return this.light;
  }

  override update() {
    const u = this.uniforms;
    const camera = this.camera;
    u.get("uProjectionInverse")!.value.copy(camera.projectionMatrixInverse);
    u.get("uCameraWorld")!.value.copy(camera.matrixWorld);
    u.get("uCameraPosition")!.value.setFromMatrixPosition(camera.matrixWorld);
    u.get("uFogColor")!.value.copy(sunlight.fogColor.value);
    const light = this.findLight();
    const shadowMap = light?.shadow.map?.depthTexture ?? null;
    u.get("uHasShadow")!.value = shadowMap ? 1 : 0;
    u.get("uShadowMap")!.value = shadowMap ?? this.placeholder;
    if (!light) {
      u.get("uSunDirection")!.value.copy(sunlight.direction.value);
      u.get("uSunColor")!.value.copy(sunlight.color.value);
      return;
    }
    // Follow the real caster (the moon at night) so shafts match shadows.
    this.lightDirection
      .setFromMatrixPosition(light.matrixWorld)
      .sub(light.target.getWorldPosition(this.lightTarget))
      .normalize();
    u.get("uSunDirection")!.value.copy(this.lightDirection);
    u.get("uSunColor")!.value.copy(light.color).multiplyScalar(light.intensity);
    u.get("uShadowMatrix")!.value.copy(light.shadow.matrix);
  }
}
