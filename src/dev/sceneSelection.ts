import type { Intersection, Object3D } from "three";

/** Resolve render/physics wrappers to the node serialized by the scene resource. */
export function selectionOwner(object: Object3D | null): Object3D | null {
  for (let node = object; node; node = node.parent) {
    if (typeof node.userData.sceneObjectId === "string") return node;
  }
  return null;
}

export function isEditorHelper(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node.userData.editorHelper || node.type.startsWith("TransformControls")) return true;
  }
  return false;
}

/** A locked node or editor helper must not swallow a pick on an object behind it. */
export function pickSceneObject(hits: Intersection[]): Intersection | null {
  return (
    hits.find(({ object, distance }) => {
      if (distance > 2000 || !selectionOwner(object) || isEditorHelper(object)) return false;
      for (let node: Object3D | null = object; node; node = node.parent) {
        if (!node.visible || node.userData.sceneLocked) return false;
      }
      return true;
    }) ?? null
  );
}

/** One selection channel shared by the viewport, hierarchy, and resource panes. */
export function selectSceneObject(
  object: Object3D | null,
  target: EventTarget = window,
  preserve = false,
) {
  if (!preserve)
    publishIds(
      object
        ? [String((selectionOwner(object) ?? object).userData.sceneObjectId)].filter(
            (id) => id !== "undefined",
          )
        : [],
    );
  target.dispatchEvent(
    new CustomEvent("scene-view:selection", { detail: selectionOwner(object) ?? object }),
  );
}

let selectedIds: readonly string[] = [];
const selectionListeners = new Set<() => void>();
export function getSelectedIds() {
  return selectedIds;
}
export function subscribeSelection(listener: () => void) {
  selectionListeners.add(listener);
  return () => {
    selectionListeners.delete(listener);
  };
}
function publishIds(ids: string[]) {
  if (JSON.stringify(ids) === JSON.stringify(selectedIds)) return;
  selectedIds = ids;
  selectionListeners.forEach((fn) => fn());
}
export function selectSceneObjects(objects: Object3D[], target: EventTarget = window) {
  const owners = objects.map((o) => selectionOwner(o) ?? o);
  publishIds([...new Set(owners.map((o) => o.userData.sceneObjectId as string).filter(Boolean))]);
  target.dispatchEvent(new CustomEvent("scene-view:selection", { detail: owners.at(-1) ?? null }));
}
export function toggleSceneObject(
  object: Object3D | null,
  scene: Object3D,
  target: EventTarget = window,
) {
  const owner = selectionOwner(object);
  if (!owner) return;
  const id = owner.userData.sceneObjectId as string;
  const ids = selectedIds.includes(id)
    ? selectedIds.filter((key) => key !== id)
    : [...selectedIds, id];
  const objects: Object3D[] = [];
  for (const key of ids)
    scene.traverse((o) => {
      if (o.userData.sceneObjectId === key) objects.push(o);
    });
  selectSceneObjects(objects, target);
}
export function selectedRoots(scene: Object3D, fallback?: Object3D | null) {
  const objects: Object3D[] = [];
  scene.traverse((o) => {
    if (selectedIds.includes(o.userData.sceneObjectId)) objects.push(o);
  });
  if (!objects.length && fallback) objects.push(fallback);
  return objects.filter((object) => {
    for (let parent = object.parent; parent; parent = parent.parent)
      if (objects.includes(parent)) return false;
    return !object.userData.sceneLocked;
  });
}
