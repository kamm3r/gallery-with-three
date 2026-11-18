/**
 * The PS2 presentation: a low line count upscaled with hard pixel edges (field-rendered
 * PS2 games drew 224 lines a field; 360 keeps the look on modern displays while text
 * and the HUD stay readable), a 15-bit colour depth with 4×4 ordered dithering, a
 * muted grade, aliased edges and small shadow maps.
 */
export const PS2_LINES = 360;
/** Colour saturation of the PS2 grade (1 leaves the level's own grade untouched). */
export const PS2_SATURATION = 0.82;
/** Shadow crush: blacks fall faster, like the hardware's 0-235 output on a TV. */
export const PS2_GAMMA = 1.12;
/** Bits per colour channel in the dithered output (the PS2's common 16-bit framebuffer). */
export const PS2_COLOR_BITS = 5;
/** Shadow maps never exceed this size in PS2 style. */
export const PS2_SHADOW_SIZE = 512;

/** Device pixel ratio that renders `cssHeight` CSS pixels with PS2_LINES rows. */
export function ps2PixelRatio(cssHeight: number) {
  if (!Number.isFinite(cssHeight) || cssHeight <= 0) return 1;
  return Math.min(1, Math.max(0.1, PS2_LINES / cssHeight));
}

/** Shadow map size after the PS2 cap (0 keeps shadows off). */
export function ps2ShadowSize(size: number, enabled: boolean) {
  return enabled && size > 0 ? Math.min(size, PS2_SHADOW_SIZE) : size;
}

/** The 4×4 Bayer threshold for a pixel, in [0, 1). */
export function bayer4(x: number, y: number) {
  const m = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  return m[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)] / 16;
}

/** One gamma-space channel quantised the way the shader does it. */
export function ditherChannel(value: number, x: number, y: number, bits = PS2_COLOR_BITS) {
  const levels = (1 << bits) - 1;
  const v = Math.min(1, Math.max(0, value));
  return Math.min(levels, Math.floor(v * levels + bayer4(x, y))) / levels;
}
