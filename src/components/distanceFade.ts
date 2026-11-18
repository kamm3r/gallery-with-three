/**
 * Screen-door dissolve for instanced props near their cull distance. Each
 * instance fades by its root's distance to the camera, so it has fully
 * dissolved by the time the CPU culls it (the ECS culls on bounding-sphere
 * distance, which is never larger than the root's distance). Dithering keeps
 * the meshes opaque: no sorting, and depth/AO stay intact.
 */
export const distanceFadeVertex = /* glsl */ `
  uniform float uFadeFar;
  uniform float uFadeBand;
  varying float vDistanceFade;
  float distanceFade(vec3 root) {
    float d = distance(cameraPosition, root);
    return 1.0 - smoothstep(uFadeFar - uFadeBand, uFadeFar, d);
  }
`;

export const distanceFadeFragment = /* glsl */ `
  varying float vDistanceFade;
  float distanceFadeNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }
`;

/** Place at the top of main() in the fragment shader. */
export const distanceFadeDiscard = /* glsl */ `
  if (vDistanceFade < 0.999 && vDistanceFade <= distanceFadeNoise(gl_FragCoord.xy)) discard;
`;

export function distanceFadeUniforms(far: number, band = far * 0.2) {
  return { uFadeFar: { value: far }, uFadeBand: { value: band } };
}
