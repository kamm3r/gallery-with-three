import * as THREE from "three";
import { createWayfarer } from "../../../src/gameplay/wayfarer";
const canvas = document.querySelector("canvas")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 30);
camera.position.set(2, 1.65, 4.2);
camera.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xfff0da, 0x586777, 2.2));
const key = new THREE.DirectionalLight(0xffe6c4, 2.5);
key.position.set(-3, 5, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0xaacaff, 1);
fill.position.set(3, 2, -3);
scene.add(fill);
const tex = new THREE.TextureLoader().load((window as any).atlas);
tex.colorSpace = THREE.SRGBColorSpace;
tex.magFilter = tex.minFilter = THREE.NearestFilter;
tex.generateMipmaps = false;
const rig = createWayfarer(tex);
scene.add(rig.root);
const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.85, 0.92, 0.08, 48),
  new THREE.MeshLambertMaterial({ color: 0x39434a }),
);
pedestal.position.y = -0.05;
scene.add(pedestal);
let dragging = false,
  previous = 0,
  auto = false;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  previous = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (dragging) {
    rig.root.rotation.y += (e.clientX - previous) * 0.012;
    previous = e.clientX;
  }
});
canvas.addEventListener("pointerup", () => (dragging = false));
document.querySelectorAll<HTMLButtonElement>("[data-angle]").forEach(
  (b) =>
    (b.onclick = () => {
      rig.root.rotation.y = Number(b.dataset.angle);
    }),
);
document.querySelector<HTMLButtonElement>("#spin")!.onclick = () => {
  auto = !auto;
  document.querySelector("#spin")!.textContent = auto ? "Stop rotation" : "Rotate";
};
new ResizeObserver(() => {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe(canvas);
renderer.setAnimationLoop(() => {
  if (auto && !dragging) rig.root.rotation.y += 0.006;
  renderer.render(scene, camera);
});
