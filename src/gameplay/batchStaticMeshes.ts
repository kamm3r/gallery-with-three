import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Batch immutable scenery by material and spatial cell, retaining frustum culling. */
export function batchStaticMeshes(root: THREE.Group, cellSize = 32, recursive = true) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, THREE.Mesh[]>();
  const materialIds = new WeakMap<THREE.Material, number>();
  const signatures = new Map<string, number>();
  // Material descriptions can encode texture images. Compute them once per
  // material, and use a compact id in each spatial key instead of copying images.
  const materialId = (source: THREE.Material) => {
    const cached = materialIds.get(source);
    if (cached !== undefined) return cached;
    const { uuid: _uuid, metadata: _metadata, ...description } = source.toJSON();
    const signature = JSON.stringify(description);
    let id = signatures.get(signature);
    if (id === undefined) {
      id = signatures.size;
      signatures.set(signature, id);
    }
    materialIds.set(source, id);
    return id;
  };
  const originals: THREE.Mesh[] = [];
  const collect = (object: THREE.Object3D) => {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      !(object.material instanceof THREE.MeshStandardMaterial) ||
      !object.visible
    )
      return;
    const local = object.matrixWorld.clone().premultiply(inverse);
    const position = new THREE.Vector3().setFromMatrixPosition(local);
    const key = JSON.stringify([
      Math.floor((position.x + 1e-6) / cellSize),
      Math.floor((position.z + 1e-6) / cellSize),
      object.castShadow,
      object.receiveShadow,
      object.renderOrder,
      materialId(object.material),
    ]);
    const bucket = buckets.get(key) ?? [];
    bucket.push(object);
    buckets.set(key, bucket);
  };
  if (recursive) root.traverse(collect);
  else root.children.forEach(collect);
  const batch = new THREE.Group();
  batch.name = "static-scenery-batches";
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return geometry.applyMatrix4(mesh.matrixWorld.clone().premultiply(inverse));
    });
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, meshes[0].material);
    mesh.castShadow = meshes[0].castShadow;
    mesh.receiveShadow = meshes[0].receiveShadow;
    mesh.renderOrder = meshes[0].renderOrder;
    batch.add(mesh);
    for (const original of meshes) {
      original.visible = false;
      originals.push(original);
    }
  }
  root.add(batch);
  return {
    batch,
    dispose() {
      root.remove(batch);
      for (const original of originals) original.visible = true;
      // React owns the original materials and geometry; only dispose our copies.
      for (const mesh of batch.children as THREE.Mesh[]) mesh.geometry.dispose();
    },
  };
}
