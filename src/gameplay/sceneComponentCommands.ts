import {
  validateSceneDocument,
  type SceneDocument,
  type SceneProperties,
} from "./sceneDocument.ts";
import { defaultComponents, type ComponentOverrides } from "./sceneComponents.ts";
export function prefabKey(doc: SceneDocument, id: string) {
  const node = doc.nodes[id];
  return node?.assetUrl ?? node?.template ?? id;
}
export function effectiveProperties(doc: SceneDocument, id: string): SceneProperties {
  const base = doc.prefabs?.[prefabKey(doc, id)] ?? {};
  const own = doc.properties[id] ?? {};
  const result: SceneProperties = {
    ...base,
    ...own,
    components: { ...defaultComponents(doc.nodes[id]), ...base.components, ...own.components },
  };
  if (own.materialId !== undefined && own.material === undefined) delete result.material;
  return result;
}
export function setComponents(doc: SceneDocument, id: string, patch: ComponentOverrides) {
  return validateSceneDocument({
    ...doc,
    properties: {
      ...doc.properties,
      [id]: { ...doc.properties[id], components: { ...doc.properties[id]?.components, ...patch } },
    },
  });
}
export function applyPrefabOverrides(doc: SceneDocument, id: string) {
  const own = { ...doc.properties[id] };
  const { name: _name, visible: _visible, locked: _locked, ...overrides } = own;
  const key = prefabKey(doc, id);
  const base = doc.prefabs?.[key] ?? {};
  const properties = { ...doc.properties };
  properties[id] = Object.fromEntries(
    Object.entries(own).filter(([key]) => ["name", "visible", "locked"].includes(key)),
  );
  return validateSceneDocument({
    ...doc,
    properties,
    prefabs: {
      ...doc.prefabs,
      [key]: { ...base, ...overrides, components: { ...base.components, ...overrides.components } },
    },
  });
}
