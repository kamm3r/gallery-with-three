/** Local geometry shared by the moving lift's meshes and its explicit colliders.
 * The body origin is 0.3 m below the landing. Both Z ends remain open for boarding.
 */
export const capitalLiftGeometry = [
  { size: [6, 0.6, 6], position: [0, 0, 0] },
  { size: [0.15, 3, 5.8], position: [-2.85, 1.5, 0] },
  { size: [0.15, 3, 5.8], position: [2.85, 1.5, 0] },
] satisfies Array<{ size: [number, number, number]; position: [number, number, number] }>;
