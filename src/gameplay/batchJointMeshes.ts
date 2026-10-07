import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Merge only rigid parts attached to the same joint; articulation stays intact. */
export function batchJointMeshes(root: THREE.Group) {
  const groups: THREE.Group[] = [];
  const replaced = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof THREE.Group) groups.push(object);
  });
  for (const joint of groups) {
    const buckets = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of joint.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.children.length)
        continue;
      const bucket = buckets.get(child.material) ?? [];
      bucket.push(child);
      buckets.set(child.material, bucket);
    }
    for (const [material, meshes] of buckets) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((mesh) => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return geometry.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      if (!geometry) continue;
      const merged = new THREE.Mesh(geometry, material);
      merged.castShadow = meshes.some((mesh) => mesh.castShadow);
      merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
      geometry.computeBoundingSphere();
      for (const mesh of meshes) {
        joint.remove(mesh);
        replaced.add(mesh.geometry);
      }
      joint.add(merged);
    }
  }
  // A geometry could also be referenced by an unmerged part; retain those.
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) replaced.delete(object.geometry);
  });
  replaced.forEach((geometry) => geometry.dispose());
}
