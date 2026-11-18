/** Feet and body origin stay fixed. The supplied engine owns shapes and queries. */
export function setCapsuleStance<Shape extends { halfHeight: number }>(
  standingHeight: number,
  height: number,
  radius: number,
  currentShape: Shape,
  engine: {
    capsule: (halfHeight: number, radius: number) => Shape;
    blocked: (shape: Shape, offset: number) => boolean;
    apply: (shape: Shape, offset: number) => void;
  },
) {
  const halfHeight = height / 2 - radius;
  const offset = (height - standingHeight) / 2;
  if (Math.abs(currentShape.halfHeight - halfHeight) < 0.0001) return true;
  const shape = engine.capsule(halfHeight, radius);
  if (engine.blocked(shape, offset)) return false;
  engine.apply(shape, offset);
  return true;
}
