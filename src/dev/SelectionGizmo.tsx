import { useMemo, useRef, useSyncExternalStore, type ComponentRef, type RefObject } from "react";
import { TransformControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { selectedRoots, getSelectedIds, subscribeSelection } from "./sceneSelection";
import { Group, type Object3D } from "three";

import {
  applyPivotDrag,
  beginPivotDrag,
  positionTransformHandle,
  type PivotDrag,
  type PivotMode,
} from "./transformPivot";
import type { EditorPreferences } from "./editorPreferences";

export type SelectionControls = ComponentRef<typeof TransformControls>;

export function SelectionGizmo({
  object,
  controls,
  editing,
  mode,
  preferences,
  snapping,
  pivotMode,
  commit,
}: {
  object: Object3D;
  controls: RefObject<SelectionControls | null>;
  editing: { current: boolean };
  mode: "translate" | "rotate" | "scale";
  preferences: EditorPreferences;
  snapping: boolean;
  pivotMode: PivotMode;
  commit: () => void;
}) {
  const handle = useMemo(() => {
    const group = new Group();
    group.name = "Selection transform handle";
    group.userData.editorHelper = true;
    positionTransformHandle(object, group, pivotMode);
    return group;
  }, [object, pivotMode]);
  useSyncExternalStore(subscribeSelection, getSelectedIds, getSelectedIds);
  const drag = useRef<{ object: Object3D; start: PivotDrag }[] | null>(null);
  const targets = () => {
    let root = object;
    while (root.parent) root = root.parent;
    return selectedRoots(root, object);
  };
  useFrame(() => {
    if (!drag.current) positionTransformHandle(object, handle, pivotMode);
  }, -0.5);
  return (
    <>
      <primitive object={handle} />
      <TransformControls
        ref={controls}
        object={handle}
        mode={mode}
        space={preferences.space}
        translationSnap={snapping ? preferences.snap.position : null}
        rotationSnap={snapping ? (preferences.snap.rotation * Math.PI) / 180 : null}
        scaleSnap={snapping ? preferences.snap.scale : null}
        userData={{ editorHelper: true }}
        onMouseDown={() => {
          drag.current = targets().map((object) => ({
            object,
            start: beginPivotDrag(object, handle),
          }));
          editing.current = true;
        }}
        onObjectChange={() => {
          if (drag.current)
            for (const item of drag.current) applyPivotDrag(item.object, handle, item.start);
        }}
        onMouseUp={() => {
          commit();
          drag.current = null;
          requestAnimationFrame(() => {
            editing.current = false;
          });
        }}
      />
    </>
  );
}
