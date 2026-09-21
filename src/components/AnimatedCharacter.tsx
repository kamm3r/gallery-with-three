import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { ROLL_DURATION } from "../gameplay/playerRules";
import { CHARACTER_MODEL, CLIP_SECONDS } from "../gameplay/characterAnimations";

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
};

export function AnimatedCharacter({
  animation = "Idle",
  armed = false,
  ...props
}: AnimatedCharacterProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);
  const character = useMemo(() => clone(scene), [scene]);
  const { actions } = useAnimations(animations, group);
  const currentAction = useRef<THREE.AnimationAction | null>(null);
  const targetAction = useRef<THREE.AnimationAction | null>(null);

  useLayoutEffect(() => {
    const sword = character.getObjectByName("PlayerSword");
    if (sword) sword.visible = armed;
  }, [character, armed]);

  useLayoutEffect(() => {
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
          if (material instanceof THREE.MeshStandardMaterial && MATERIAL_COLORS[material.name]) {
            material.color.set(MATERIAL_COLORS[material.name]);
            material.roughness = 0.82;
            material.metalness = 0;
          }
          return material;
        });
        object.material = hasMultipleMaterials ? styledMaterials : styledMaterials[0];
      }
    });
  }, [character]);

  useEffect(() => {
    const action = actions[animation];
    if (!action) return;

    const playOnce =
      animation in CLIP_SECONDS ||
      ["Jump", "Roll", "SitDown", "StandUp", "Punch", "Death"].includes(animation);
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
    action.setEffectiveTimeScale(duration ? action.getClip().duration / duration : 1);
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
