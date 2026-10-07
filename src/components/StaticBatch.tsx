import type { ThreeElements } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

function batchable(object: THREE.Object3D): object is THREE.Mesh {
  if (!(object instanceof THREE.Mesh) || !object.visible) return false;
  if (object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh) return false;
  if (Array.isArray(object.material) || object.morphTargetInfluences) return false;
  // Pointer handlers need the original object in the scene to raycast.
  const instance = (object as { __r3f?: { eventCount?: number } }).__r3f;
  return !instance?.eventCount;
}

/** Reverses triangle winding after a mirroring transform. */
function flipWinding(geometry: THREE.BufferGeometry) {
  const index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
}

/**
 * Merges the static meshes below it into one draw per material and shadow
 * setup, once, after mount. Thousands of boxes that never move cost the
 * renderer per-object work in every pass; a batch costs it once.
 *
 * Only for content whose transforms, visibility and material assignment stay
 * fixed after mount. Mark anything animated with `userData={{ dynamic: true }}`
 * and its whole subtree is left alone. Material properties (colour flicker and
 * the like) may still change: batches share the original material objects.
 */
export function StaticBatch({ children, ...props }: ThreeElements["group"]) {
  const root = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const group = root.current!;
    group.updateMatrixWorld(true);
    const toLocal = group.matrixWorld.clone().invert();
    const buckets = new Map<string, { meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
    const transform = new THREE.Matrix4();
    const visit = (object: THREE.Object3D) => {
      if (object.userData.dynamic) return;
      if (batchable(object)) {
        const geometry = object.geometry.clone();
        geometry.applyMatrix4(transform.multiplyMatrices(toLocal, object.matrixWorld));
        if (transform.determinant() < 0) {
          if (!geometry.index)
            geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
          flipWinding(geometry);
        }
        // mergeGeometries needs matching attribute sets and indexing.
        const layout = Object.keys(geometry.attributes).sort().join();
        const key = `${(object.material as THREE.Material).uuid}|${object.castShadow}|${object.receiveShadow}|${object.renderOrder}|${layout}|${!!geometry.index}`;
        const bucket = buckets.get(key) ?? { meshes: [], geometries: [] };
        bucket.meshes.push(object);
        bucket.geometries.push(geometry);
        buckets.set(key, bucket);
      }
      for (const child of object.children) visit(child);
    };
    for (const child of group.children) visit(child);

    const batches: THREE.Mesh[] = [];
    const sources: Array<{ mesh: THREE.Mesh; parent: THREE.Object3D }> = [];
    for (const { meshes, geometries } of buckets.values()) {
      // A lone mesh gains nothing from batching.
      const geometry = geometries.length > 1 ? mergeGeometries(geometries) : null;
      geometries.forEach((part) => part.dispose());
      if (!geometry) continue;
      const sample = meshes[0];
      for (const mesh of meshes) sources.push({ mesh, parent: mesh.parent! });
      const batch = new THREE.Mesh(geometry, sample.material);
      batch.name = "static-batch";
      batch.castShadow = sample.castShadow;
      batch.receiveShadow = sample.receiveShadow;
      batch.renderOrder = sample.renderOrder;
      batches.push(batch);
    }
    // Detach rather than hide, so the per-frame matrix walk skips them too.
    for (const { mesh } of sources) mesh.removeFromParent();
    group.add(...batches);
    return () => {
      for (const batch of batches) {
        batch.removeFromParent();
        batch.geometry.dispose();
      }
      for (const { mesh, parent } of sources) if (!mesh.parent) parent.add(mesh);
    };
  }, []);
  return (
    <group ref={root} {...props}>
      {children}
    </group>
  );
}
