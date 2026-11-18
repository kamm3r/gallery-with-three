import { Euler, Quaternion, Vector3, type Object3D } from "three";
import type { SceneTransform } from "../gameplay/sceneDocument.ts";
export function inspectTransform(object: Object3D, space: "local" | "world"): SceneTransform {
  object.updateWorldMatrix(true, false);
  if (space === "local")
    return {
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray(),
    };
  const position = new Vector3(),
    quaternion = new Quaternion(),
    scale = new Vector3();
  object.matrixWorld.decompose(position, quaternion, scale);
  const rotation = new Euler().setFromQuaternion(quaternion, object.rotation.order);
  return {
    position: position.toArray(),
    rotation: [rotation.x, rotation.y, rotation.z],
    scale: scale.toArray(),
  };
}
export function editInspectedTransform(
  object: Object3D,
  space: "local" | "world",
  field: keyof SceneTransform,
  axis: 0 | 1 | 2,
  value: number,
) {
  const transform = inspectTransform(object, space);
  transform[field][axis] = value;
  if (field === "position") {
    const position = new Vector3().fromArray(transform.position);
    if (space === "world" && object.parent) object.parent.worldToLocal(position);
    object.position.copy(position);
  } else if (field === "rotation") {
    const rotation = new Quaternion().setFromEuler(
      new Euler(...transform.rotation, object.rotation.order),
    );
    if (space === "world" && object.parent)
      rotation.premultiply(object.parent.getWorldQuaternion(new Quaternion()).invert());
    object.quaternion.copy(rotation);
  } else if (space === "local") object.scale.fromArray(transform.scale);
  else {
    const current = inspectTransform(object, "world").scale[axis];
    if (Math.abs(current) > 1e-9)
      object.scale.setComponent(axis, (object.scale.getComponent(axis) * value) / current);
  }
  object.updateMatrix();
  object.updateMatrixWorld(true);
}
