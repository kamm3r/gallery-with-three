import { createQuery, type World } from "koota";
import { Frustum, Matrix4, Sphere, type Camera, type InstancedMesh } from "three";
import { InstanceBatch, PlayerPosition, VisibilityStats } from "./traits.ts";

const batches = createQuery(InstanceBatch);
const frustum = new Frustum();
const projection = new Matrix4();
const sphere = new Sphere();

/** 0 = culled, 1 = detailed, 2 = proxy. Hysteresis prevents LOD flicker. */
export function selectDetail(
  distance: number,
  near: number,
  far: number,
  previous: number,
  visible: boolean,
) {
  if (!visible || distance > far + (previous ? 3 : 0)) return 0;
  return distance < near + (previous === 1 ? 3 : -3) ? 1 : 2;
}

function upload(mesh: InstancedMesh, source: Float32Array, offset: number, index: number) {
  const target = mesh.instanceMatrix.array;
  for (let n = 0; n < 16; n++) target[index * 16 + n] = source[offset + n];
}

export function updateVisibility(world: World, camera: Camera) {
  camera.updateMatrixWorld();
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projection);
  const player = world.get(PlayerPosition)!;
  let detailed = 0,
    simplified = 0,
    culled = 0;
  world.query(batches).readEach(([batch]) => {
    let nearCount = 0,
      farCount = 0;
    let changed = false;
    for (let i = 0; i < batch.points.length; i++) {
      const p = batch.points[i];
      sphere.center.set(p.x, p.y + batch.centerY * p.scale, p.z);
      sphere.radius = batch.radius * p.scale;
      const distance = Math.max(0, sphere.center.distanceTo(camera.position) - sphere.radius);
      // Keep nearby off-camera casters so turning away does not erase shadows.
      const shadowCaster =
        batch.shadows && player.valid && Math.hypot(p.x - player.x, p.z - player.z) < 44;
      const level = selectDetail(
        distance,
        batch.near,
        batch.far,
        batch.levels[i],
        shadowCaster || frustum.intersectsSphere(sphere),
      );
      if (batch.levels[i] !== level) changed = true;
      batch.levels[i] = level;
      if (level === 0 || (level === 2 && batch.proxy.length === 0)) {
        culled++;
        continue;
      }
      if (level === 1) nearCount++;
      else farCount++;
    }
    // Static transforms only need uploading when membership changes.
    if (changed) {
      let nearIndex = 0,
        farIndex = 0;
      for (let i = 0; i < batch.points.length; i++) {
        if (batch.levels[i] === 1) {
          for (const mesh of batch.detail) upload(mesh, batch.matrices, i * 16, nearIndex);
          nearIndex++;
        } else if (batch.levels[i] === 2) {
          for (const mesh of batch.proxy) upload(mesh, batch.matrices, i * 16, farIndex);
          farIndex++;
        }
      }
    }
    detailed += nearCount;
    simplified += farCount;
    for (const mesh of batch.detail) {
      mesh.count = nearCount;
      mesh.visible = nearCount > 0;
      if (nearCount && changed) mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of batch.proxy) {
      mesh.count = farCount;
      mesh.visible = farCount > 0;
      if (farCount && changed) mesh.instanceMatrix.needsUpdate = true;
    }
  });
  world.set(VisibilityStats, { detailed, simplified, culled });
}
