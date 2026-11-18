import { useEffect, useRef, useState } from "react";
import { ViewportHtml } from "./ViewportHtml";
import { useFrame, useThree } from "@react-three/fiber";
import {
  CameraHelper,
  DirectionalLightHelper,
  type Camera,
  type DirectionalLight,
  type Light,
  type Object3D,
} from "three";
import { selectionOwner, selectSceneObject } from "./sceneSelection";

type Marker = { object: Object3D; owner: Object3D; camera: boolean };
function MarkerIcon({ object, owner, camera }: Marker) {
  return (
    <ViewportHtml object={object} layer={25}>
      <button
        className={`viewport-scene-icon ${camera ? "is-camera" : "is-light"}`}
        aria-label={`Select ${owner.name}`}
        title={owner.name}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          selectSceneObject(owner);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {camera ? (
            <>
              <path d="M3 7h12v11H3zM15 10l6-3v11l-6-3zM6 7l2-3h5l2 3" />
            </>
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 1v4m0 14v4M1 12h4m14 0h4M4 4l3 3m10 10 3 3M4 20l3-3M17 7l3-3" />
            </>
          )}
        </svg>
      </button>
    </ViewportHtml>
  );
}
export function ViewportSceneHelpers({ selected }: { selected: Object3D | null }) {
  const { scene } = useThree();
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("scene-view:document", refresh);
    return () => window.removeEventListener("scene-view:document", refresh);
  }, []);
  const fingerprint = useRef("");
  const tick = useRef(0);
  const helper = useRef<CameraHelper | DirectionalLightHelper | null>(null);
  useFrame(() => {
    helper.current?.update();
    if (performance.now() - tick.current < 250) return;
    tick.current = performance.now();
    const next: Marker[] = [];
    scene.traverse((object) => {
      if (!(object as Camera).isCamera && !(object as Light).isLight) return;
      const owner = selectionOwner(object);
      if (!owner) return;
      for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return;
      next.push({ object, owner, camera: Boolean((object as Camera).isCamera) });
    });
    const signature = next.map(({ object, owner }) => `${object.uuid}:${owner.name}`).join("|");
    if (signature !== fingerprint.current) {
      fingerprint.current = signature;
      setMarkers(next);
    }
  });
  useEffect(() => {
    let target: Object3D | null = null;
    selected?.traverse((object) => {
      if (
        selectionOwner(object) === selected &&
        ((object as Camera).isCamera || (object as DirectionalLight).isDirectionalLight)
      )
        target = object;
    });
    if (!target) return;
    const object = target as Object3D;
    const viewHelper = (object as Camera).isCamera
      ? new CameraHelper(object as Camera)
      : new DirectionalLightHelper(object as DirectionalLight, 2);
    viewHelper.userData.editorHelper = true;
    helper.current = viewHelper;
    scene.add(viewHelper);
    return () => {
      helper.current = null;
      scene.remove(viewHelper);
      viewHelper.dispose();
    };
  }, [selected, scene, revision]);
  return (
    <>
      {markers.map((marker) => (
        <MarkerIcon key={marker.object.uuid} {...marker} />
      ))}
    </>
  );
}
