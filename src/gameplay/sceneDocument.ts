import {
  validateComponents,
  validateMaterial,
  safeField,
  type ComponentOverrides,
  type SceneMaterial,
} from "./sceneComponents.ts";
import { validModelAsset } from "./assetReferences.ts";
import { legacyObstacleIds } from "./legacyObstacleIds.ts";
import { rebaseLegacyTransform } from "./sceneOrigins.ts";
export const WORLD_ROOT_ID = "world-root";

export type SceneVec3 = [number, number, number];
export type SceneTransform = { position: SceneVec3; rotation: SceneVec3; scale: SceneVec3 };
export type SceneNode = {
  name: string;
  template: string;
  color?: string;
  dynamic?: boolean;
  assetUrl?: string;
  componentized?: boolean;
};
export type SceneProperties = {
  name?: string;
  visible?: boolean;
  locked?: boolean;
  materialColor?: string;
  roughness?: number;
  metalness?: number;
  lightColor?: string;
  lightIntensity?: number;
  cameraFov?: number;
  cameraNear?: number;
  cameraFar?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  components?: ComponentOverrides;
  materialId?: string;
  material?: SceneMaterial;
};
/** Version 3 stores every transform relative to its positioned parent group. */
export type SceneDocument = {
  version: 3;
  objects: Record<string, SceneTransform>;
  nodes: Record<string, SceneNode>;
  removed: string[];
  properties: Record<string, SceneProperties>;
  materials?: Record<string, SceneMaterial>;
  prefabs?: Record<string, SceneProperties>;
};
export const primitiveTemplates = [
  "primitive-box",
  "primitive-sphere",
  "primitive-cylinder",
  "primitive-cone",
] as const;
export function canonicalSceneId(id: string) {
  return Object.hasOwn(legacyObstacleIds, id) ? legacyObstacleIds[id] : id;
}
function validId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    !["__proto__", "constructor", "prototype"].includes(id) &&
    /^[a-zA-Z0-9:_-]{1,160}$/.test(id)
  );
}

