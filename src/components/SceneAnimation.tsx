import { createSceneAnimator } from "../runtime/sceneAnimator";
import { sceneBehaviors } from "../gameplay/sceneBehaviors";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { type AnimationClip, type Object3D, Vector3, Quaternion, Euler } from "three";
import type { RapierRigidBody } from "@react-three/rapier";
import type { AnimationComponent, ScriptComponent } from "../gameplay/sceneComponents";
import { isPlaygroundEditor } from "../gameplay/editorMode";
import { editorFrameDelta, getEditorPlayback } from "../dev/editorPlayback";
function deltaForScene(delta: number) {
  return typeof window !== "undefined" &&
    isPlaygroundEditor(window.location.pathname, window.location.search) &&
    !getEditorPlayback()
    ? 0
    : editorFrameDelta(delta);
}
export function SceneAnimation({
  object,
  clips,
  settings,
}: {
  object: Object3D;
  clips: AnimationClip[];
  settings?: AnimationComponent | null;
}) {
  const animator = useMemo(() => createSceneAnimator(object), [object]);
  useEffect(() => {
    animator.configure(clips, settings);
    return () => animator.dispose();
  }, [animator, clips, settings]);
  useFrame((_, delta) => animator.update(deltaForScene(delta)));
  return null;
}
export function SceneBehaviors({
  object,
  scripts,
  body,
}: {
  object: Object3D;
  scripts: ScriptComponent[];
  body: RefObject<RapierRigidBody | null>;
}) {
  const elapsed = useRef(0);
  const origin = useRef<{ position: Vector3; rotation: Quaternion } | null>(null);
  useEffect(() => {
    origin.current = null;
  }, [scripts]);
  useEffect(() => {
    elapsed.current = 0;
    return () => {
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
    };
  }, [object, scripts]);
  useFrame((_, delta) => {
    const dt = deltaForScene(delta);
    if (!dt) return;
    elapsed.current += dt;
    const pose = {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    };
    for (const script of scripts) {
      if (!script.enabled) continue;
      const behavior = sceneBehaviors[script.script];
      if (behavior)
        behavior.update({
          time: elapsed.current,
          delta: dt,
          fields: { ...behavior.fields, ...script.fields },
          ...pose,
        });
    }
    const position = new Vector3().fromArray(pose.position),
      rotation = new Euler(...pose.rotation);

    const rb = body.current;
    if (rb) {
      if (!origin.current)
        origin.current = {
          position: new Vector3().copy(rb.translation()),
          rotation: new Quaternion().copy(rb.rotation()),
        };
      const base = origin.current;
      const scale = object.getWorldScale(new Vector3());
      position.multiply(scale).applyQuaternion(base.rotation).add(base.position);
      const q = base.rotation.clone().multiply(new Quaternion().setFromEuler(rotation));
      rb.setNextKinematicTranslation(position);
      rb.setNextKinematicRotation(q);
    } else {
      object.position.copy(position);
      object.rotation.copy(rotation);
    }
  });
  return null;
}
