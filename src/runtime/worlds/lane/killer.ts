import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { CASUAL_MODEL, CLIP_SECONDS } from "../../../gameplay/characterAnimations";
import type { Night } from "../../../gameplay/hollowNight";
import { playSound } from "../../../gameplay/sound";
import { createEmbers } from "../ashFx";

// The killer: the survivor's own rig recoloured into a pale, featureless mask
// and navy coveralls, the sword shrunk to a kitchen knife.

const PALETTE: Record<string, string> = {
  Skin: "#d9d5c8",
  Face: "#040404",
  Hair: "#3a2c22",
  Shirt: "#1c2837",
  Pants: "#1a2433",
  Belt: "#121212",
};
const STRIDE: Record<string, number> = { Walk: 1.1, Run: 1.6 };
const cameraRight = new THREE.Vector3();

export function createKiller(scene: THREE.Object3D, night: Night, signal: AbortSignal) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  scene.add(root);
  const shift = createEmbers({
    count: 60,
    radius: 0.6,
    height: 2.2,
    speed: 0.8,
    size: 1.2,
    color: "#0a0a0c",
    additive: false,
    sway: 0.5,
    opacity: 0.8,
  });
  root.add(shift.points);
  let mixer: THREE.AnimationMixer | undefined;
  const actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | undefined;
  let shown = "";
  void new GLTFLoader().loadAsync(CASUAL_MODEL.path).then(({ scene: source, animations }) => {
    if (signal.aborted) return;
    const character = clone(source);
    character.scale.setScalar(CASUAL_MODEL.unitScale * 1.02);
    character.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = object.receiveShadow = true;
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(
        (m) => {
          const material = (m as THREE.Material).clone();
          const color = PALETTE[material.name];
          if (material instanceof THREE.MeshStandardMaterial && color) {
            material.color.set(color);
            material.roughness = 0.82;
            material.metalness = 0;
          }
          return material;
        },
      );
      object.material = Array.isArray(object.material) ? materials : materials[0];
    });
    const sword = character.getObjectByName("PlayerSword");
    const shield = character.getObjectByName("PlayerShield");
    if (shield) shield.visible = true;
    if (sword) {
      sword.visible = true;
      if (!(sword as THREE.SkinnedMesh).isSkinnedMesh) sword.scale.setScalar(0.5);
    }
    body.add(character);
    mixer = new THREE.AnimationMixer(character);
    for (const clip of animations) actions.set(clip.name, mixer.clipAction(clip));
  });

  let last = { x: night.killer.x, z: night.killer.z };
  let stride = 0;
  return (camera: THREE.Camera, time: number, delta: number) => {
    const k = night.killer;
    root.position.set(k.x, 0, k.z);
    let turn = k.yaw - root.rotation.y;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    root.rotation.y += turn * (1 - Math.exp(-(k.mode === "attack" ? 20 : 7) * delta));
    const moved = Math.hypot(k.x - last.x, k.z - last.z);
    last = { x: k.x, z: k.z };
    const next =
      k.mode === "attack"
        ? { animation: "SwordSlash", pace: 1 }
        : !k.moving
          ? { animation: "Idle", pace: 0.8 }
          : k.shifting > 0
            ? { animation: "Run", pace: 1.7 }
            : k.mode === "chase"
              ? { animation: "Run", pace: 0.85 }
              : { animation: "Walk", pace: k.mode === "patrol" ? 0.8 : 1.05 };
    const key = `${next.animation}:${next.pace}`;
    const action = actions.get(next.animation);
    if (action && key !== shown) {
      shown = key;
      if (action !== current) {
        const once = next.animation === "SwordSlash";
        action.reset();
        action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
        action.clampWhenFinished = once;
        current?.fadeOut(0.15);
        action.fadeIn(0.15).play();
        current = action;
      }
      const duration = CLIP_SECONDS[next.animation];
      action.setEffectiveTimeScale(duration ? action.getClip().duration / duration : next.pace);
    }
    mixer?.update(delta);
    shift.points.visible = k.shifting > 0;
    shift.update(time);
    body.visible = k.shifting <= 0 || Math.sin(time * 60) > 0;
    const length = STRIDE[next.animation];
    if (length && k.moving && (stride += moved) >= length) {
      stride = 0;
      const gap = Math.hypot(k.x - camera.position.x, k.z - camera.position.z);
      if (gap < 26) {
        cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
        const pan =
          ((k.x - camera.position.x) * cameraRight.x + (k.z - camera.position.z) * cameraRight.z) /
          Math.max(gap, 1);
        playSound("stomp", { intensity: 1 - gap / 26, pan });
      }
    }
  };
}
