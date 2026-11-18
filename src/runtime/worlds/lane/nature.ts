import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const PACK =
  "/assets/Ultimate Nature Pack - Jun 2019-20260917T180657Z-1-001/Ultimate Nature Pack - Jun 2019/FBX/";
const palette: Record<string, string> = {
  Green: "#5a853a",
  DarkGreen: "#2f5530",
  Wood: "#5e4b38",
  Rock: "#7b8175",
  White: "#d2d5bb",
  Black: "#48473c",
};
export type Specimen = { x: number; y: number; z: number; scale: number; rotation: number };

/** One instanced draw of an Ultimate Nature model, normalised to unit size (height for trees). */
export function createNatureBatch(
  scene: THREE.Object3D,
  model: string,
  points: Specimen[],
  { tree = false, leafColor }: { tree?: boolean; leafColor?: string } = {},
) {
  if (!points.length) return;
  void new FBXLoader()
    .loadAsync(`${PACK}${model}.fbx`)
    .then((source) => {
      source.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(source);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const factor = 1 / (tree ? size.y : Math.max(size.x, size.y, size.z));
      const normalize = new THREE.Matrix4()
        .makeScale(factor, factor, factor)
        .multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
      const geometries: THREE.BufferGeometry[] = [];
      source.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = (
          Array.isArray(object.material) ? object.material : [object.material]
        ) as THREE.MeshPhongMaterial[];
        const geometry = object.geometry.index
          ? object.geometry.toNonIndexed()
          : object.geometry.clone();
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, object.matrixWorld));
        const colors = new Float32Array(geometry.getAttribute("position").count * 3);
        const groups = geometry.groups.length
          ? geometry.groups
          : [{ start: 0, count: colors.length / 3, materialIndex: 0 }];
        for (const group of groups) {
          const material = materials[group.materialIndex ?? 0];
          const color = new THREE.Color(palette[material.name] ?? material.color ?? "#ffffff");
          if (leafColor && /green/i.test(material.name)) color.set(leafColor);
          for (let i = group.start; i < group.start + group.count; i++)
            color.toArray(colors, i * 3);
        }
        for (const attribute of Object.keys(geometry.attributes))
          if (attribute !== "position" && attribute !== "normal")
            geometry.deleteAttribute(attribute);
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        geometry.clearGroups();
        geometries.push(geometry);
      });
      const geometry = mergeGeometries(geometries)!;
      for (const part of geometries) part.dispose();
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
        points.length,
      );
      const transform = new THREE.Object3D();
      points.forEach((point, i) => {
        transform.position.set(point.x, point.y, point.z);
        transform.rotation.set(0, point.rotation, 0);
        transform.scale.setScalar(point.scale);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    })
    .catch((error: unknown) => console.warn(`Could not load ${model}`, error));
}
