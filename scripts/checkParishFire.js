import * as THREE from "three";
import { buildParishAtmosphere } from "../src/gameplay/parishAtmosphere.ts";
import { parishTorches } from "../src/gameplay/parishDressingPlan.ts";

/** Run in the dev-server preview:
 * (await import('/scripts/checkParishFire.js')).checkParishFire()
 * Reads GPU alpha at fixed times and from multiple angles; flames must end before the volume's top 5%
 * and remain shorter than their bowl diameter.
 */
export function checkParishFire() {
  const atmosphere = buildParishAtmosphere();
  const renderer = new THREE.WebGLRenderer({ alpha: true });
  const size = 128;
  renderer.setSize(size, size);
  renderer.setClearColor(0, 0);
  const target = new THREE.WebGLRenderTarget(size, size);
  const pixels = new Uint8Array(size * size * 4);
  const frozenPixels = new Uint8Array(pixels.length);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  const matrix = new THREE.Matrix4();
  const center = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  let samples = 0;
  let visiblePixels = 0;
  let warmPixels = 0;
  let bluePixels = 0;
  let perspectiveViews = 0;
  let worst = { alpha: 0, flame: "", instance: 0, time: 0 };
  try {
    for (const name of ["warm-flames", "blue-funeral-flames"]) {
      const torches = parishTorches.filter(
        (torch) => torch.blue === (name === "blue-funeral-flames"),
      );
      const source = atmosphere.root.getObjectByName(name);
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, 1);
      mesh.frustumCulled = false;
      scene.add(mesh);
      try {
        for (let instance = 0; instance < source.count; instance++) {
          source.getMatrixAt(instance, matrix);
          mesh.setMatrixAt(0, matrix);
          mesh.instanceMatrix.needsUpdate = true;
          matrix.decompose(center, rotation, scale);
          camera.left = -scale.x / 2;
          camera.right = scale.x / 2;
          camera.bottom = -scale.y / 2;
          camera.top = scale.y / 2;
          camera.updateProjectionMatrix();
          for (const angle of [0, Math.PI / 2, (Math.PI * 2) / 3]) {
            camera.position
              .copy(center)
              .add(new THREE.Vector3(Math.sin(angle) * 4, 0, Math.cos(angle) * 4));
            camera.lookAt(center);
            let viewPixels = 0;
            for (let frame = 0; frame < 40; frame++) {
              const time = frame * 0.125;
              atmosphere.time.value = time;
              renderer.setRenderTarget(target);
              renderer.render(scene, camera);
              renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
              samples++;
              for (let row = 0; row < size; row++)
                for (let col = 0; col < size; col++) {
                  const alpha = pixels[(row * size + col) * 4 + 3];
                  if (alpha > 0) {
                    visiblePixels++;
                    viewPixels++;
                    const pixel = (row * size + col) * 4;
                    if (alpha > 100 && pixels[pixel] > pixels[pixel + 1] * 1.4) warmPixels++;
                    if (alpha > 100 && pixels[pixel + 2] > pixels[pixel] * 2) bluePixels++;
                    const height = ((row + 0.5) / size) * scale.y;
                    if (height > 1.36 * torches[instance].scale)
                      throw new Error(
                        `Flame exceeds the bowl diameter at ${name} ${instance}, time ${time}`,
                      );
                  }
                  if (row >= Math.floor(size * 0.95) && alpha > worst.alpha)
                    worst = { alpha, flame: name, instance, time };
                }
            }
            if (viewPixels === 0)
              throw new Error(`Flame disappeared at ${name} ${instance}, angle ${angle}`);
          }
        }
        const perspective = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
        for (const offset of [
          [0, 1, 4],
          [4, 1, 0],
          [0, 4, 0.01],
        ]) {
          perspective.position.copy(center).add(new THREE.Vector3(...offset));
          perspective.lookAt(center);
          renderer.render(scene, perspective);
          if (renderer.info.render.calls !== 1)
            throw new Error(`Fire volume added an extra transparent pass at ${name}`);
          renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
          if (!pixels.some((value, i) => i % 4 === 3 && value > 0))
            throw new Error(`Fire vanished in perspective at ${name}, offset ${offset.join(",")}`);
          perspectiveViews++;
        }
        atmosphere.motion.value = 0;
        atmosphere.time.value = 0;
        renderer.render(scene, perspective);
        renderer.readRenderTargetPixels(target, 0, 0, size, size, frozenPixels);
        atmosphere.time.value = 40;
        renderer.render(scene, perspective);
        renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
        if (!pixels.every((value, i) => value === frozenPixels[i]))
          throw new Error(`Reduced-motion fire continued to move at ${name}`);
        atmosphere.motion.value = 1;
      } finally {
        scene.remove(mesh);
        mesh.dispose();
      }
    }
    if (visiblePixels === 0) throw new Error("Fire shader did not render any visible pixels");
    if (warmPixels === 0 || bluePixels === 0)
      throw new Error("Warm/blue fire lost its saturated colour");
    if (worst.alpha > 0)
      throw new Error(`Flame reaches the volume's top edge: ${JSON.stringify(worst)}`);
    return {
      pass: true,
      samples,
      perspectiveViews,
      reducedMotionStable: true,
      maxTopAlpha: worst.alpha,
      visiblePixels,
      warmPixels,
      bluePixels,
    };
  } finally {
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    atmosphere.dispose();
  }
}
