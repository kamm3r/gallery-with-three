import { BlendFunction, Effect } from "postprocessing";
import * as THREE from "three";

// Painterly grade after tone mapping, in a perceptual (gamma) space: an
// S-curve, milky lifted shadows, split toning (cool moss shadows, warm
// sunlit highlights) and vibrance that boosts dull colours first.
const fragmentShader = /* glsl */ `
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplit;
uniform float uContrast;
uniform float uLift;
uniform float uSaturation;
uniform float uVibrance;
uniform float uExposure;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = pow(clamp(inputColor.rgb * uExposure, 0.0, 1.0), vec3(1.0 / 2.2));
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  float luma = dot(c, LUMA);
  vec3 shadowTint = uShadowTint - dot(uShadowTint, LUMA);
  vec3 highlightTint = uHighlightTint - dot(uHighlightTint, LUMA);
  c += (shadowTint * (1.0 - luma) * (1.0 - luma) + highlightTint * luma * luma) * uSplit;
  c = uLift * uShadowTint + c * (1.0 - uLift);
  luma = dot(c, LUMA);
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(luma), c, uSaturation + uVibrance * (1.0 - chroma));
  outputColor = vec4(pow(max(c, 0.0), vec3(2.2)), inputColor.a);
}
`;

export interface GradeSettings {
  shadowTint: string;
  highlightTint: string;
  split: number;
  contrast: number;
  lift: number;
  saturation: number;
  vibrance: number;
  exposure: number;
}

export class GradeEffect extends Effect {
  constructor() {
    super("GradeEffect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ["uShadowTint", new THREE.Uniform(new THREE.Color())],
        ["uHighlightTint", new THREE.Uniform(new THREE.Color())],
        ["uSplit", new THREE.Uniform(0)],
        ["uContrast", new THREE.Uniform(0)],
        ["uLift", new THREE.Uniform(0)],
        ["uSaturation", new THREE.Uniform(1)],
        ["uVibrance", new THREE.Uniform(0)],
        ["uExposure", new THREE.Uniform(1)],
      ]),
    });
  }

  configure(settings: GradeSettings) {
    const u = this.uniforms;
    // Tints are authored as display colours; keep them in gamma space.
    u.get("uShadowTint")!.value.set(settings.shadowTint).convertLinearToSRGB();
    u.get("uHighlightTint")!.value.set(settings.highlightTint).convertLinearToSRGB();
    u.get("uSplit")!.value = settings.split;
    u.get("uContrast")!.value = settings.contrast;
    u.get("uLift")!.value = settings.lift;
    u.get("uSaturation")!.value = settings.saturation;
    u.get("uVibrance")!.value = settings.vibrance;
    u.get("uExposure")!.value = settings.exposure;
  }
}
