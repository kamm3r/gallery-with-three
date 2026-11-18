import { Color, Vector3 } from "three";

/**
 * Shared sun state. DayNightSky writes it once per frame; foliage, grass and
 * the post atmosphere read the same uniform objects, so every translucency
 * glow and light shaft agrees with the actual shadow-casting light.
 */
export const sunlight = {
  direction: { value: new Vector3(0.55, 0.42, 0.72).normalize() },
  color: { value: new Color("#ffd8a1") },
  daylight: { value: 1 },
  fogColor: { value: new Color("#c3c79c") },
};
