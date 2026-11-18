import {
  WORLD_ROOT_ID,
  canonicalSceneId,
  createSceneNode,
  setSceneProperties,
  type SceneDocument,
  type SceneNode,
  type SceneProperties,
  type SceneTransform,
} from "../gameplay/sceneDocument.ts";

export type NodeClipboard = {
  node: SceneNode;
  transform: SceneTransform;
  properties: SceneProperties;
};

export function copySceneNode(
  document: SceneDocument,
  sourceId: string,
  name: string,
  transform: SceneTransform,
): NodeClipboard {
  sourceId = canonicalSceneId(sourceId);
  if (sourceId === WORLD_ROOT_ID) throw new Error("Copy a scene object instead of the scene root");
  return {
    node: { ...(document.nodes[sourceId] ?? { template: sourceId }), name },
    transform: {
      position: [...transform.position],
      rotation: [...transform.rotation],
      scale: [...transform.scale],
    },
    properties: { ...document.properties[sourceId] },
  };
}

export function pasteSceneNode(document: SceneDocument, snapshot: NodeClipboard, id: string) {
  const name = `${snapshot.node.name.slice(0, 115)} copy`;
  const result = createSceneNode(document, id, { ...snapshot.node, name }, snapshot.transform);
  return Object.keys(snapshot.properties).length
    ? setSceneProperties(result, id, { ...snapshot.properties, name })
    : result;
}
