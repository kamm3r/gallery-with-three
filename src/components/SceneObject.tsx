import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type Light, type Group, type Object3D, type PerspectiveCamera } from "three";
import { SceneSurface } from "./SceneSurface";
import savedScene from "../gameplay/playgroundScene.json";
import {
  WORLD_ROOT_ID,
  validateSceneDocument,
  type SceneDocument,
  type SceneTransform,
  type SceneVec3,
  type SceneNode,
} from "../gameplay/sceneDocument";

import { effectiveProperties } from "../gameplay/sceneComponentCommands";
import { groupOrigin } from "../gameplay/sceneOrigins";

const NO_ORIGIN: SceneVec3 = [0, 0, 0];

/**
 * The origin of the enclosing group, in the coordinates its children are
 * authored in. Children subtract it so their transforms are parent-relative.
 */
const SceneOriginContext = createContext<SceneVec3>(NO_ORIGIN);

/** Holds meshes and bodies authored in world coordinates inside a positioned group. */
export function WorldPlaced({ children }: { children: ReactNode }) {
  const [x, y, z] = useContext(SceneOriginContext);
  return <group position={[-x, -y, -z]}>{children}</group>;
}

export const SceneNodeContext = createContext<SceneTransform | null>(null);

export const SceneDocumentContext = createContext<SceneDocument>(validateSceneDocument(savedScene));

/** A source-owned prefab can be instanced or removed by the scene resource. */
export function SceneObject({
  id,
  name,
  position,
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  children,
}: {
  id: string;
  name?: string;
  position?: SceneVec3;
  rotation?: SceneVec3;
  scale?: SceneVec3;
  children: ReactNode;
}) {
  const document = useContext(SceneDocumentContext);
  const parentOrigin = useContext(SceneOriginContext);
  // A group with an origin sits there and re-bases its children; any other
  // node's children are already authored relative to it.
  const origin = position ? undefined : groupOrigin(id);
  const [x, y, z] = position ?? origin ?? NO_ORIGIN;
  const placed: SceneVec3 = [x - parentOrigin[0], y - parentOrigin[1], z - parentOrigin[2]];
  const render = (
    nodeId: string,
    nodeName: string,
    transform: SceneTransform,
    definition?: SceneNode,
  ) => (
    <AuthoredSceneNode
      key={nodeId}
      id={nodeId}
      name={nodeName}
      transform={transform}
      definition={definition}
      origin={origin}
    >
      {children}
    </AuthoredSceneNode>
  );
  return (
    <>
      {!document.removed.includes(id) &&
        render(id, name ?? id, document.objects[id] ?? { position: placed, rotation, scale })}
      {Object.entries(document.nodes)
        .filter(([, node]) => node.template === id)
        .map(([nodeId, node]) => render(nodeId, node.name, document.objects[nodeId], node))}
    </>
  );
}

export function AuthoredSceneNode({
  id,
  name,
  transform,
  definition,
  origin = NO_ORIGIN,
  children,
}: {
  id: string;
  name: string;
  transform: SceneTransform;
  definition?: SceneNode;
  origin?: SceneVec3;
  children: ReactNode;
}) {
  const document = useContext(SceneDocumentContext);
  const settings = effectiveProperties(document, id);
  const root = useRef<Group>(null);
  // Keep editor reads fresh: R3F merges userData, so removed overrides would
  // otherwise linger after undo or "Reset properties".
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    node.userData.sceneObjectId = id;
    node.userData.sceneNode = definition;
    node.userData.sceneProperties = settings;
    node.userData.sceneOwnProperties = document.properties[id] ?? {};
    node.userData.sceneDocument = document;
    node.userData.sceneLocked = settings.locked === true;
  }, [id, definition, settings, document]);
  useLayoutEffect(() => {
    const cleanups: (() => void)[] = [];
    if (id === WORLD_ROOT_ID) return;
    root.current?.traverse((object) => {
      if (object.userData.sceneDecoration || sceneObjectOwner(object) !== root.current) return;
      const camera = object as PerspectiveCamera;
      if (camera.isPerspectiveCamera) {
        const original = { fov: camera.fov, near: camera.near, far: camera.far };
        camera.fov = settings.cameraFov ?? original.fov;
        camera.near = settings.cameraNear ?? original.near;
        camera.far = Math.max(settings.cameraFar ?? original.far, camera.near + 0.001);
        camera.updateProjectionMatrix();
        cleanups.push(() => {
          Object.assign(camera, original);
          camera.updateProjectionMatrix();
        });
      }
      const light = object as Light;
      if (light.isLight) {
        const color = light.color.clone(),
          intensity = light.intensity,
          cast = light.castShadow;
        if (settings.lightColor) light.color.set(settings.lightColor);
        if (settings.lightIntensity !== undefined) light.intensity = settings.lightIntensity;
        if (settings.castShadow !== undefined) light.castShadow = settings.castShadow;
        cleanups.push(() => {
          light.color.copy(color);
          light.intensity = intensity;
          light.castShadow = cast;
        });
      }
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [
    settings.materialColor,
    settings.roughness,
    settings.metalness,
    settings.lightColor,
    settings.lightIntensity,
    settings.cameraFov,
    settings.cameraNear,
    settings.cameraFar,
    settings.castShadow,
    settings.receiveShadow,
    transform,
    definition,
  ]);
  return (
    <group
      ref={root}
      name={settings.name ?? name}
      visible={settings.visible !== false}
      position={transform.position}
      rotation={transform.rotation}
      scale={transform.scale}
    >
      <SceneSurface
        root={root}
        settings={settings}
        material={
          settings.material ??
          (settings.materialId ? document.materials?.[settings.materialId] : undefined)
        }
      />
      {/* The key remounts physics bodies when the transform changes, without
          adding another Object3D level to the hierarchy. */}
      <SceneNodeContext.Provider
        key={JSON.stringify([
          transform,
          settings.components?.rigidbody,
          settings.components?.collider,
        ])}
        value={transform}
      >
        <SceneOriginContext.Provider value={origin}>{children}</SceneOriginContext.Provider>
      </SceneNodeContext.Provider>
    </group>
  );
}

export function sceneObjectOwner(object: Object3D | null): Group | null {
  for (let node = object; node; node = node.parent)
    if (typeof node.userData.sceneObjectId === "string") return node as Group;
  return null;
}

export function readSceneTransform(object: Object3D): SceneTransform {
  return {
    position: object.position.toArray(),
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: object.scale.toArray(),
  };
}

/** Dev play sessions fetch the latest disk scene without relying on editor HMR. */
export function SavedSceneProvider({ children }: { children: ReactNode }) {
  const [document, setDocument] = useState(() => validateSceneDocument(savedScene));
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const controller = new AbortController();
    void fetch("/__editor/playground-scene", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Scene resource could not be loaded");
        const payload = await response.json();
        setDocument(validateSceneDocument(payload.document));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Scene load failed", error);
      });
    return () => controller.abort();
  }, []);
  return <SceneDocumentContext.Provider value={document}>{children}</SceneDocumentContext.Provider>;
}
