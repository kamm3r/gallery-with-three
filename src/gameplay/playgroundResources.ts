import * as THREE from "three";

/**
 * Shared GPU resources for the proving grounds. Identical looks reuse one
 * material, and identical shapes reuse one unit geometry scaled per mesh,
 * so the renderer and the editor's resource list hold one entry per look.
 *
 * Resources live for the page's lifetime: meshes must not dispose them
 * (pass them as props, never as JSX children, and keep `dispose={null}`).
 */

type StandardOptions = Pick<
  THREE.MeshStandardMaterialParameters,
  "roughness" | "metalness" | "emissiveIntensity"
> & { emissive?: boolean };

const standardMaterials = new Map<string, THREE.MeshStandardMaterial>();

/** One MeshStandardMaterial per (name, colour, options). */
export function playgroundMaterial(name: string, color: string, options: StandardOptions = {}) {
  const { emissive = false, ...rest } = options;
  const key = JSON.stringify([name, color.toLowerCase(), emissive, rest]);
  let material = standardMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color,
      ...(emissive ? { emissive: color } : {}),
      ...rest,
    });
    material.name = name;
    standardMaterials.set(key, material);
  }
  return material;
}

const basicMaterials = new Map<string, THREE.MeshBasicMaterial>();

/** One unlit MeshBasicMaterial per (name, colour). */
export function playgroundBasicMaterial(name: string, color: string) {
  const key = `${name}|${color.toLowerCase()}`;
  let material = basicMaterials.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color });
    material.name = name;
    basicMaterials.set(key, material);
  }
  return material;
}

function named<T extends THREE.BufferGeometry>(name: string, geometry: T) {
  geometry.name = name;
  return geometry;
}

const pyramidVertices = new Float32Array([
  -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0, 0.5, 0,
]);

function makePyramid() {
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(pyramidVertices, 3));
  indexed.setIndex([0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 2, 3, 0, 1, 2]);
  const result = indexed.toNonIndexed();
  result.computeVertexNormals();
  indexed.dispose();
  return result;
}

/** Unit-sized (1 m extents) shapes; scale the mesh to size it. */
export const unitGeometry = {
  box: named("Unit box", new THREE.BoxGeometry(1, 1, 1)),
  // The 16 m dome needs enough segments for the mesh to match its collider.
  sphere: named("Unit sphere", new THREE.SphereGeometry(0.5, 48, 32)),
  /** Low-poly sphere for the many small dynamic balls. */
  ball: named("Unit ball", new THREE.SphereGeometry(0.5, 16, 12)),
  cylinder: named("Unit cylinder", new THREE.CylinderGeometry(0.5, 0.5, 1, 20)),
  /** Kinematic discs need a smoother rim than static posts. */
  disc: named("Unit disc", new THREE.CylinderGeometry(0.5, 0.5, 1, 28)),
  cone: named("Unit cone", new THREE.ConeGeometry(0.5, 1, 32)),
  pyramid: named("Unit pyramid", makePyramid()),
} as const;

export { pyramidVertices };
