import {
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
  type Camera,
} from "three";

export type AxisView = "x" | "-x" | "y" | "-y" | "z" | "-z";
export type SceneViewCamera = PerspectiveCamera | OrthographicCamera;
export const axisViews: AxisView[] = ["x", "-x", "y", "-y", "z", "-z"];
export function axisVector(axis: AxisView) {
  const sign = axis.startsWith("-") ? -1 : 1;
  return new Vector3(
    axis.endsWith("x") ? sign : 0,
    axis.endsWith("y") ? sign : 0,
    axis.endsWith("z") ? sign : 0,
  );
}
export function orientationAxes(rotation: Quaternion) {
  const inverse = rotation.clone().invert();
  return axisViews
    .map((axis) => {
      const point = axisVector(axis).applyQuaternion(inverse);
      return { axis, x: 50 + point.x * 31, y: 50 - point.y * 31, depth: point.z };
    })
    .sort((a, b) => a.depth - b.depth);
}
export function switchProjection(
  camera: SceneViewCamera,
  pivot: Vector3,
  aspect: number,
): SceneViewCamera {
  const direction = camera.getWorldDirection(new Vector3());
  let next: SceneViewCamera;
  if (camera instanceof PerspectiveCamera) {
    const halfHeight =
      Math.max(0.1, camera.position.distanceTo(pivot)) *
      Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2);
    next = new OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      camera.near,
      camera.far,
    );
  } else {
    next = new PerspectiveCamera(60, aspect, camera.near, camera.far);
    const halfHeight = (camera.top - camera.bottom) / (2 * camera.zoom);
    next.position
      .copy(pivot)
      .addScaledVector(direction, -halfHeight / Math.tan(MathUtils.degToRad(30)));
  }
  if (camera instanceof PerspectiveCamera) next.position.copy(camera.position);
  next.quaternion.copy(camera.quaternion);
  next.up.copy(camera.up);
  (next as Camera & { manual?: boolean }).manual = true;
  next.updateProjectionMatrix();
  next.updateMatrixWorld(true);
  return next;
}
export function frameView(camera: SceneViewCamera, pivot: Vector3, radius: number, aspect: number) {
  radius = Math.max(0.25, radius);
  const direction = camera.getWorldDirection(new Vector3());
  if (camera instanceof OrthographicCamera) {
    const halfHeight = radius * 1.15 * Math.max(1, 1 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.zoom = 1;
    camera.position.copy(pivot).addScaledVector(direction, -Math.max(radius * 2, 10));
  } else {
    const vertical = MathUtils.degToRad(camera.getEffectiveFOV());
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
    camera.position
      .copy(pivot)
      .addScaledVector(direction, (-radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.15);
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
export function previewRect(width: number, height: number, aspect = 16 / 9) {
  const w = Math.min(240, Math.max(0, width - 32), Math.max(0, (height - 72) * aspect));
  const h = w / aspect;
  return { x: width - w - 16, y: 16, width: w, height: h };
}
