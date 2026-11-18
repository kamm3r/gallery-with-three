import { useRef, useState } from "react";
import { ViewportHtml } from "./ViewportHtml";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector4, type Object3D, type PerspectiveCamera } from "three";
import { isEditorHelper, selectionOwner, selectSceneObject } from "./sceneSelection";
import { previewRect } from "./viewportMath";

export function SceneCameraPreview({
  selected,
  close,
}: {
  selected: Object3D | null;
  close: () => void;
}) {
  const { size } = useThree();
  const active = useRef<{ camera: PerspectiveCamera; owner: Object3D } | null>(null);
  const [name, setName] = useState("");
  const rect = previewRect(size.width, size.height);
  const viewport = useRef(new Vector4());
  const scissor = useRef(new Vector4());
  useFrame(({ gl, scene, camera }) => {
    // Own the main render while the inset is enabled, then draw the camera view
    // into a clipped rectangle using the same WebGL context and scene.
    gl.render(scene, camera);
    let target: PerspectiveCamera | null = null;
    let fallback: PerspectiveCamera | null = null;
    scene.traverse((object) => {
      if (!(object as PerspectiveCamera).isPerspectiveCamera) return;
      const owner = selectionOwner(object);
      if (owner?.userData.sceneObjectId === "camera-main") fallback = object as PerspectiveCamera;
      if (owner && owner === selected) target = object as PerspectiveCamera;
    });
    const lens = (target ?? fallback) as PerspectiveCamera | null;
    const owner = lens ? selectionOwner(lens) : null;
    if (!lens || !owner || rect.width < 64) {
      if (active.current) {
        active.current = null;
        setName("");
      }
      return;
    }
    if (active.current?.camera !== lens || name !== owner.name) {
      active.current = { camera: lens, owner };
      setName(owner.name);
    }
    const hidden: Object3D[] = [];
    scene.traverse((object) => {
      if (object.visible && isEditorHelper(object)) {
        hidden.push(object);
        object.visible = false;
      }
    });
    const previousTest = gl.getScissorTest();
    const shadows = gl.shadowMap.autoUpdate;
    const autoClear = gl.autoClear;
    gl.getViewport(viewport.current);
    gl.getScissor(scissor.current);
    try {
      lens.updateWorldMatrix(true, false);
      gl.shadowMap.autoUpdate = false;
      gl.autoClear = true;
      gl.setScissorTest(true);
      gl.setViewport(rect.x, rect.y, rect.width, rect.height);
      gl.setScissor(rect.x, rect.y, rect.width, rect.height);
      gl.render(scene, lens);
    } finally {
      hidden.forEach((object) => {
        object.visible = true;
      });
      gl.autoClear = autoClear;
      gl.shadowMap.autoUpdate = shadows;
      gl.setViewport(viewport.current);
      gl.setScissor(scissor.current);
      gl.setScissorTest(previousTest);
    }
  }, 1);
  if (!name || rect.width < 64) return null;
  return (
    <ViewportHtml layer={35}>
      <div
        className="viewport-camera-preview"
        style={{ width: rect.width, height: rect.height }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <span>{name}</span>
          <button
            title="Select preview camera"
            aria-label="Select preview camera"
            onClick={() => selectSceneObject(active.current?.owner ?? null)}
          >
            ↗
          </button>
          <button aria-label="Close camera preview" onClick={close}>
            ×
          </button>
        </header>
        <button
          className="viewport-preview-image"
          aria-label={`Select ${name} from preview`}
          title={`Select ${name}`}
          onClick={() => selectSceneObject(active.current?.owner ?? null)}
        />
      </div>
    </ViewportHtml>
  );
}
