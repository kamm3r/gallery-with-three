import {
  validateSceneDocument,
  setSceneProperties,
  setSceneTransform,
  type SceneDocument,
  type SceneTransform,
  type SceneProperties,
} from "./sceneDocument.ts";
import { effectiveProperties, setComponents } from "./sceneComponentCommands.ts";
import {
  bodyDefaults,
  colliderDefaults,
  animationDefaults,
  type ComponentKind,
} from "./sceneComponents.ts";
export type BatchAction =
  | {
      type: "transform";
      field: keyof SceneTransform;
      axis: 0 | 1 | 2;
      value: number;
      transforms: Record<string, SceneTransform>;
    }
  | { type: "property"; patch: SceneProperties }
  | {
      type: "body";
      field: "mass" | "gravityScale" | "linearDamping" | "angularDamping";
      value: number;
    }
  | { type: "collider"; field: "friction" | "restitution" | "sensor"; value: number | boolean }
  | { type: "add" | "remove"; kind: ComponentKind };
export type BatchEdit = { ids: string[] } & BatchAction;
export function batchEdit(doc: SceneDocument, action: BatchEdit) {
  let next = doc;
  for (const id of new Set(action.ids)) {
    const props = effectiveProperties(next, id);
    if (props.locked) continue;
    if (action.type === "transform") {
      const transform = next.objects[id] ?? action.transforms[id];
      if (!transform) continue;
      const vector = [...transform[action.field]] as [number, number, number];
      vector[action.axis] = action.value;
      next = setSceneTransform(next, id, { ...transform, [action.field]: vector });
    } else if (action.type === "property") {
      const patch = { ...action.patch };
      if (patch.materialColor && (props.material || props.materialId)) {
        const material =
          props.material ?? (props.materialId ? next.materials?.[props.materialId] : undefined);
        if (material) patch.material = { ...material, color: patch.materialColor };
      }
      next = setSceneProperties(next, id, patch);
    } else if (action.type === "body" && props.components?.rigidbody)
      next = setComponents(next, id, {
        rigidbody: { ...props.components.rigidbody, [action.field]: action.value },
      });
    else if (action.type === "collider" && props.components?.collider)
      next = setComponents(next, id, {
        collider: { ...props.components.collider, [action.field]: action.value },
      });
    else if (action.type === "add" || action.type === "remove") {
      const defaults = {
        renderer: { enabled: true },
        rigidbody: bodyDefaults(),
        collider: colliderDefaults(),
        animation: animationDefaults(),
      };
      if (action.type === "remove" || !props.components?.[action.kind])
        next = setComponents(next, id, {
          [action.kind]: action.type === "remove" ? null : defaults[action.kind],
        });
    }
  }
  return validateSceneDocument(next);
}
