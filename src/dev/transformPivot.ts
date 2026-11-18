import { Box3, Matrix4, type Object3D } from "three";

export type PivotMode = "center" | "pivot";
export type PivotDrag = {
  objectWorld: Matrix4;
  inverseHandleWorld: Matrix4;
  inverseParentWorld: Matrix4;
};

/** Editor handle only: changing its location never rewrites the authored origin. */
export function positionTransformHandle(object: Object3D, handle: Object3D, mode: PivotMode) {
  object.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(object);
  if (mode === "center" && !bounds.isEmpty()) bounds.getCenter(handle.position);
  else object.getWorldPosition(handle.position);
  object.getWorldQuaternion(handle.quaternion);
  handle.scale.set(1, 1, 1);
  handle.updateMatrixWorld(true);
}

export function beginPivotDrag(object: Object3D, handle: Object3D): PivotDrag {
  object.updateWorldMatrix(true, false);
  handle.updateWorldMatrix(true, false);
  return {
    objectWorld: object.matrixWorld.clone(),
    inverseHandleWorld: handle.matrixWorld.clone().invert(),
    inverseParentWorld: object.parent ? object.parent.matrixWorld.clone().invert() : new Matrix4(),
  };
}

/** Apply the handle delta in world space, then restore the node's parent space. */
export function applyPivotDrag(object: Object3D, handle: Object3D, start: PivotDrag) {
  handle.updateWorldMatrix(true, false);
  const local = start.inverseParentWorld
    .clone()
    .multiply(handle.matrixWorld)
    .multiply(start.inverseHandleWorld)
    .multiply(start.objectWorld);
  local.decompose(object.position, object.quaternion, object.scale);
  object.updateMatrix();
  object.updateMatrixWorld(true);
}
