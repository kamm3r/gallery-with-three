import { WORLD_ROOT_ID } from "../gameplay/sceneDocument.ts";
import type { Light, Mesh, Object3D, Scene } from "three";
import type { SceneObjectKind } from "./editorIcons";

export type TreeRow = {
  id: string;
  label: string;
  kind: SceneObjectKind;
  object: Object3D | null;
  visible: boolean;
  locked: boolean;
  children: TreeRow[];
};

export const ROOT_ID = "__world__";

export function objectKind(object: Object3D): SceneObjectKind {
  if (object.userData.sceneObjectId === WORLD_ROOT_ID) return "world";
  let kind: SceneObjectKind = "group";
  object.traverse((child) => {
    if ((child as Light).isLight) kind = "light";
    else if (kind !== "light" && (child as Mesh).isMesh) kind = "mesh";
    else if (kind === "group" && (child as { isCamera?: boolean }).isCamera) kind = "camera";
  });
  return kind;
}

function authoredChildren(parent: Object3D): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const child of parent.children) {
    if (child.userData.editorHelper) continue;
    const id = child.userData.sceneObjectId;
    if (typeof id === "string") {
      rows.push({
        id,
        label: child.name || id,
        kind: objectKind(child),
        object: child,
        visible: child.visible,
        locked: child.userData.sceneLocked === true,
        children: authoredChildren(child),
      });
      continue;
    }
    // Wrapper groups (scene fragments, showcase containers) are flattened so
    // the tree only lists nodes the scene resource actually owns.
    rows.push(...authoredChildren(child));
  }
  return rows;
}

export function buildRows(scene: Scene | null): TreeRow[] {
  if (!scene) return [];
  const authored = authoredChildren(scene);
  if (authored.some((row) => row.id === WORLD_ROOT_ID)) return authored;
  return [
    {
      id: ROOT_ID,
      label: "World3D",
      kind: "world",
      object: null,
      visible: scene.visible,
      locked: false,
      children: authored,
    },
  ];
}

export function fingerprint(rows: TreeRow[]): string {
  return rows
    .map(
      (row) =>
        `${row.id}:${row.object?.uuid ?? "world"}:${row.label}:${row.visible ? 1 : 0}:${row.locked ? 1 : 0}(${fingerprint(row.children)})`,
    )
    .join("|");
}

export function filterRows(rows: TreeRow[], query: string): TreeRow[] {
  if (!query) return rows;
  const needle = query.toLowerCase();
  return rows
    .map((row) => {
      const children = filterRows(row.children, query);
      if (children.length || row.label.toLowerCase().includes(needle)) return { ...row, children };
      return null;
    })
    .filter((row): row is TreeRow => row !== null);
}

export function countRows(rows: TreeRow[]): number {
  return rows.reduce((total, row) => total + 1 + countRows(row.children), 0);
}

export function hasAuthoredChildren(object: Object3D): boolean {
  return authoredChildren(object).length > 0;
}
