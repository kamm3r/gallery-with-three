import * as THREE from "three";

export function disposeObjects(root: THREE.Object3D) {
  const resources = new Set<{ dispose(): void }>();
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) resources.add(object.skeleton);
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) resources.add(value);
      }
    }
  });
  for (const resource of resources) resource.dispose();
}
