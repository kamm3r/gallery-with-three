import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationClip, type Object3D } from "three";
import type { AnimationComponent } from "../gameplay/sceneComponents.ts";

/** Explicit animation lifecycle shared by native scenes and the temporary adapter. */
export function createSceneAnimator(object: Object3D) {
  const mixer = new AnimationMixer(object);
  let settings: AnimationComponent | null | undefined;
  const dispose = () => {
    settings = null;
    mixer.stopAllAction();
    mixer.uncacheRoot(object);
  };
  return {
    configure(clips: AnimationClip[], next?: AnimationComponent | null) {
      dispose();
      settings = next;
      object.userData.sceneAnimationClips = clips.map((clip) => clip.name);
      if (!settings?.enabled || !settings.autoplay) return;
      const clip =
        clips.find((clip) => clip.name === settings!.clip) ??
        (!settings.clip ? clips[0] : undefined);
      if (!clip) return;
      const action = mixer.clipAction(clip);
      action.setLoop(settings.loop ? LoopRepeat : LoopOnce, settings.loop ? Infinity : 1);
      action.clampWhenFinished = true;
      action.play();
    },
    update(delta: number) {
      if (settings?.enabled) mixer.update(delta * settings.speed);
    },
    dispose,
  };
}
