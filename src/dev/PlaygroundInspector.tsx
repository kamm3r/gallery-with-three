import { batchEdit, type BatchEdit } from "../gameplay/sceneBatchEdits";
import { setSceneTransform } from "../gameplay/sceneDocument";
import type { ComponentCommand } from "./ComponentInspector";
import { setComponents, applyPrefabOverrides } from "../gameplay/sceneComponentCommands";
import { validateSceneDocument } from "../gameplay/sceneDocument";
import { startThumbnailSession, endThumbnailSession } from "./assetThumbnails";
import { validModelAsset } from "../gameplay/assetReferences";
import { ProjectBrowser, type SceneResource } from "./ProjectBrowser";
import { AssetInspector } from "./AssetInspector";
import type { AssetEntry } from "./assetTypes";
import { PlaybackControls } from "./PlaybackControls";
import { CompactViewportBar } from "./CompactViewportBar";
import { ViewportOrientation } from "./ViewportOrientation";
import { ViewportSceneHelpers } from "./ViewportSceneHelpers";
import { SceneCameraPreview } from "./SceneCameraPreview";
import { ViewportTools } from "./ViewportTools";
import {
  axisVector,
  axisViews,
  frameView,
  switchProjection,
  type AxisView,
  type SceneViewCamera,
} from "./viewportMath";
import { hasAuthoredChildren } from "./sceneGraph";
import { copySceneNode, type NodeClipboard } from "./nodeClipboard";
import {
  isEditorHelper,
  pickSceneObject,
  selectSceneObject,
  toggleSceneObject,
  selectedRoots,
} from "./sceneSelection";
import { readWorkspaceLayouts, rememberWorkspaceLayout, type LayoutName } from "./workspaceLayouts";
import {
  readEditorPreferences,
  rememberEditorPreferences,
  type EditorPreferences,
} from "./editorPreferences";
import {
  setEditorPlayback,
  setEditorPaused,
  useEditorPaused,
  requestEditorStep,
  beginEditorFrame,
} from "./editorPlayback";
import {
  WORLD_ROOT_ID,
  type SceneNode,
  type SceneProperties,
  type SceneVec3,
} from "../gameplay/sceneDocument";
import { useSceneDocument } from "./useSceneDocument";
import {
  SceneDocumentContext,
  readSceneTransform,
  sceneObjectOwner,
} from "../components/SceneObject";
import { SelectionGizmo, type SelectionControls } from "./SelectionGizmo";
import { Leva } from "leva";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { WorldProvider } from "koota/react";
import {
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type CSSProperties,
} from "react";
import {
  Box3,
  BoxHelper,
  type Mesh,
  type Material,
  Euler,
  Raycaster,
  Plane,
  Vector2,
  Vector3,
  type Object3D,
  type Scene,
  type PerspectiveCamera,
  type OrthographicCamera,
} from "three";
import { PlaygroundScene } from "../components/PlaygroundScene";
import { ThirdPersonPlayer } from "../components/ThirdPersonPlayer";
import { parkZones } from "../gameplay/collisionCourse";
import { useControllerTuning } from "../hooks/usePlaygroundTuning";
import { runtimeWorld } from "../gameplay/ecs/world";
import { SceneTree, type NodeCommand } from "./SceneTree";
import { SceneInspector } from "./SceneInspector";
import "./playgroundInspector.css";

const movementKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ShiftLeft",
  "ShiftRight",
]);

/** Publish the live R3F scene root so the custom tree can traverse authored nodes. */
function SceneRootBridge({ onChange }: { onChange: (scene: Scene) => void }) {
  const scene = useThree((state) => state.scene);
  const sceneDocument = useContext(SceneDocumentContext);
  useEffect(() => {
    onChange(scene);
  }, [onChange, scene]);
  // Publish after the canvas renderer commits metadata and properties. The DOM
  // editor can commit before R3F, so publishing there exposes stale node data.
  useEffect(() => {
    window.dispatchEvent(new Event("scene-view:document"));
  }, [sceneDocument]);
  return null;
}

function AuthoredSelection({
  pending,
  complete,
  selected,
}: {
  pending: string | null;
  complete: () => void;
  selected: Object3D | null;
}) {
  const { scene, camera, gl } = useThree();
  useEffect(() => {
    const spawn = (event: Event) => {
      const request = (
        event as CustomEvent<
          string | { assetUrl: string; name: string; clientX?: number; clientY?: number }
        >
      ).detail;
      const position = new Vector3();
      camera.getWorldDirection(position).multiplyScalar(6).add(camera.position);
      if (
        typeof request !== "string" &&
        request.clientX !== undefined &&
        request.clientY !== undefined
      ) {
        const rect = gl.domElement.getBoundingClientRect();
        const ray = new Raycaster();
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        ray.setFromCamera(
          new Vector2(
            ((request.clientX - rect.left) / rect.width) * 2 - 1,
            (-(request.clientY - rect.top) / rect.height) * 2 + 1,
          ),
          camera,
        );
        const hit = pickSceneObject(ray.intersectObjects(scene.children, true));
        if (hit) position.copy(hit.point);
        else ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), position);
      }
      let root: Object3D | null = null;
      scene.traverse((node) => {
        if (node.userData.sceneObjectId === WORLD_ROOT_ID) root = node;
      });
      if (root) (root as Object3D).worldToLocal(position);
      window.dispatchEvent(
        new CustomEvent("scene-view:new", {
          detail: {
            template: typeof request === "string" ? request : "asset-model",
            ...(typeof request === "string" ? {} : request),
            position: position.toArray(),
          },
        }),
      );
    };
    gl.domElement.addEventListener("scene-view:spawn", spawn);
    return () => gl.domElement.removeEventListener("scene-view:spawn", spawn);
  }, [camera, gl, scene]);
  useFrame(() => {
    const target = pending ?? selected?.userData.sceneObjectId;
    if (!target) return;
    let found: Object3D | null = null;
    scene.traverse((node) => {
      if (node.userData.sceneObjectId === target) found = node;
    });
    if (found && (pending || found !== selected)) {
      selectSceneObject(found, window, !pending);
      complete();
    } else if (!found && !pending && selected) window.dispatchEvent(new Event("scene-view:cancel"));
  });
  return null;
}

