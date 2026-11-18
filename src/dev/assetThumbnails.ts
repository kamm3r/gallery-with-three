import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { AssetEntry } from "./assetTypes";

const cache = new Map<string, Promise<string | null>>();
let renderer: WebGLRenderer | null = null;
let active = true;
export function startThumbnailSession() {
  active = true;
}
export function endThumbnailSession() {
  active = false;
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = null;
  cache.clear();
  queue = Promise.resolve();
}
let queue: Promise<unknown> = Promise.resolve();
function renderPreview(object: Object3D) {
  if (!active) return null;
  if (!renderer) {
    renderer = new WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(96, 96);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = SRGBColorSpace;
  }
  const scene = new Scene();
  scene.background = new Color("#343439");
  const group = new Group();
  group.add(object);
  scene.add(group);
  const bounds = new Box3().setFromObject(object);
  if (bounds.isEmpty()) return null;
  const center = bounds.getCenter(new Vector3());
  group.position.sub(center);
  const radius = Math.max(0.01, bounds.getSize(new Vector3()).length() / 2);
  const camera = new PerspectiveCamera(36, 1, radius / 100, radius * 50);
  camera.position.set(radius * 1.7, radius * 1.15, radius * 2);
  camera.lookAt(0, 0, 0);
  scene.add(new AmbientLight("#ffffff", 2));
  const key = new DirectionalLight("#ffffff", 3);
  key.position.set(3, 5, 4);
  scene.add(key);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}
function enqueue(key: string, render: () => Promise<string | null> | string | null) {
  const cached = cache.get(key);
  if (cached) return cached;
  const result = queue.then(render).catch(() => null);
  queue = result;
  if (cache.size > 512) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
function disposeLoaded(object: Object3D) {
  object.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const value of Object.values(material))
        if (value && typeof value === "object" && "isTexture" in value)
          (value as { dispose: () => void }).dispose();
      material.dispose();
    }
  });
}
export function assetThumbnail(asset: AssetEntry) {
  if (asset.kind !== "model" || asset.size > 24 * 1024 * 1024) return Promise.resolve(null);
  return enqueue(`${asset.url}:${asset.modified}`, async () => {
    const model = await new GLTFLoader().loadAsync(asset.url);
    try {
      return renderPreview(model.scene);
    } finally {
      disposeLoaded(model.scene);
    }
  });
}
export function sceneThumbnail(
  object: Object3D,
  id: string,
  kind: "Mesh" | "Material",
  color?: string,
) {
  return enqueue(`scene:${id}:${color ?? ""}`, () => {
    const source = object as Mesh;
    if (!source.isMesh) return null;
    const list: Material[] = Array.isArray(source.material) ? source.material : [source.material];
    const materials = (
      kind === "Material" ? [list.find((material) => material.uuid === id) ?? list[0]] : list
    ).map((material) => material.clone());
    const sphere = kind === "Material" ? new SphereGeometry(1, 24, 16) : null;
    const preview = new Mesh(
      sphere ?? source.geometry,
      materials.length === 1 ? materials[0] : materials,
    );
    if (!sphere) {
      source.getWorldScale(preview.scale);
      source.getWorldQuaternion(preview.quaternion);
    }
    try {
      return renderPreview(preview);
    } finally {
      materials.forEach((material) => material.dispose());
      sphere?.dispose();
    }
  });
}
