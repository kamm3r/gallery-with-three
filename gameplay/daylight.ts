export const DAY_LENGTH = 1200;

export function daylightAt(seconds: number) {
  const angle = (seconds / DAY_LENGTH + 0.12) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const daylight = Math.max(0, Math.min(1, (elevation + 0.12) / 0.55));
  return { angle, elevation, daylight, sunset: (1 - Math.min(1, Math.abs(elevation) * 3)) * daylight };
}