function SceneCamera({
  editing,
  playing,
}: {
  editing: { current: boolean };
  playing: { current: boolean };
}) {
  const { gl, camera, scene, set, size } = useThree();
  const initialized = useRef(false);
  const savedView = useRef<{
    camera: SceneViewCamera;
    position: Vector3;
    quaternion: typeof camera.quaternion;
    up: Vector3;
    pivot: Vector3;
  } | null>(null);
  const navigation = useRef({
    mode: "" as "" | "fly" | "orbit" | "pan" | "dolly",
    button: -1,
    keys: new Set<string>(),
    speed: 12,
    rotation: new Euler(0, 0, 0, "YXZ"),
    step: new Vector3(),
    pivot: new Vector3(0, 0, -12),
    selected: null as Object3D | null,
  });
  useEffect(() => {
    const canvas = gl.domElement;
    const state = navigation.current;
    if (!initialized.current) {
      camera.lookAt(state.pivot);
      initialized.current = true;
    }
    const offset = new Vector3(),
      right = new Vector3(),
      upVector = new Vector3();
    const raycaster = new Raycaster();
    const start = new Vector2();
    let pointer = -1;
    let lastX = 0,
      lastY = 0,
      hovered = false;
    const textInput = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      Boolean(
        target.closest("input,textarea,select,[contenteditable=true],[role=menu],[role=dialog]"),
      );
    const clear = () => {
      state.mode = "";
      state.button = -1;
      state.keys.clear();
      canvas.style.cursor = "";
      if (pointer >= 0 && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
      pointer = -1;
    };
    const dolly = (amount: number) => {
      if ((camera as OrthographicCamera).isOrthographicCamera) {
        const orthographic = camera as OrthographicCamera;
        orthographic.zoom = Math.max(0.01, Math.min(1000, orthographic.zoom * Math.exp(-amount)));
        orthographic.updateProjectionMatrix();
        return;
      }
      const distance = Math.max(0.2, camera.position.distanceTo(state.pivot));
      camera.getWorldDirection(offset);
      const step = distance * (1 - Math.exp(Math.max(-2, Math.min(2, amount))));
      camera.position.addScaledVector(offset, Math.min(step, distance - 0.1));
    };
    const frameSelected = () => {
      if (!state.selected) return;
      const box = new Box3().setFromObject(state.selected);
      let radius = 2;
      if (box.isEmpty()) state.selected.getWorldPosition(state.pivot);
      else {
        box.getCenter(state.pivot);
        radius = Math.max(0.25, box.getSize(offset).length() / 2);
      }
      frameView(
        camera as SceneViewCamera,
        state.pivot,
        radius,
        canvas.clientWidth / canvas.clientHeight,
      );
    };
    const select = (event: Event) => {
      state.selected = (event as CustomEvent<Object3D>).detail;
    };
    const startPlay = () => {
      clear();
      savedView.current = {
        camera: camera as SceneViewCamera,
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        up: camera.up.clone(),
        pivot: state.pivot.clone(),
      };
      if ((camera as OrthographicCamera).isOrthographicCamera)
        set({
          camera: switchProjection(
            camera as SceneViewCamera,
            state.pivot,
            canvas.clientWidth / canvas.clientHeight,
          ),
        });
    };
    const stopPlay = () => {
      const saved = savedView.current;
      if (!saved) return;
      saved.camera.position.copy(saved.position);
      saved.camera.quaternion.copy(saved.quaternion);
      saved.camera.up.copy(saved.up);
      state.pivot.copy(saved.pivot);
      saved.camera.updateMatrixWorld(true);
      set({ camera: saved.camera });
      savedView.current = null;
    };
    const pick = (event: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      camera.updateMatrixWorld();
      raycaster.setFromCamera(
        new Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = pickSceneObject(raycaster.intersectObjects(scene.children, true));
      if (hit) state.pivot.copy(hit.point);
      if (event.ctrlKey || event.metaKey || event.shiftKey)
        toggleSceneObject(hit?.object ?? null, scene);
      else selectSceneObject(hit?.object ?? null);
    };
    const down = (event: PointerEvent) => {
      if (editing.current || playing.current) return;
      start.set(event.clientX, event.clientY);
      lastX = event.clientX;
      lastY = event.clientY;
      state.mode =
        event.button === 1 || (event.altKey && event.ctrlKey && event.button === 0)
          ? "pan"
          : event.altKey && event.button === 0
            ? "orbit"
            : event.altKey && event.button === 2
              ? "dolly"
              : event.button === 2
                ? "fly"
                : "";
      if (!state.mode) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      (document.activeElement as HTMLElement | null)?.blur();
      state.button = event.button;
      state.rotation.setFromQuaternion(camera.quaternion, "YXZ");
      pointer = event.pointerId;
      canvas.setPointerCapture(pointer);
      canvas.style.cursor = "grabbing";
    };
    const move = (event: PointerEvent) => {
      if (!state.mode || playing.current) return;
      const dx = event.clientX - lastX,
        dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (state.mode === "pan") {
        const distance = Math.max(0.2, camera.position.distanceTo(state.pivot));
        const scale =
          (2 * distance * Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360)) /
          canvas.clientHeight;
        right.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(-dx * scale);
        upVector.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(dy * scale);
        offset.copy(right).add(upVector);
        camera.position.add(offset);
        state.pivot.add(offset);
      } else if (state.mode === "dolly") dolly((dx + dy) * 0.01);
      else {
        const distance = camera.position.distanceTo(state.pivot);
        state.rotation.y -= dx * 0.003;
        state.rotation.x = Math.max(
          -Math.PI / 2 + 0.01,
          Math.min(Math.PI / 2 - 0.01, state.rotation.x - dy * 0.003),
        );
        camera.quaternion.setFromEuler(state.rotation);
        camera.getWorldDirection(offset);
        if (state.mode === "orbit")
          camera.position.copy(state.pivot).addScaledVector(offset, -distance);
        else state.pivot.copy(camera.position).addScaledVector(offset, distance);
      }
      camera.updateMatrixWorld();
    };
    const release = (event: PointerEvent) => {
      if (playing.current) {
        clear();
        return;
      }
      if (
        event.button === 0 &&
        !editing.current &&
        !state.mode &&
        start.distanceTo(new Vector2(event.clientX, event.clientY)) < 4
      )
        pick(event);
      if (event.button === state.button) clear();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (textInput(event.target)) return;
      if (playing.current) {
        if (event.code === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          clear();
          window.dispatchEvent(new Event("scene-view:stop-play"));
        }
        return;
      }
      if (
        event.code === "KeyF" &&
        !event.ctrlKey &&
        !event.metaKey &&
        (hovered || state.selected)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        frameSelected();
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        clear();
        window.dispatchEvent(new Event("scene-view:cancel"));
        return;
      }
      if (state.mode !== "fly" || !movementKeys.has(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      state.keys.add(event.code);
    };
    const keyUp = (event: KeyboardEvent) => state.keys.delete(event.code);
    const wheel = (event: WheelEvent) => {
      if (playing.current) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
      if (state.mode === "fly")
        state.speed = Math.max(0.1, Math.min(500, state.speed * Math.exp(-delta * 0.001)));
      else dolly(delta * 0.001);
    };
    // Block the package's alternate camera so it cannot override this camera.
    const legacyDown = (event: MouseEvent) => {
      if (event.button === 2) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const context = (event: Event) => event.preventDefault();
    const enter = () => {
      hovered = true;
    };
    const leave = () => {
      hovered = false;
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const doubleClick = (event: MouseEvent) => {
      if (!playing.current && !event.altKey && event.button === 0) {
        pick(event);
        frameSelected();
      }
    };
    const axis = (event: Event) => {
      const direction = (event as CustomEvent<string>).detail as AxisView;
      if (!axisViews.includes(direction)) return;
      if (state.selected) {
        const bounds = new Box3().setFromObject(state.selected);
        if (!bounds.isEmpty()) bounds.getCenter(state.pivot);
        else state.selected.getWorldPosition(state.pivot);
      }
      const distance = Math.max(2, camera.position.distanceTo(state.pivot));
      offset.copy(axisVector(direction));
      camera.position.copy(state.pivot).addScaledVector(offset, distance);
      camera.up.set(
        0,
        direction.endsWith("y") ? 0 : 1,
        direction.endsWith("y") ? (direction === "y" ? -1 : 1) : 0,
      );
      camera.lookAt(state.pivot);
      camera.updateMatrixWorld(true);
    };
    const orbitWidget = (event: Event) => {
      if (playing.current || editing.current) return;
      const { x, y } = (event as CustomEvent<{ x: number; y: number }>).detail;
      const distance = Math.max(0.2, camera.position.distanceTo(state.pivot));
      state.rotation.setFromQuaternion(camera.quaternion, "YXZ");
      state.rotation.y -= x * 0.008;
      state.rotation.x = Math.max(
        -Math.PI / 2 + 0.01,
        Math.min(Math.PI / 2 - 0.01, state.rotation.x - y * 0.008),
      );
      state.rotation.z = 0;
      camera.quaternion.setFromEuler(state.rotation);
      camera.getWorldDirection(offset);
      camera.position.copy(state.pivot).addScaledVector(offset, -distance);
      camera.up.set(0, 1, 0);
      camera.updateMatrixWorld(true);
    };
    const projection = () => {
      clear();
      set({
        camera: switchProjection(
          camera as SceneViewCamera,
          state.pivot,
          canvas.clientWidth / canvas.clientHeight,
        ),
      });
    };
    const reset = () => {
      clear();
      camera.up.set(0, 1, 0);
      camera.position.set(0, 16, 34);
      state.pivot.set(0, 0, -12);
      camera.lookAt(state.pivot);
    };
    canvas.addEventListener("pointerdown", down, true);
    canvas.addEventListener("mousedown", legacyDown, true);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", clear);
    canvas.addEventListener("lostpointercapture", clear);
    canvas.addEventListener("pointerenter", enter);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("dblclick", doubleClick);
    canvas.addEventListener("contextmenu", context);
    canvas.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", keyDown, true);
    window.addEventListener("keyup", keyUp, true);
    window.addEventListener("blur", clear);
    window.addEventListener("scene-view:selection", select);
    window.addEventListener("scene-view:reset", reset);
    window.addEventListener("scene-view:axis", axis);
    window.addEventListener("scene-view:projection", projection);
    window.addEventListener("scene-view:orbit-widget", orbitWidget);
    window.addEventListener("scene-view:play-start", startPlay);
    window.addEventListener("scene-view:play-stop", stopPlay);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clear();
      canvas.removeEventListener("pointerdown", down, true);
      canvas.removeEventListener("mousedown", legacyDown, true);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", release);
      canvas.removeEventListener("pointercancel", clear);
      canvas.removeEventListener("lostpointercapture", clear);
      canvas.removeEventListener("pointerenter", enter);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("dblclick", doubleClick);
      canvas.removeEventListener("contextmenu", context);
      canvas.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keyDown, true);
      window.removeEventListener("keyup", keyUp, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("scene-view:selection", select);
      window.removeEventListener("scene-view:reset", reset);
      window.removeEventListener("scene-view:axis", axis);
      window.removeEventListener("scene-view:projection", projection);
      window.removeEventListener("scene-view:orbit-widget", orbitWidget);
      window.removeEventListener("scene-view:play-start", startPlay);
      window.removeEventListener("scene-view:play-stop", stopPlay);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [gl, camera, scene, editing, set]);
  useEffect(() => {
    const orthographic = camera as OrthographicCamera;
    if (orthographic.isOrthographicCamera) {
      const halfHeight = (orthographic.top - orthographic.bottom) / 2;
      orthographic.left = (-halfHeight * size.width) / size.height;
      orthographic.right = (halfHeight * size.width) / size.height;
      orthographic.updateProjectionMatrix();
    } else {
      (camera as PerspectiveCamera).aspect = size.width / size.height;
      (camera as PerspectiveCamera).updateProjectionMatrix();
    }
    window.dispatchEvent(
      new CustomEvent("scene-view:projection-changed", {
        detail: orthographic.isOrthographicCamera ? "Orthographic" : "Perspective",
      }),
    );
  }, [camera, size.width, size.height]);
  useFrame((_, delta) => {
    const state = navigation.current;
    if (playing.current || state.mode !== "fly") return;
    const keys = state.keys;
    state.step
      .set(
        Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
        0,
        Number(keys.has("KeyS")) - Number(keys.has("KeyW")),
      )
      .applyQuaternion(camera.quaternion);
    state.step.y += Number(keys.has("KeyE")) - Number(keys.has("KeyQ"));
    if (state.step.lengthSq() > 0) {
      state.step
        .normalize()
        .multiplyScalar(
          state.speed *
            (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3 : 1) *
            Math.min(delta, 0.05),
        );
      camera.position.add(state.step);
      state.pivot.add(state.step);
    }
  });
  return null;
}

/** Dev-only diagnostics also verify authored placements against live physics. */
function EditorPhysics() {
  const { world, rigidBodyStates } = useRapier();
  const canvas = useThree((state) => state.gl.domElement);
  // Update collider world poses while the simulation is paused in the editor.
  useFrame(() => world.propagateModifiedBodyPositionsToColliders(), -1);
  useEffect(() => {
    const host = canvas as HTMLCanvasElement & {
      __scenePhysics?: { snapshot: (id: string) => unknown };
    };
    host.__scenePhysics = {
      snapshot: (id) => {
        for (const [handle, state] of rigidBodyStates) {
          const owner = sceneObjectOwner(state.object);
          if (owner?.userData.sceneObjectId !== id) continue;
          const body = world.getRigidBody(handle);
          const colliders = Array.from({ length: body.numColliders() }, (_, i) => {
            const collider = body.collider(i);
            return {
              position: collider.translation(),
              rotation: collider.rotation(),
              shape: collider.shapeType(),
              halfExtents: collider.halfExtents(),
            };
          });
          return { position: body.translation(), rotation: body.rotation(), colliders };
        }
        return null;
      },
    };
    return () => {
      delete host.__scenePhysics;
    };
  }, [canvas, world, rigidBodyStates]);
  return null;
}

/** Pause keeps rendering; Step advances the shared Rapier simulation once. */
function EditorSimulationClock() {
  const { step } = useRapier();
  const needsStep = useRef(false);
  useFrame(() => {
    needsStep.current = beginEditorFrame();
  }, -2);
  useFrame(() => {
    if (needsStep.current) {
      step(1 / 60);
      needsStep.current = false;
    }
  });
  return null;
}

/** Play mode reuses the live scene: physics resumes and the game player is mounted. */
function EditorPlaySession() {
  const tuning = useControllerTuning();
  return (
    <ThirdPersonPlayer
      start={parkZones[0].spawn as [number, number, number]}
      portals={[]}
      bounds={[78, 78]}
      cameraDistance={4.8}
      onNearPortal={() => {}}
      onEnterPortal={() => {}}
      onHangChange={() => {}}
      tuning={tuning}
    />
  );
}

type Resource = SceneResource;

function SceneResources({
  wireframe,
  selected,
  onResources,
}: {
  wireframe: boolean;
  selected: Object3D | null;
  onResources: (items: Resource[]) => void;
}) {
  const { scene } = useThree();
  const last = useRef(-Infinity);
  const originals = useRef(new Map<Material & { wireframe?: boolean }, boolean>());
  useEffect(() => {
    const saved = originals.current;
    return () => {
      for (const [material, value] of saved) material.wireframe = value;
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    const helper = new BoxHelper(selected, 0xf0a44c);
    helper.userData.editorHelper = true;
    helper.raycast = () => {};
    scene.add(helper);
    return () => {
      scene.remove(helper);
      helper.geometry.dispose();
      (helper.material as Material).dispose();
    };
  }, [scene, selected]);
  useFrame(() => {
    // Keep the outline aligned with objects without changing their transforms.
    scene.children.forEach((child) => {
      if (child instanceof BoxHelper) child.update();
    });
    const now = performance.now();
    if (now - last.current < 500) return;
    last.current = now;
    const items: Resource[] = [];
    const materials = new Set<string>();
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || isEditorHelper(object)) return;
      items.push({
        id: object.uuid,
        name: sceneObjectOwner(object)?.name || object.name || object.type,
        kind: "Mesh",
        object,
        ownerId: sceneObjectOwner(object)?.userData.sceneObjectId,
        ownerName: sceneObjectOwner(object)?.name,
      });
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const editable = material as Material & {
          wireframe?: boolean;
          color?: { getHexString: () => string };
        };
        if (typeof editable.wireframe === "boolean") {
          if (!originals.current.has(editable)) originals.current.set(editable, editable.wireframe);
          editable.wireframe = wireframe || originals.current.get(editable)!;
        }
        if (materials.has(material.uuid)) continue;
        materials.add(material.uuid);
        items.push({
          id: material.uuid,
          name: material.name || material.type,
          kind: "Material",
          object,
          ownerId: sceneObjectOwner(object)?.userData.sceneObjectId,
          ownerName: sceneObjectOwner(object)?.name,
          color: editable.color ? `#${editable.color.getHexString()}` : undefined,
        });
      }
    });
    onResources(items);
  });
  return null;
}

export default function PlaygroundInspector() {
  const sceneDocument = useSceneDocument();
  useEffect(() => {
    startThumbnailSession();
    return endThumbnailSession;
  }, []);
  const [resourceWorkspace, setResourceWorkspace] = useState<Resource | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetEntry | null>(null);
  const [inspectorPin, setInspectorPin] = useState<string | null>(null);
  const [resourcesOpen, setResourcesOpen] = useState(true);
  const [workspaceLayout, setWorkspaceLayout] = useState<LayoutName>("scene");
  const [nodeClipboard, setNodeClipboard] = useState<NodeClipboard | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const completeSelection = useCallback(() => setPendingSelection(null), []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gizmo = useRef<SelectionControls>(null);
  const editing = useRef(false);
  const [tool, setTool] = useState<"hand" | "translate" | "rotate" | "scale">("translate");
  const [preferences, setPreferences] = useState<EditorPreferences>(() => readEditorPreferences());
  const [snapHeld, setSnapHeld] = useState(false);
  const [playing, setPlaying] = useState(false);
  const simulationPaused = useEditorPaused();
  const [projectionName, setProjectionName] = useState("Perspective");
  const [sceneIcons, setSceneIcons] = useState(true);
  const [cameraPreview, setCameraPreview] = useState(true);
  useEffect(() => {
    const update = (event: Event) => setProjectionName((event as CustomEvent<string>).detail);
    window.addEventListener("scene-view:projection-changed", update);
    return () => window.removeEventListener("scene-view:projection-changed", update);
  }, []);
  const playingRef = useRef(false);
  const [sceneKey, setSceneKey] = useState(0);
  const resumeSelection = useRef<string | null>(null);
  const [sizes, setSizes] = useState({ left: 224, right: 300, bottom: 184 });
  const resize = (panel: "left" | "right" | "bottom", x: number, y: number) =>
    setSizes((current) => ({
      ...current,
      [panel]:
        panel === "left"
          ? Math.max(140, Math.min(window.innerWidth * 0.3, x))
          : panel === "right"
            ? Math.max(200, Math.min(window.innerWidth * 0.35, window.innerWidth - x))
            : Math.max(100, Math.min(window.innerHeight * 0.45, window.innerHeight - y - 22)),
    }));
  useEffect(() => {
    const settings = readWorkspaceLayouts();
    setWorkspaceLayout(settings.active);
    setResourcesOpen(settings.layouts[settings.active].open);
    setSizes(settings.layouts[settings.active].sizes);
  }, []);
  const chooseLayout = (layout: LayoutName) => {
    const settings = readWorkspaceLayouts();
    setWorkspaceLayout(layout);
    setResourcesOpen(settings.layouts[layout].open);
    setSizes(settings.layouts[layout].sizes);
    rememberWorkspaceLayout(layout);
  };
  const saveLayout = () => rememberWorkspaceLayout(workspaceLayout, { sizes, open: resourcesOpen });
  const [grid, setGrid] = useState(true);
  const [colliders, setColliders] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [selected, setSelected] = useState<Object3D | null>(null);
  const [sceneRoot, setSceneRoot] = useState<Scene | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const updateResources = useCallback((items: Resource[]) => setResources(items), []);
  useEffect(() => rememberEditorPreferences(preferences), [preferences]);
  useEffect(() => {
    const update = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") setSnapHeld(event.type === "keydown");
    };
    const clear = () => setSnapHeld(false);
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", clear);
    };
  }, []);
  useEffect(() => {
    playingRef.current = playing;
    setEditorPlayback(playing);
    if (playing) window.dispatchEvent(new Event("scene-view:play-start"));
  }, [playing]);
  useEffect(
    () => () => {
      setEditorPlayback(false);
      document.exitPointerLock();
    },
    [],
  );
  const snapping = preferences.snap.enabled || snapHeld;
  const snapKey = tool === "rotate" ? "rotation" : tool === "scale" ? "scale" : "position";
  const snapValue = preferences.snap[snapKey];
  const snapBounds =
    tool === "rotate" ? [1, 180, 1] : tool === "scale" ? [0.01, 10, 0.05] : [0.01, 100, 0.1];
  const updateSnap = (value: number) => {
    if (!Number.isFinite(value)) return;
    const [min, max] = snapBounds;
    setPreferences((current) => ({
      ...current,
      snap: { ...current.snap, [snapKey]: Math.max(min, Math.min(max, value)) },
    }));
  };
  const startPlay = useCallback(() => {
    if (playingRef.current) return;
    resumeSelection.current = (selected?.userData.sceneObjectId as string | undefined) ?? null;
    playingRef.current = true;
    setEditorPlayback(true);
    window.dispatchEvent(new Event("scene-view:cancel"));
    setPlaying(true);
  }, [selected]);
  const stopPlay = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    setEditorPlayback(false);
    if (document.pointerLockElement) document.exitPointerLock();
    window.dispatchEvent(new Event("scene-view:play-stop"));
    setPlaying(false);
    setSceneKey((key) => key + 1);
    const id = resumeSelection.current;
    resumeSelection.current = null;
    if (id) setPendingSelection(id);
  }, []);
  useEffect(() => {
    const stop = () => stopPlay();
    window.addEventListener("scene-view:stop-play", stop);
    return () => window.removeEventListener("scene-view:stop-play", stop);
  }, [stopPlay]);
  useEffect(() => {
    const select = (event: Event) => {
      setSelectedAsset(null);
      setSelected(
        sceneObjectOwner((event as CustomEvent<Object3D>).detail) ??
          (event as CustomEvent<Object3D>).detail,
      );
    };
    const cancel = () => {
      gizmo.current?.reset();
      editing.current = false;
      setSelected(null);
      selectSceneObject(null);
    };
    const shortcuts = (event: KeyboardEvent) => {
      if (
        playingRef.current ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "input,textarea,select,[contenteditable=true],[role=menu],[role=dialog]",
          ))
      )
        return;
      const tool = ({ KeyQ: "hand", KeyW: "translate", KeyE: "rotate", KeyR: "scale" } as const)[
        event.code as "KeyQ" | "KeyW" | "KeyE" | "KeyR"
      ];
      if (tool) {
        event.preventDefault();
        setTool(tool);
      }
    };
    window.addEventListener("scene-view:selection", select);
    window.addEventListener("scene-view:cancel", cancel);
    window.addEventListener("keydown", shortcuts);
    return () => {
      window.removeEventListener("scene-view:selection", select);
      window.removeEventListener("scene-view:cancel", cancel);
      window.removeEventListener("keydown", shortcuts);
    };
  }, []);
  const duplicateSelection = useCallback(() => {
    const owner = sceneObjectOwner(selected);
    if (!owner || owner.userData.sceneObjectId === WORLD_ROOT_ID || hasAuthoredChildren(owner))
      return;
    const transform = readSceneTransform(owner);
    transform.position[0] += 1;
    transform.position[2] += 1;
    const id = sceneDocument.duplicate(owner.userData.sceneObjectId, owner.name, transform);
    if (id) setPendingSelection(id);
  }, [selected, sceneDocument.duplicate]);
  const deleteSelection = useCallback(() => {
    const owner = sceneObjectOwner(selected);
    if (!owner || owner.userData.sceneObjectId === WORLD_ROOT_ID) return;
    if (sceneDocument.remove(owner.userData.sceneObjectId))
      window.dispatchEvent(new Event("scene-view:cancel"));
  }, [selected, sceneDocument.remove]);
  const onNodeCommand = useCallback(
    (command: NodeCommand, object: Object3D | null) => {
      if (playingRef.current || !sceneDocument.ready) return;
      if (command.startsWith("add-")) {
        canvas.current?.dispatchEvent(
          new CustomEvent("scene-view:spawn", {
            detail: `primitive-${command.slice(4)}`,
          }),
        );
        return;
      }
      if (command === "paste") {
        if (!nodeClipboard) return;
        const id = sceneDocument.paste(nodeClipboard);
        if (id) setPendingSelection(id);
        return;
      }
      const owner = sceneObjectOwner(object);
      if (!owner || owner.userData.sceneObjectId === WORLD_ROOT_ID) return;
      if (["copy", "cut", "duplicate"].includes(command) && hasAuthoredChildren(owner)) return;
      const sourceId = owner.userData.sceneObjectId as string;
      if (command === "copy" || command === "cut") {
        setNodeClipboard(
          copySceneNode(sceneDocument.document, sourceId, owner.name, readSceneTransform(owner)),
        );
      }
      if (command === "delete" || command === "cut") {
        if (sceneDocument.remove(sourceId)) window.dispatchEvent(new Event("scene-view:cancel"));
      } else if (command === "duplicate") {
        const transform = readSceneTransform(owner);
        transform.position[0] += 1;
        transform.position[2] += 1;
        const id = sceneDocument.duplicate(sourceId, owner.name, transform);
        if (id) setPendingSelection(id);
      }
    },
    [
      sceneDocument.ready,
      sceneDocument.document,
      sceneDocument.paste,
      sceneDocument.remove,
      sceneDocument.duplicate,
      nodeClipboard,
    ],
  );
  useEffect(() => {
    const create = (event: Event) => {
      if (playingRef.current) return;
      const { template, position, assetUrl, name } = (
        event as CustomEvent<{
          template: string;
          position: SceneVec3;
          assetUrl?: string;
          name?: string;
        }>
      ).detail;
      const transform = {
        position,
        rotation: [0, 0, 0] as SceneVec3,
        scale: [1, 1, 1] as SceneVec3,
      };
      const id =
        template === "asset-model" && assetUrl
          ? sceneDocument.createAsset(assetUrl, name ?? "Model", transform)
          : sceneDocument.create(template, transform);
      if (id) setPendingSelection(id);
    };
    const properties = (event: Event) => {
      if (playingRef.current) return;
      const { id, patch } = (event as CustomEvent<{ id: string; patch: Partial<SceneNode> }>)
        .detail;
      sceneDocument.updateNode(id, patch);
    };
    const batchCommand = (event: Event) => {
      if (playingRef.current) return;
      sceneDocument.transact((current) =>
        batchEdit(current, (event as CustomEvent<BatchEdit>).detail),
      );
    };
    const componentCommand = (event: Event) => {
      if (playingRef.current) return;
      const action = (event as CustomEvent<ComponentCommand>).detail;
      sceneDocument.transact((current) => {
        if (action.type === "components") return setComponents(current, action.id, action.patch);
        if (action.type === "apply-prefab") return applyPrefabOverrides(current, action.id);
        if (action.type === "component-reset") {
          const props = { ...current.properties[action.id] };
          const components = { ...props.components };
          delete components[action.kind];
          props.components = components;
          return validateSceneDocument({
            ...current,
            properties: { ...current.properties, [action.id]: props },
          });
        }
        if (action.type === "material-update")
          return validateSceneDocument({
            ...current,
            materials: { ...current.materials, [action.materialId]: action.material },
          });
        const materialId =
          action.type === "material-create" ? `material-${crypto.randomUUID()}` : action.materialId;
        const props = { ...current.properties[action.id], materialId };
        delete props.material;
        return validateSceneDocument({
          ...current,
          properties: { ...current.properties, [action.id]: props },
          materials:
            action.type === "material-create"
              ? { ...current.materials, [materialId]: action.material }
              : current.materials,
        });
      });
    };
    const nodeProperties = (event: Event) => {
      if (playingRef.current) return;
      const { id, patch } = (event as CustomEvent<{ id: string; patch: SceneProperties }>).detail;
      sceneDocument.updateProperties(id, patch);
    };
    const resetProperties = (event: Event) => {
      if (playingRef.current) return;
      sceneDocument.resetProperties(String((event as CustomEvent<string>).detail));
    };
    const resetProperty = (event: Event) => {
      if (playingRef.current) return;
      const { id, key } = (event as CustomEvent<{ id: string; key: keyof SceneProperties }>).detail;
      sceneDocument.resetProperty(id, key);
    };
    const keys = (event: KeyboardEvent) => {
      if (
        playingRef.current ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "input,textarea,select,[contenteditable=true],[role=menu],[role=dialog]",
          ))
      )
        return;
      if ((event.ctrlKey || event.metaKey) && ["KeyC", "KeyX", "KeyV"].includes(event.code)) {
        if (!selected && event.code !== "KeyV") return;
        if (event.code === "KeyV" && !nodeClipboard) return;
        event.preventDefault();
        onNodeCommand(
          event.code === "KeyC" ? "copy" : event.code === "KeyX" ? "cut" : "paste",
          selected,
        );
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyD") {
        event.preventDefault();
        duplicateSelection();
      }
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        (event.code === "Delete" || event.code === "Backspace")
      ) {
        event.preventDefault();
        deleteSelection();
      }
    };
    window.addEventListener("scene-view:batch-edit", batchCommand);
    window.addEventListener("scene-view:component-command", componentCommand);
    window.addEventListener("scene-view:new", create);
    window.addEventListener("scene-view:properties", properties);
    window.addEventListener("scene-view:node-properties", nodeProperties);
    window.addEventListener("scene-view:reset-properties", resetProperties);
    window.addEventListener("scene-view:reset-property", resetProperty);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("scene-view:batch-edit", batchCommand);
      window.removeEventListener("scene-view:component-command", componentCommand);
      window.removeEventListener("scene-view:new", create);
      window.removeEventListener("scene-view:properties", properties);
      window.removeEventListener("scene-view:node-properties", nodeProperties);
      window.removeEventListener("scene-view:reset-properties", resetProperties);
      window.removeEventListener("scene-view:reset-property", resetProperty);
      window.removeEventListener("keydown", keys);
    };
  }, [
    sceneDocument.transact,
    sceneDocument.create,
    sceneDocument.createAsset,
    sceneDocument.updateNode,
    sceneDocument.updateProperties,
    sceneDocument.resetProperties,
    sceneDocument.resetProperty,
    duplicateSelection,
    deleteSelection,
    onNodeCommand,
    selected,
    nodeClipboard,
  ]);
  const commitSelection = useCallback(() => {
    if (!sceneRoot) return;
    const objects = selectedRoots(sceneRoot, selected);
    sceneDocument.transact((current) => {
      let next = current;
      for (const owner of objects) {
        owner.scale.set(
          Math.max(0.01, owner.scale.x),
          Math.max(0.01, owner.scale.y),
          Math.max(0.01, owner.scale.z),
        );
        next = setSceneTransform(next, owner.userData.sceneObjectId, readSceneTransform(owner));
      }
      return next;
    });
  }, [selected, sceneRoot, sceneDocument.transact]);
  useEffect(() => {
    const command = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.code === "KeyS") {
        event.preventDefault();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        void sceneDocument.save();
        return;
      }
      if (playingRef.current) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          "input,textarea,select,[contenteditable=true],[role=menu],[role=dialog]",
        )
      )
        return;
      if (event.code === "KeyZ") {
        event.preventDefault();
        if (event.shiftKey) sceneDocument.redo();
        else sceneDocument.undo();
      }
      if (event.code === "KeyY") {
        event.preventDefault();
        sceneDocument.redo();
      }
    };
    window.addEventListener("keydown", command);
    return () => window.removeEventListener("keydown", command);
  }, [sceneDocument.save, sceneDocument.undo, sceneDocument.redo]);
  useEffect(() => {
    const commit = (event: Event) => {
      if (playingRef.current) return;
      const owner = (event as CustomEvent<Object3D>).detail;
      sceneDocument.commit(owner.userData.sceneObjectId, readSceneTransform(owner));
    };
    window.addEventListener("scene-view:commit", commit);
    return () => window.removeEventListener("scene-view:commit", commit);
  }, [sceneDocument.commit]);
  const selectResource = (item: Resource) => {
    const owner = sceneObjectOwner(item.object) ?? item.object;
    setSelected(owner);
    selectSceneObject(owner);
  };
  useEffect(() => {
    const id = selected?.userData.sceneObjectId as string | undefined;
    if (
      id &&
      (sceneDocument.document.removed.includes(id) ||
        (id.startsWith("node-") && !sceneDocument.document.nodes[id]))
    )
      window.dispatchEvent(new Event("scene-view:cancel"));
  }, [selected, sceneDocument.document]);
  const activeResourceId = resourceWorkspace?.ownerId;
  const activeResourceNode = activeResourceId
    ? sceneDocument.document.nodes[activeResourceId]
    : undefined;
  useEffect(() => {
    if (
      activeResourceId &&
      (sceneDocument.document.removed.includes(activeResourceId) ||
        (activeResourceId.startsWith("node-") && !activeResourceNode))
    )
      setResourceWorkspace(null);
  }, [activeResourceId, activeResourceNode, sceneDocument.document.removed]);
  return (
    <main
      className={playing ? "playground-inspector is-playing" : "playground-inspector"}
      style={
        {
          "--editor-left": `clamp(120px, ${sizes.left}px, 28vw)`,
          "--editor-right": `clamp(160px, ${sizes.right}px, 32vw)`,
          "--editor-bottom": resourcesOpen ? `clamp(100px, ${sizes.bottom}px, 45vh)` : "26px",
        } as CSSProperties
      }
    >
      <Leva hidden />
      {(["left", "right", "bottom"] as const).map((panel) => (
        <div
          key={panel}
          className={`editor-splitter editor-splitter-${panel}`}
          role="separator"
          aria-label={`Resize ${panel === "bottom" ? "Project" : panel === "left" ? "Hierarchy" : "Inspector"} panel`}
          aria-orientation={panel === "bottom" ? "horizontal" : "vertical"}
          aria-valuenow={sizes[panel]}
          tabIndex={0}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              resize(panel, event.clientX, event.clientY);
          }}
          onKeyDown={(event) => {
            const delta =
              event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? -10
                : event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 10
                  : 0;
            if (!delta) return;
            event.preventDefault();
            setSizes((current) => ({
              ...current,
              [panel]: Math.max(
                panel === "bottom" ? 100 : 140,
                Math.min(
                  panel === "bottom" ? window.innerHeight * 0.45 : window.innerWidth * 0.3,
                  current[panel] + delta,
                ),
              ),
            }));
          }}
        />
      ))}
      <nav className="editor-toolbar" aria-label="Scene tools">
        <div className="editor-tool-group">
          <span className="editor-document-name" title="Scene resource">
            ◈ playgroundScene.json{sceneDocument.dirty ? " *" : ""}
          </span>
          <button
            disabled={playing || !sceneDocument.ready || sceneDocument.saving}
            onClick={() => void sceneDocument.save()}
          >
            {" "}
            {sceneDocument.saving ? "Saving…" : "Save"}
          </button>
          <button
            disabled={playing}
            title="Reload scene from disk"
            onClick={() => {
              if (
                !sceneDocument.dirty ||
                window.confirm("Discard unsaved changes and reload the saved scene?")
              )
                void sceneDocument.reload();
            }}
          >
            Reload
          </button>
          <button
            disabled={playing || !sceneDocument.canUndo}
            onClick={sceneDocument.undo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            disabled={playing || !sceneDocument.canRedo}
            onClick={sceneDocument.redo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            ↷
          </button>
        </div>
        <PlaybackControls
          playing={playing}
          paused={simulationPaused}
          ready={sceneDocument.ready}
          play={startPlay}
          stop={stopPlay}
          pause={() => setEditorPaused(!simulationPaused)}
          step={requestEditorStep}
        />
        <select
          className="editor-layout-select"
          aria-label="Workspace layout"
          value={workspaceLayout}
          onChange={(event) => chooseLayout(event.target.value as LayoutName)}
        >
          <option value="scene">Scene workspace</option>
          <option value="assets">Resource workspace</option>
        </select>
        <button
          className="editor-layout-save"
          title="Remember current panel sizes and drawer state"
          onClick={saveLayout}
        >
          Save layout
        </button>
      </nav>
      <aside className="editor-hierarchy-slot" aria-label="Hierarchy panel">
        <SceneTree
          scene={sceneRoot}
          canPaste={Boolean(nodeClipboard)}
          onCommand={onNodeCommand}
          readOnly={playing}
          selectedId={
            (sceneObjectOwner(selected)?.userData.sceneObjectId as string | undefined) ?? null
          }
        />
      </aside>
      <section className="editor-scene" aria-label="Scene view">
        <div className="editor-scene-tabs">
          <button
            className={!playing ? "active" : ""}
            aria-pressed={!playing}
            title="Return to scene editing"
            onClick={stopPlay}
          >
            ▧ Scene
          </button>
          <button
            className={playing ? "active" : ""}
            aria-pressed={playing}
            disabled={!sceneDocument.ready}
            title="Preview the current scene"
            onClick={startPlay}
          >
            ▣ Game
          </button>
          <span>Proving grounds</span>
        </div>
        <CompactViewportBar
          ready={sceneDocument.ready}
          canDuplicate={Boolean(
            sceneObjectOwner(selected) &&
            selected?.userData.sceneObjectId !== WORLD_ROOT_ID &&
            selected &&
            !hasAuthoredChildren(selected),
          )}
          canDelete={Boolean(
            sceneObjectOwner(selected) && selected?.userData.sceneObjectId !== WORLD_ROOT_ID,
          )}
          duplicate={duplicateSelection}
          remove={deleteSelection}
          add={(shape) =>
            canvas.current?.dispatchEvent(
              new CustomEvent("scene-view:spawn", { detail: `primitive-${shape}` }),
            )
          }
          projection={projectionName}
          flags={{ gizmos: sceneIcons, preview: cameraPreview, wireframe, grid, colliders }}
          toggleFlag={(flag) => {
            if (flag === "gizmos") setSceneIcons((value) => !value);
            else if (flag === "preview") setCameraPreview((value) => !value);
            else if (flag === "wireframe") setWireframe((value) => !value);
            else if (flag === "grid") setGrid((value) => !value);
            else if (flag === "colliders") setColliders((value) => !value);
          }}
          preferences={preferences}
          setPreferences={setPreferences}
          snapping={snapping}
          snapValue={snapValue}
          snapBounds={snapBounds}
          snapUnit={tool === "rotate" ? "degrees" : tool === "scale" ? "factor" : "metres"}
          updateSnap={updateSnap}
        />
        <div
          className={resourceWorkspace ? "editor-canvas has-resource" : "editor-canvas"}
          onDragOver={(event) => {
            if (!playing && event.dataTransfer.types.includes("application/x-playground-model")) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(event) => {
            if (playing) return;
            const data = event.dataTransfer.getData("application/x-playground-model");
            if (!data) return;
            event.preventDefault();
            try {
              const asset = JSON.parse(data) as { assetUrl?: unknown; name?: unknown };
              if (validModelAsset(asset.assetUrl) && typeof asset.name === "string")
                canvas.current?.dispatchEvent(
                  new CustomEvent("scene-view:spawn", {
                    detail: {
                      assetUrl: asset.assetUrl,
                      name: asset.name,
                      clientX: event.clientX,
                      clientY: event.clientY,
                    },
                  }),
                );
            } catch {
              /* Unrecognized drops do not change the scene. */
            }
          }}
        >
          <Canvas ref={canvas} shadows camera={{ position: [0, 16, 34], fov: 60 }}>
            <Suspense fallback={null}>
              <WorldProvider world={runtimeWorld}>
                <Physics
                  gravity={[0, -30, 0]}
                  paused={!playing || simulationPaused}
                  debug={colliders}
                >
                  <EditorPhysics />
                  <SceneDocumentContext.Provider key={sceneKey} value={sceneDocument.document}>
                    <PlaygroundScene />
                    <SceneRootBridge onChange={setSceneRoot} />
                  </SceneDocumentContext.Provider>
                  {playing && <EditorPlaySession />}
                  <EditorSimulationClock />
                </Physics>
              </WorldProvider>
            </Suspense>
            {grid && !playing && (
              <gridHelper
                args={[160, 80, "#6a6b6c", "#55585a"]}
                position={[0, 0.02, 0]}
                userData={{ editorHelper: true }}
              />
            )}
            {!playing &&
              selected &&
              sceneObjectOwner(selected) &&
              !sceneObjectOwner(selected)?.userData.sceneLocked &&
              sceneDocument.ready &&
              tool !== "hand" && (
                <SelectionGizmo
                  key={selected.uuid}
                  object={selected}
                  controls={gizmo}
                  editing={editing}
                  mode={tool}
                  preferences={preferences}
                  snapping={snapping}
                  pivotMode={preferences.pivot}
                  commit={commitSelection}
                />
              )}
            <AuthoredSelection
              pending={pendingSelection}
              complete={completeSelection}
              selected={selected}
            />
            <SceneCamera editing={editing} playing={playingRef} />
            {!playing && <ViewportOrientation />}
            {!playing && sceneIcons && <ViewportSceneHelpers selected={selected} />}
            {!playing && cameraPreview && (
              <SceneCameraPreview selected={selected} close={() => setCameraPreview(false)} />
            )}
            <SceneResources
              wireframe={wireframe}
              selected={selected}
              onResources={updateResources}
            />
          </Canvas>
          {!playing && <ViewportTools tool={tool} onTool={setTool} />}
          {resourceWorkspace && (
            <section className="editor-asset-workspace" aria-label="Resource workspace">
              <header>
                <span className="editor-resource-dot" />
                <strong>{resourceWorkspace.name}</strong>
                <button
                  aria-label="Close resource workspace"
                  onClick={() => setResourceWorkspace(null)}
                >
                  ×
                </button>
              </header>
              <div className="editor-asset-path">{resourceWorkspace.kind} · Scene resource</div>
              <div className="editor-asset-preview">
                <span
                  className={
                    resourceWorkspace.kind === "Material" ? "asset-color-sphere" : "asset-mesh-icon"
                  }
                  style={{
                    backgroundColor:
                      resourceWorkspace.kind === "Material"
                        ? (activeResourceNode?.color ?? resourceWorkspace.color ?? "#a8b5c9")
                        : undefined,
                  }}
                >
                  {resourceWorkspace.kind === "Mesh" ? "◇" : ""}
                </span>
              </div>
              <h3>Inspector</h3>
              <dl>
                <dt>Type</dt>
                <dd>{resourceWorkspace.kind}</dd>
                <dt>Owner</dt>
                <dd>
                  {activeResourceNode?.name ??
                    resourceWorkspace.ownerName ??
                    resourceWorkspace.name}
                </dd>
              </dl>
              {activeResourceNode?.template.startsWith("primitive-") ? (
                <label className="editor-asset-color">
                  Material color
                  <input
                    type="color"
                    aria-label="Resource material color"
                    disabled={playing}
                    value={activeResourceNode.color ?? "#a8b5c9"}
                    onChange={(event) =>
                      sceneDocument.updateNode(activeResourceId!, { color: event.target.value })
                    }
                  />
                </label>
              ) : (
                <p>Shared prefab resource. Select its scene node to inspect placement.</p>
              )}
            </section>
          )}
        </div>
      </section>
      <aside className="editor-inspector-slot" aria-label="Inspector panel">
        {selectedAsset && !inspectorPin ? (
          <AssetInspector
            asset={selectedAsset}
            readOnly={playing}
            place={() =>
              canvas.current?.dispatchEvent(
                new CustomEvent("scene-view:spawn", {
                  detail: {
                    assetUrl: selectedAsset.url,
                    name: selectedAsset.name.replace(/\.(glb|gltf)$/i, ""),
                  },
                }),
              )
            }
          />
        ) : (
          <SceneInspector
            object={selected}
            readOnly={playing}
            scene={sceneRoot}
            pinnedId={inspectorPin}
            togglePin={() =>
              setInspectorPin((current) =>
                current
                  ? null
                  : ((sceneObjectOwner(selected)?.userData.sceneObjectId as string | undefined) ??
                    null),
              )
            }
          />
        )}
      </aside>
      <section
        className={resourcesOpen ? "editor-project" : "editor-project is-collapsed"}
        aria-label="Loaded scene resources"
      >
        <ProjectBrowser
          resources={resources}
          open={resourcesOpen}
          toggleOpen={() => setResourcesOpen((current) => !current)}
          selectedAsset={selectedAsset}
          selectAsset={(asset) => {
            selectSceneObject(null);
            setSelectedAsset(asset);
          }}
          selectResource={selectResource}
          openResource={(item) => {
            selectResource(item);
            setResourceWorkspace(item);
            window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF" }));
          }}
        />
      </section>
      <footer className="editor-status">
        <span className="editor-status-dot" />
        <span role="status">
          {sceneDocument.message}
          {sceneDocument.dirty ? " · Modified" : ""}
        </span>
        <span>
          {selected
            ? `Selected: ${selected.name || selected.type}`
            : "Select an object in the scene or hierarchy"}
        </span>
        <span className="editor-status-right">
          {resources.filter((item) => item.kind === "Mesh").length} meshes ·{" "}
          {playing ? (simulationPaused ? "Paused" : "Playing") : "Editing"} ·{" "}
          {snapping ? "Snap" : "Free"} · {preferences.space} · Development
        </span>
      </footer>
    </main>
  );
}
