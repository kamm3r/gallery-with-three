import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { ROLL_DURATION } from "../gameplay/playerRules";
import { CHARACTER_MODEL, CLIP_SECONDS } from "../gameplay/characterAnimations";
import { heldItems } from "../gameplay/heldItems";

const MODEL_PATH = CHARACTER_MODEL;

const MATERIAL_COLORS: Record<string, THREE.ColorRepresentation> = {
  Skin: "#ad785a",
  Shirt: "#698cba",
  Pants: "#716254",
  Belt: "#493629",
  Face: "#fffff8",
  Hair: "#5c3e2a",
};

export type ActionName =
  | "Death"
  | "Defeat"
  | "Idle"
  | "LedgeHang"
  | "LedgeGrab"
  | "LedgeClimb"
  | "JumpRise"
  | "JumpFall"
  | "JumpLand"
  | "SitEnter"
  | "SeatedIdle"
  | "SitExit"
  | "SwordSlashQuick"
  | "SwordSlashHeavy"
  | "Jump"
  | "PickUp"
  | "Punch"
  | "RecieveHit"
  | "Roll"
  | "Run"
  | "Run_Carry"
  | "Shoot_OneHanded"
  | "SitDown"
  | "StandUp"
  | "SwordSlash"
  | "Victory"
  | "Walk"
  | "Walk_Carry";

type AnimatedCharacterProps = ThreeElements["group"] & {
  animation?: ActionName;
  armed?: boolean;
  /** Per-material colour overrides, by material name (keep the object stable). */
  palette?: Record<string, THREE.ColorRepresentation>;
  /** Scales the held blade (e.g. down to a kitchen knife). */
  weaponScale?: number;
  /** Playback speed for looping clips (e.g. a slow, heavy walk). */
  pace?: number;
  /** Something held in the right hand instead of the sword. */
  held?: "flashlight";
};

