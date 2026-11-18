import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";

/** DOM overlays share the canvas bounds without becoming selectable scene nodes. */
export function ViewportHtml({
  children,
  object,
  layer = 30,
}: {
  children: ReactNode;
  object?: Object3D;
  layer?: number;
}) {
  const { gl } = useThree();
  const host = useRef<HTMLDivElement | null>(null);
  const root = useRef<Root | null>(null);
  const point = useRef(new Vector3());
  useLayoutEffect(() => {
    const element = document.createElement("div");
    Object.assign(element.style, {
      position: "absolute",
      left: "0",
      top: "0",
      pointerEvents: "none",
      zIndex: String(layer),
    });
    if (!object) Object.assign(element.style, { width: "100%", height: "100%" });
    gl.domElement.parentElement?.appendChild(element);
    const domRoot = createRoot(element);
    host.current = element;
    root.current = domRoot;
    return () => {
      host.current = null;
      root.current = null;
      // A separate React root must unmount after the canvas commit completes.
      queueMicrotask(() => {
        domRoot.unmount();
        element.remove();
      });
    };
  }, [gl, object, layer]);
  useLayoutEffect(() => {
    root.current?.render(<div style={{ pointerEvents: object ? "auto" : "none" }}>{children}</div>);
  }, [children, gl, object, layer]);
  useFrame(({ camera, size }) => {
    if (!object || !host.current) return;
    object.getWorldPosition(point.current).project(camera);
    const p = point.current;
    const visible = p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.1;
    host.current.style.display = visible ? "block" : "none";
    host.current.style.transform = `translate3d(${((p.x + 1) * size.width) / 2}px, ${((1 - p.y) * size.height) / 2}px, 0) translate(-50%, -50%)`;
  });
  return null;
}
