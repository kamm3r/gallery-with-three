import { BlendFunction, Effect } from "postprocessing";
import * as THREE from "three";
import { PS2_COLOR_BITS, PS2_GAMMA, PS2_SATURATION } from "../gameplay/ps2Style";

// Last in the chain: a muted, slightly crushed grade, then reduce the image to a 15-bit
// framebuffer with a 4×4 ordered dither in display (gamma) space, as the PS2 GS did.
// The quantisation matches ditherChannel() in gameplay/ps2Style.ts.
const fragmentShader = /* glsl */ `
uniform float uLevels;
uniform float uStrength;
uniform float uSaturation;
uniform float uGamma;

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.y * 4 + q.x;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[i]) / 16.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = pow(clamp(inputColor.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSaturation);
  c = pow(c, vec3(uGamma));
  float t = bayer4(floor(gl_FragCoord.xy));
  vec3 q = min(vec3(uLevels), floor(c * uLevels + t)) / uLevels;
  c = mix(c, q, uStrength);
  outputColor = vec4(pow(c, vec3(2.2)), inputColor.a);
}
`;

export class Ps2Effect extends Effect {
  constructor() {
    super("Ps2Effect", fragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ["uLevels", new THREE.Uniform((1 << PS2_COLOR_BITS) - 1)],
        ["uStrength", new THREE.Uniform(1)],
        ["uSaturation", new THREE.Uniform(PS2_SATURATION)],
        ["uGamma", new THREE.Uniform(PS2_GAMMA)],
      ]),
    });
  }

  configure(strength: number) {
    this.uniforms.get("uStrength")!.value = strength;
  }
}
