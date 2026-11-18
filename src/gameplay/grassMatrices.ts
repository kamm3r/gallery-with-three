import { createGrassPatch } from "./grass.ts";

/** Column-major, uniformly scaled Y rotations, ready for instanced rendering. */
export function grassMatrices(x: number, z: number, density: number) {
  const blades = createGrassPatch(x, z, density);
  const matrices = new Float32Array(blades.length * 16);
  blades.forEach((blade, i) => {
    const offset = i * 16;
    const c = Math.cos(blade.angle) * blade.height;
    const s = Math.sin(blade.angle) * blade.height;
    matrices.set(
      [c, 0, -s, 0, 0, blade.height, 0, 0, s, 0, c, 0, blade.x, blade.y, blade.z, 1],
      offset,
    );
  });
  return matrices;
}