export function validateSceneDocument(value: unknown): SceneDocument {
  if (!value || typeof value !== "object") throw new Error("Invalid scene document");
  const data = value as SceneDocument;
  if (
    ![1, 2, 3].includes(data.version) ||
    !data.objects ||
    typeof data.objects !== "object" ||
    Array.isArray(data.objects)
  )
    throw new Error("Unsupported scene format");
  const entries = Object.entries(data.objects);
  if (entries.length > 5000) throw new Error("Scene has too many objects");
  const objects: Record<string, SceneTransform> = {};
  for (const [id, transform] of entries) {
    if (
      ["__proto__", "constructor", "prototype"].includes(id) ||
      !/^[a-zA-Z0-9:_-]{1,160}$/.test(id)
    )
      throw new Error("Invalid scene object ID");
    if (!transform || typeof transform !== "object") throw new Error(`Invalid transform: ${id}`);
    const result = {} as SceneTransform;
    for (const property of ["position", "rotation", "scale"] as const) {
      const vector = transform[property];
      if (
        !Array.isArray(vector) ||
        vector.length !== 3 ||
        vector.some(
          (n) =>
            typeof n !== "number" ||
            !Number.isFinite(n) ||
            Math.abs(n) > 100000 ||
            (property === "scale" && n < 0.01),
        )
      )
        throw new Error(`Invalid ${property}: ${id}`);
      result[property] = [...vector];
    }
    objects[canonicalSceneId(id)] = result;
  }
  const legacy = (data as { version: number }).version === 1;
  if ((data as { version: number }).version < 3)
    for (const id of Object.keys(objects)) {
      const template = legacy ? undefined : data.nodes?.[id]?.template;
      objects[id] = rebaseLegacyTransform(
        typeof template === "string" ? canonicalSceneId(template) : id,
        objects[id],
      );
    }
  const nodes: Record<string, SceneNode> = {};
  if (!legacy) {
    if (
      !data.nodes ||
      typeof data.nodes !== "object" ||
      Array.isArray(data.nodes) ||
      !Array.isArray(data.removed)
    )
      throw new Error("Invalid scene nodes");
    if (Object.keys(data.nodes).length > 1000 || data.removed.length > 5000)
      throw new Error("Scene has too many nodes");
    for (const [id, node] of Object.entries(data.nodes)) {
      if (
        !validId(id) ||
        !id.startsWith("node-") ||
        !node ||
        !validId(node.template) ||
        typeof node.name !== "string" ||
        !node.name.trim() ||
        node.name.length > 120 ||
        !objects[id]
      )
        throw new Error(`Invalid node: ${id}`);
      if (
        node.template.startsWith("primitive-") &&
        !(primitiveTemplates as readonly string[]).includes(node.template)
      )
        throw new Error("Unknown primitive type");
      if (node.template.startsWith("node-") || data.nodes[node.template])
        throw new Error("Node templates must reference a built-in prefab or primitive");
      if (
        !node.template.startsWith("primitive-") &&
        (node.color !== undefined || node.dynamic !== undefined)
      )
        throw new Error("Prefab properties are defined by their source template");
      if (
        node.template === "asset-model"
          ? !validModelAsset(node.assetUrl)
          : node.assetUrl !== undefined
      )
        throw new Error("Model nodes must reference a local GLB or glTF asset");
      if (node.color !== undefined && !/^#[0-9a-f]{6}$/i.test(node.color))
        throw new Error("Invalid material color");
      if (node.dynamic !== undefined && typeof node.dynamic !== "boolean")
        throw new Error("Invalid body type");
      if (node.componentized !== undefined && typeof node.componentized !== "boolean")
        throw new Error("Invalid component mode");
      nodes[id] = {
        name: node.name,
        template: canonicalSceneId(node.template),
        ...(node.color === undefined ? {} : { color: node.color }),
        ...(node.dynamic === undefined ? {} : { dynamic: node.dynamic }),
        ...(node.assetUrl === undefined ? {} : { assetUrl: node.assetUrl }),
        ...(node.componentized === undefined ? {} : { componentized: node.componentized }),
      };
    }
    for (const id of data.removed)
      if (!validId(id) || nodes[id]) throw new Error("Invalid deleted node");
  }
  const properties: Record<string, SceneProperties> = {};
  if (!legacy && data.properties !== undefined) {
    if (
      !data.properties ||
      typeof data.properties !== "object" ||
      Array.isArray(data.properties) ||
      Object.keys(data.properties).length > 5000
    )
      throw new Error("Invalid node properties");
    for (const [id, raw] of Object.entries(data.properties)) {
      if (!validId(id) || !raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid node properties");
      const result: SceneProperties = {};
      for (const key of ["visible", "locked", "castShadow", "receiveShadow"] as const) {
        if (raw[key] !== undefined) {
          if (typeof raw[key] !== "boolean") throw new Error(`Invalid ${key}`);
          result[key] = raw[key];
        }
      }
      for (const key of ["materialColor", "lightColor"] as const) {
        if (raw[key] !== undefined) {
          if (typeof raw[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(raw[key]))
            throw new Error(`Invalid ${key}`);
          result[key] = raw[key];
        }
      }
      for (const key of ["roughness", "metalness", "lightIntensity"] as const) {
        const number = raw[key];
        if (number !== undefined) {
          if (
            typeof number !== "number" ||
            !Number.isFinite(number) ||
            number < 0 ||
            number > (key === "lightIntensity" ? 10000 : 1)
          )
            throw new Error(`Invalid ${key}`);
          result[key] = number;
        }
      }
      for (const [key, min, max] of [
        ["cameraFov", 1, 179],
        ["cameraNear", 0.001, 10000],
        ["cameraFar", 0.002, 100000],
      ] as const) {
        const value = raw[key];
        if (value !== undefined) {
          if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
            throw new Error(`Invalid ${key}`);
          result[key] = value;
        }
      }
      if (
        result.cameraNear !== undefined &&
        result.cameraFar !== undefined &&
        result.cameraFar <= result.cameraNear
      )
        throw new Error("Camera far plane must exceed its near plane");
      if (raw.components !== undefined) result.components = validateComponents(raw.components);
      if (raw.material !== undefined) result.material = validateMaterial(raw.material);
      if (raw.materialId !== undefined) {
        if (typeof raw.materialId !== "string" || !safeField(raw.materialId))
          throw new Error("Invalid material reference");
        result.materialId = raw.materialId;
      }
      if (raw.name !== undefined) {
        if (typeof raw.name !== "string" || !raw.name.trim() || raw.name.length > 120)
          throw new Error("Invalid node name");
        result.name = raw.name.trim();
      }
      properties[canonicalSceneId(id)] = result;
    }
  }
  let materials: Record<string, SceneMaterial> | undefined;
  if (data.materials !== undefined) {
    if (
      !data.materials ||
      typeof data.materials !== "object" ||
      Array.isArray(data.materials) ||
      Object.keys(data.materials).length > 512
    )
      throw new Error("Invalid material assets");
    materials = {};
    for (const [id, value] of Object.entries(data.materials)) {
      if (!safeField(id)) throw new Error("Invalid material ID");
      materials[id] = validateMaterial(value);
    }
  }
  let prefabs: Record<string, SceneProperties> | undefined;
  if (data.prefabs !== undefined) {
    if (
      !data.prefabs ||
      typeof data.prefabs !== "object" ||
      Array.isArray(data.prefabs) ||
      Object.keys(data.prefabs).length > 1000
    )
      throw new Error("Invalid prefab defaults");
    prefabs = {};
    for (const [key, value] of Object.entries(data.prefabs)) {
      if ((!safeField(key) && !validModelAsset(key)) || key === WORLD_ROOT_ID)
        throw new Error("Invalid prefab key");
      const parsed = validateSceneDocument({
        version: 3,
        objects: {},
        nodes: {},
        removed: [],
        properties: { ["prefab-settings"]: value },
        ...(materials ? { materials } : {}),
      });
      prefabs[key] = parsed.properties["prefab-settings"];
    }
  }
  for (const props of [...Object.values(properties), ...Object.values(prefabs ?? {})])
    if (props.materialId && !materials?.[props.materialId])
      throw new Error("Material asset does not exist");
  return {
    version: 3,
    objects,
    nodes,
    removed: legacy ? [] : [...new Set(data.removed.map(canonicalSceneId))],
    properties,
    ...(materials === undefined ? {} : { materials }),
    ...(prefabs === undefined ? {} : { prefabs }),
  };
}

export function setSceneTransform(
  document: SceneDocument,
  id: string,
  transform: SceneTransform,
): SceneDocument {
  return validateSceneDocument({
    ...document,
    objects: { ...document.objects, [canonicalSceneId(id)]: transform },
  });
}

/** Keep scene resources readable and consistent with the repository formatter. */
export function serializeSceneDocument(document: SceneDocument) {
  return (
    JSON.stringify(validateSceneDocument(document), null, 2)
      .replace(/\[\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*,\s*([-+0-9.eE]+)\s*\]/g, "[$1, $2, $3]")
      .replace(/\[\n[^[\]{}]*?\n\s*\]/g, (array) => {
        const value = JSON.parse(array) as unknown[];
        const compact = JSON.stringify(value).replaceAll(",", ", ");
        return value.every((item) => typeof item === "string") && compact.length < 80
          ? compact
          : array;
      }) + "\n"
  );
}

export function createSceneNode(
  document: SceneDocument,
  id: string,
  node: SceneNode,
  transform: SceneTransform,
): SceneDocument {
  if (!validId(id) || document.objects[id] || document.nodes[id])
    throw new Error("Node ID already exists or is invalid");
  return validateSceneDocument({
    ...document,
    nodes: { ...document.nodes, [id]: node },
    objects: { ...document.objects, [id]: transform },
  });
}
export function deleteSceneNode(document: SceneDocument, id: string): SceneDocument {
  id = canonicalSceneId(id);
  if (id === WORLD_ROOT_ID) throw new Error("The scene root cannot be deleted");
  const objects = { ...document.objects },
    nodes = { ...document.nodes };
  const created = Boolean(nodes[id]);
  delete objects[id];
  delete nodes[id];
  return validateSceneDocument({
    ...document,
    objects,
    nodes,
    properties: Object.fromEntries(
      Object.entries(document.properties).filter(([key]) => key !== id),
    ),
    removed: created ? document.removed : [...document.removed, id],
  });
}
export function duplicateSceneNode(
  document: SceneDocument,
  sourceId: string,
  id: string,
  name: string,
  transform: SceneTransform,
): SceneDocument {
  sourceId = canonicalSceneId(sourceId);
  if (sourceId === WORLD_ROOT_ID) throw new Error("The scene root cannot be duplicated");
  const source = document.nodes[sourceId];
  const result = createSceneNode(
    document,
    id,
    { ...(source ?? { template: sourceId }), name },
    transform,
  );
  if (document.properties[sourceId])
    result.properties[id] = { ...document.properties[sourceId], name };
  return validateSceneDocument(result);
}

export function setSceneProperties(document: SceneDocument, id: string, patch: SceneProperties) {
  id = canonicalSceneId(id);
  return validateSceneDocument({
    ...document,
    properties: { ...document.properties, [id]: { ...document.properties[id], ...patch } },
  });
}

/** Drop every saved override so the node falls back to its authored defaults. */
export function resetSceneProperties(document: SceneDocument, id: string): SceneDocument {
  id = canonicalSceneId(id);
  if (!document.properties[id]) return document;
  const properties = { ...document.properties };
  delete properties[id];
  return validateSceneDocument({ ...document, properties });
}

/** Drop one saved override so a single property falls back to its prefab value. */
export function resetSceneProperty(
  document: SceneDocument,
  id: string,
  key: keyof SceneProperties,
): SceneDocument {
  id = canonicalSceneId(id);
  const current = document.properties[id];
  if (!current || current[key] === undefined) return document;
  const next = { ...current };
  delete next[key];
  const properties = { ...document.properties };
  if (Object.keys(next).length) properties[id] = next;
  else delete properties[id];
  return validateSceneDocument({ ...document, properties });
}
