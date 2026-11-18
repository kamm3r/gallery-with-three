import * as THREE from "three";
import { gothicResidents, type Resident } from "../../../src/gameplay/gothicResidents";
import { createWayfarer } from "../../../src/gameplay/wayfarer";

const canvas = document.querySelector("canvas")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 30);
scene.add(new THREE.HemisphereLight(0xffeedc, 0x677180, 1.95));
const key = new THREE.DirectionalLight(0xffe8cb, 2.55);
key.position.set(-3, 5, 4);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9bb5db, 1.3);
rim.position.set(3, 3, -3);
scene.add(rim);
const atlas = new THREE.TextureLoader().load(canvas.dataset.atlas!);
atlas.colorSpace = THREE.SRGBColorSpace;
atlas.magFilter = atlas.minFilter = THREE.LinearFilter;
atlas.generateMipmaps = false;

const characters = Object.keys(gothicResidents).map((key) => {
  const id = key as Resident;
  const { root } = createWayfarer(atlas, id);
  scene.add(root);
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.53, 0.57, 0.06, 18),
    new THREE.MeshLambertMaterial({ color: 0x3e3e42 }),
  );
  plinth.position.y = -0.035;
  scene.add(plinth);
  return { id, root, plinth };
});
const clay = new THREE.MeshLambertMaterial({ color: 0xb8adb0, side: THREE.DoubleSide });
const surfaces: { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }[] = [];
for (const { root } of characters) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) surfaces.push({ mesh: object, original: object.material });
  });
}
const clayToggle = document.querySelector<HTMLButtonElement>("#clay");
if (clayToggle) {
  clayToggle.onclick = () => {
    const solid = clayToggle.getAttribute("aria-pressed") !== "true";
    clayToggle.setAttribute("aria-pressed", String(solid));
    for (const { mesh, original } of surfaces) mesh.material = solid ? clay : original;
  };
}
let selected = "all";
let angle = -0.34;
let keepIndividualAngles = true;
let pointer: number | undefined;
function layout() {
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const paired = selected === "all" && aspect < 1.32;
  const wide = selected === "all" && !paired;
  camera.position.set(
    0,
    paired ? 2 : 1.52,
    wide ? Math.max(5.05, 9.6 / aspect) : paired ? 6.8 : 4.2,
  );
  camera.lookAt(0, paired ? 1.05 : 1.02, 0);
  characters.forEach(({ id, root, plinth }, index) => {
    root.visible = plinth.visible = selected === "all" || selected === id;
    const x = wide ? (index - 1.5) * 1.18 : paired ? ((index % 2) - 0.5) * 1.28 : 0;
    const y = paired ? (index < 2 ? 0.94 : -1.1) : 0;
    root.position.set(x, y, 0);
    plinth.position.set(x, y - 0.035, 0);
  });
}
const picker = document.querySelector<HTMLSelectElement>("select")!;
picker.onchange = () => {
  selected = picker.value;
  angle = -0.34;
  keepIndividualAngles = true;
  layout();
};
document.querySelectorAll<HTMLButtonElement>("[data-angle]").forEach((button) => {
  button.onclick = () => {
    keepIndividualAngles = false;
    angle = Number(button.dataset.angle);
  };
});
canvas.onpointerdown = (event) => {
  pointer = event.clientX;
  canvas.setPointerCapture(event.pointerId);
};
canvas.onpointermove = (event) => {
  if (pointer === undefined) return;
  angle += (event.clientX - pointer) * 0.012;
  pointer = event.clientX;
};
canvas.onlostpointercapture = () => {
  pointer = undefined;
};
new ResizeObserver(() => {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  layout();
}).observe(canvas);
renderer.setAnimationLoop(() => {
  characters.forEach(({ root }, index) => {
    root.rotation.y =
      angle + (selected === "all" && keepIndividualAngles ? [-0.04, 0.2, 0.09, -0.21][index] : 0);
  });
  renderer.render(scene, camera);
});
