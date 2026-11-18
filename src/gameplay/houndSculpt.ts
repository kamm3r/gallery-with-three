import * as THREE from "three";
import asset from "./generated/ossuary-hound-v4.json" with { type: "json" };

/** Sculpted continuous skin driven by the same authoritative attack/IK joints. */
export function createHoundSculpt(
  root: THREE.Group,
  joints: Record<string, THREE.Group>,
  material: THREE.MeshStandardMaterial,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(asset.position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(asset.normal, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(asset.color, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(asset.uv, 2));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(asset.skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(asset.skinWeight, 4));
  geometry.setIndex(asset.index);
  const bones = asset.bones.map((name) => {
    const bone = new THREE.Bone();
    bone.name = name;
    return bone;
  });
  const inverses = asset.bindMatrices.map((values) =>
    new THREE.Matrix4().fromArray(values).invert(),
  );
  const skeleton = new THREE.Skeleton(bones, inverses);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = "hound-anatomical-trunk";
  mesh.userData.parts = asset.parts;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.bind(skeleton, new THREE.Matrix4());
  geometry.computeBoundingBox();
  mesh.boundingBox = geometry.boundingBox!.clone().expandByScalar(0.25);
  mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
  root.add(mesh);
  return {
    mesh,
    update() {
      root.updateMatrixWorld(true);
      // Mirror the gameplay joints into proper skinning bones. The bone world
      // matrices include the actor transform, so attached binding works in-game
      // as well as in the offline review scene.
      asset.bones.forEach((name, i) => bones[i].matrixWorld.copy(joints[name].matrixWorld));
      skeleton.update();
    },
    dispose() {
      skeleton.dispose();
    },
  };
}
