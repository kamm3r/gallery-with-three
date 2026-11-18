import * as THREE from "three";

/** Match the skinned shader's local normals, including UV-split vertices. */
export function exportEnemyNormals(mesh: THREE.Mesh): number[] {
  const geometry = mesh.geometry;
  return Array.from({ length: geometry.getAttribute("position").count }, (_, i) => {
    const normal = new THREE.Vector3().fromBufferAttribute(geometry.getAttribute("normal"), i);
    if (mesh instanceof THREE.SkinnedMesh) {
      const position = new THREE.Vector3().fromBufferAttribute(
        geometry.getAttribute("position"),
        i,
      );
      // Subtract the skinned point to cancel translation, leaving the same
      // weighted linear transform that the skinning shader applies to normals.
      mesh
        .applyBoneTransform(i, normal.add(position))
        .sub(mesh.getVertexPosition(i, position))
        .normalize();
    }
    return normal.toArray();
  }).flat();
}
