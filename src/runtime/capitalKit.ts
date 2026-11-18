import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  capitalKitCatalogue,
  capitalKitGeometry,
  capitalKitLeaves,
  capitalKitTexture,
  capitalKitUv,
} from "../gameplay/capitalBuildingKit";
import { shadowSizes } from "../gameplay/graphicsSettings";
import { ps2ShadowSize } from "../gameplay/ps2Style";
import { element } from "../ui/dom";
import { disposeObjects } from "./disposeObjects";
import { startFrameLoop } from "./frameLoop";
import { gameStore } from "./gameStore";
import { createViewport } from "./viewport";

export function mountCapitalKit(host: HTMLElement, signal: AbortSignal) {
  if (signal.aborted) return;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dfe3e6");
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
  camera.position.set(-2.4, 36, 17);

  const view = element("div", "game-viewport");
  view.tabIndex = -1;
  host.prepend(view);
  host.classList.add("capital-kit");
  const viewport = createViewport(view, scene, camera);
  const controls = new OrbitControls(camera, viewport.canvas);
  controls.target.set(-2.4, 0, -3.6);
  controls.minDistance = 8;
  controls.maxDistance = 90;
  controls.update();

  const sun = new THREE.DirectionalLight("#ffffff", 2.8);
  sun.position.set(-18, 30, -14);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 20, bottom: -20 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  scene.add(new THREE.HemisphereLight("#ffffff", "#8e9aa6", 1), sun);
  const floor = new THREE.MeshStandardMaterial({
    map: capitalKitTexture("floor"),
    roughness: 0.95,
  });
  const blue = new THREE.MeshStandardMaterial({ map: capitalKitTexture("blue"), roughness: 0.9 });
  const orange = new THREE.MeshStandardMaterial({
    map: capitalKitTexture("orange"),
    roughness: 0.85,
  });

  function addMesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    castShadow = true,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  addMesh(
    scene,
    capitalKitUv(new THREE.BoxGeometry(46, 0.2, 29).translate(-0.4, -0.1, -2.6)),
    floor,
    false,
  );
  for (const [x, z, width, depth] of [
    [0, -14, 46, 1],
    [0, 14, 46, 1],
    [-22.5, 0, 1, 27],
    [22.5, 0, 1, 27],
  ]) {
    addMesh(
      scene,
      capitalKitUv(new THREE.BoxGeometry(width, 3.5, depth).translate(x - 0.4, 1.75, z - 2.6)),
      blue,
    );
  }

  const labelLayer = element("div", "capital-kit-labels");
  const doors = new Map<THREE.Object3D, { toggled: boolean }>();
  const animate: Array<(dt: number, allOpen: boolean) => void> = [];
  const labels = capitalKitCatalogue.map((piece) => {
    const group = new THREE.Group();
    group.position.set(...piece.position);
    if (piece.rotation) group.rotation.set(...piece.rotation);
    group.updateMatrix();
    scene.add(group);
    addMesh(
      group,
      capitalKitUv(capitalKitGeometry(piece.model, piece.size, piece.thickness), group.matrix),
      orange,
    );
    const leaves = capitalKitLeaves(piece.model, piece.size, piece.thickness);
    if (leaves.length) {
      const door = { toggled: false };
      let amount = 0;
      const hinges = leaves.map((leaf) => {
        const hinge = new THREE.Group();
        hinge.position.set(...leaf.hinge);
        group.add(hinge);
        doors.set(addMesh(hinge, capitalKitUv(leaf.geometry), blue), door);
        return hinge;
      });
      animate.push((dt, allOpen) => {
        const target = Number(allOpen !== door.toggled);
        amount += THREE.MathUtils.clamp(target - amount, -dt * 1.5, dt * 1.5);
        const eased = THREE.MathUtils.smoothstep(amount, 0, 1);
        hinges.forEach((hinge, index) => {
          hinge.rotation.y = leaves[index].openAngle * eased;
        });
      });
    }
    const label = element("span", "", piece.name);
    labelLayer.append(label);
    return {
      label,
      position: new THREE.Vector3(
        piece.position[0],
        0.05,
        piece.position[2] + piece.size[2] / 2 + 0.6,
      ),
    };
  });
  host.append(labelLayer);

  function checkbox(label: string) {
    const input = element("input");
    input.type = "checkbox";
    return { input, label: element("label", "", input, label) };
  }
  const showLabels = checkbox(" Show names");
  const openDoors = checkbox(" Open doors");
  const capital = element("a", "", "Explore the Capital →");
  capital.href = "/boss";
  host.append(
    element(
      "aside",
      "capital-kit-panel",
      element("strong", "", "Capital construction kit"),
      element("p", "", `${capitalKitCatalogue.length} pieces · 1 m checker · drag to orbit`),
      showLabels.label,
      openDoors.label,
      capital,
    ),
  );

  const pointer = new THREE.Vector2();
  const down = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const targets = [...doors.keys()];
  viewport.canvas.addEventListener(
    "pointerdown",
    ({ clientX, clientY }) => down.set(clientX, clientY),
    { signal },
  );
  viewport.canvas.addEventListener(
    "pointerup",
    (event) => {
      if (event.button !== 0 || down.distanceTo(pointer.set(event.clientX, event.clientY)) > 4)
        return;
      const rect = viewport.canvas.getBoundingClientRect();
      pointer.set(
        (2 * (event.clientX - rect.left)) / rect.width - 1,
        1 - (2 * (event.clientY - rect.top)) / rect.height,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects(targets, false)[0];
      const door = hit && doors.get(hit.object);
      if (door) door.toggled = !door.toggled;
    },
    { signal },
  );

  const projected = new THREE.Vector3();
  let shadowSize = -1;
  const stop = startFrameLoop(({ delta, interval }) => {
    const { paused, settings } = gameStore.getSnapshot();
    controls.enabled = !paused;
    view.inert = paused;
    const size = ps2ShadowSize(shadowSizes[settings.shadows], settings.ps2Style);
    if (size !== shadowSize) {
      shadowSize = size;
      sun.castShadow = size > 0;
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.setScalar(Math.max(1, size));
    }
    if (!paused)
      for (const step of animate) step(settings.reducedMotion ? 1 : delta, openDoors.input.checked);
    viewport.render(settings, paused ? 0 : interval);
    labelLayer.hidden = !showLabels.input.checked;
    if (labelLayer.hidden) return;
    labels.forEach(({ label, position }) => {
      projected.copy(position).project(camera);
      label.hidden =
        Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1;
      label.style.left = `${50 * (projected.x + 1)}%`;
      label.style.top = `${50 * (1 - projected.y)}%`;
    });
  });

  return () => {
    stop();
    controls.dispose();
    sun.shadow.dispose();
    disposeObjects(scene);
    viewport.dispose();
  };
}