export function AnimatedCharacter({
  animation = "Idle",
  armed = false,
  palette,
  weaponScale = 1,
  pace = 1,
  held,
  ...props
}: AnimatedCharacterProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);
  const character = useMemo(() => clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const currentAction = useRef<THREE.AnimationAction | null>(null);
  const paceRef = useRef(pace);
  useEffect(() => {
    paceRef.current = pace;
    const action = currentAction.current;
    if (action && action.loop === THREE.LoopRepeat) action.setEffectiveTimeScale(pace);
  }, [pace]);
  const targetAction = useRef<THREE.AnimationAction | null>(null);

  // A flashlight gripped where the sword would be: same mount, same forward axis.
  useLayoutEffect(() => {
    if (held !== "flashlight") return;
    // glTF node names lose their dots on load ("Fist.R" becomes "FistR").
    const fist = character.getObjectByName("FistR") ?? character.getObjectByName("Fist.R");
    if (!fist) return;
    const torch = new THREE.Group();
    torch.position.set(0, 0.14, 0);
    torch.quaternion.set(Math.SQRT1_2, 0, 0, Math.SQRT1_2);
    const metal = new THREE.MeshStandardMaterial({
      color: "#2a2b30",
      metalness: 0.7,
      roughness: 0.35,
    });
    const lensMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.15, 0.15, 0.12),
      toneMapped: false,
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), metal);
    body.position.y = 0.1;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.1, 14), metal);
    head.position.y = 0.3;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.066, 14), lensMaterial);
    lens.position.y = 0.352;
    lens.rotation.x = -Math.PI / 2;
    // A soft halo on the lens so the lit torch reads from a distance.
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 2.1, 1.6),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), haloMaterial);
    halo.position.y = 0.37;
    for (const mesh of [body, head]) mesh.castShadow = true;
    torch.add(body, head, lens, halo);
    torch.scale.setScalar(1.3);
    fist.add(torch);
    heldItems.flashlightLens = lens;
    let frame = 0;
    const glow = () => {
      lensMaterial.color.setScalar(heldItems.flashlightOn ? 3 : 0.12);
      halo.visible = heldItems.flashlightOn;
      frame = requestAnimationFrame(glow);
    };
    frame = requestAnimationFrame(glow);
    return () => {
      cancelAnimationFrame(frame);
      fist.remove(torch);
      if (heldItems.flashlightLens === lens) heldItems.flashlightLens = null;
      for (const mesh of [body, head, lens, halo]) mesh.geometry.dispose();
      metal.dispose();
      lensMaterial.dispose();
      haloMaterial.dispose();
    };
  }, [character, held]);

  useLayoutEffect(() => {
    const sword = character.getObjectByName("PlayerSword");
    if (!sword) return;
    sword.visible = armed;
    sword.scale.setScalar(weaponScale);
  }, [character, armed, weaponScale]);

  useLayoutEffect(() => {
    // Restore the shared glTF materials on cleanup so the clones can be freed.
    const restore: Array<[THREE.Mesh, THREE.Material | THREE.Material[], THREE.Material[]]> = [];
    character.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        const hasMultipleMaterials = Array.isArray(object.material);
        const materials: THREE.Material[] = hasMultipleMaterials
          ? object.material
          : [object.material];
        const styledMaterials = materials.map((sourceMaterial) => {
          const material = sourceMaterial.clone();
          const color = palette?.[material.name] ?? MATERIAL_COLORS[material.name];
          if (material instanceof THREE.MeshStandardMaterial && color) {
            material.color.set(color);
            material.roughness = 0.82;
            material.metalness = 0;
          }
          return material;
        });
        restore.push([object, object.material, styledMaterials]);
        object.material = hasMultipleMaterials ? styledMaterials : styledMaterials[0];
      }
    });
    return () => {
      for (const [mesh, original, styled] of restore) {
        mesh.material = original;
        for (const material of styled) material.dispose();
      }
    };
  }, [character, palette]);

  useEffect(() => {
    const action = actions[animation];
    if (!action) return;

    const playOnce =
      animation in CLIP_SECONDS ||
      ["Jump", "Roll", "SitDown", "StandUp", "Punch", "Death", "RecieveHit", "Victory"].includes(
        animation,
      );
    const previous = currentAction.current;
    if (!previous) {
      for (const clip of Object.values(actions)) clip?.setEffectiveWeight(0);
    }
    const existingWeight = action.getEffectiveWeight();
    const locomotion = animation === "Walk" || animation === "Run";
    const previousLocomotion =
      previous?.getClip().name === "Walk" || previous?.getClip().name === "Run";
    const phase =
      previousLocomotion && previous ? (previous.time / previous.getClip().duration) % 1 : 0;
    action.stopFading();
    action.reset();
    // AnimationAction is an imperative Three.js object, not React state.
    Object.assign(action, {
      time: locomotion && previousLocomotion ? phase * action.getClip().duration : 0,
      clampWhenFinished: playOnce,
    });
    action.setLoop(
      playOnce ? THREE.LoopOnce : THREE.LoopRepeat,
      playOnce ? 1 : Number.POSITIVE_INFINITY,
    );
    const duration = animation === "Roll" ? ROLL_DURATION : CLIP_SECONDS[animation];
    action.setEffectiveTimeScale(duration ? action.getClip().duration / duration : paceRef.current);
    action.setEffectiveWeight(previous ? existingWeight : 1).play();
    currentAction.current = action;
    targetAction.current = action;
  }, [actions, animation]);

  useFrame((_, delta) => {
    const target = targetAction.current;
    if (!target) return;
    // Retarget from the weights already on screen. Rapid changes cannot
    // stack competing fades or briefly reveal the unanimated bind pose.
    const blend =
      1 -
      Math.exp(-Math.min(delta, 0.05) * (animation === "Jump" || animation === "Roll" ? 28 : 18));
    let total = 0;
    for (const action of Object.values(actions)) {
      if (!action) continue;
      const weight = THREE.MathUtils.lerp(
        action.getEffectiveWeight(),
        action === target ? 1 : 0,
        blend,
      );
      action.setEffectiveWeight(weight);
      total += weight;
    }
    for (const action of Object.values(actions)) {
      if (action && total > 0) action.setEffectiveWeight(action.getEffectiveWeight() / total);
    }
  });

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={character} />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
