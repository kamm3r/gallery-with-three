import { useRef, useState } from "react";
import { ViewportHtml } from "./ViewportHtml";
import { useFrame, useThree } from "@react-three/fiber";
import { Quaternion, type OrthographicCamera } from "three";
import { orientationAxes, type AxisView } from "./viewportMath";
const colors = { x: "#ee6574", y: "#a6d75c", z: "#609dea" };
const label = (axis: AxisView) =>
  `${axis.startsWith("-") ? "−" : "+"}${axis.slice(-1).toUpperCase()}`;
export function ViewportOrientation() {
  const { camera } = useThree();
  const last = useRef(new Quaternion(0, 0, 0, 0));
  const tick = useRef(0);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [axes, setAxes] = useState(() => orientationAxes(camera.quaternion));
  useFrame(() => {
    if (performance.now() - tick.current < 50 || last.current.angleTo(camera.quaternion) < 0.001)
      return;
    tick.current = performance.now();
    last.current.copy(camera.quaternion);
    setAxes(orientationAxes(camera.quaternion));
  });
  const orthographic = (camera as OrthographicCamera).isOrthographicCamera;
  return (
    <ViewportHtml layer={30}>
      <div
        className="viewport-orientation"
        role="group"
        aria-label="Scene orientation"
        title="Click an axis to align the view; drag to orbit"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (event.button !== 0 || (event.target as Element).closest("button,[role=button]"))
            return;
          event.preventDefault();
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.style.cursor = "grabbing";
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          window.dispatchEvent(
            new CustomEvent("scene-view:orbit-widget", {
              detail: { x: event.clientX - active.x, y: event.clientY - active.y },
            }),
          );
          active.x = event.clientX;
          active.y = event.clientY;
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = null;
          event.currentTarget.style.cursor = "";
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <svg viewBox="0 0 100 100" aria-label="View axes">
          <circle cx="50" cy="50" r="8" fill="#d6d3df" opacity="0.7" />
          {axes.map(({ axis, x, y, depth }) => (
            <g key={axis}>
              <line
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                stroke={colors[axis.slice(-1) as keyof typeof colors]}
                strokeWidth="2"
                opacity={depth < -0.1 ? 0.35 : 0.85}
              />
              <g
                role="button"
                aria-label={`View from ${label(axis)}`}
                tabIndex={0}
                className="orientation-axis"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("scene-view:axis", { detail: axis }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    window.dispatchEvent(new CustomEvent("scene-view:axis", { detail: axis }));
                  }
                }}
              >
                <title>{label(axis)} view</title>
                <circle
                  cx={x}
                  cy={y}
                  r={axis.startsWith("-") ? 7 : 10}
                  fill={colors[axis.slice(-1) as keyof typeof colors]}
                  fillOpacity={depth < -0.1 ? 0.35 : 1}
                />
                {!axis.startsWith("-") && (
                  <text
                    x={x}
                    y={y + 3.5}
                    textAnchor="middle"
                    fill="#171820"
                    fontSize="10"
                    fontWeight="bold"
                  >
                    {axis.toUpperCase()}
                  </text>
                )}
              </g>
            </g>
          ))}
        </svg>
        <button
          aria-label="Toggle scene projection"
          title="Switch Perspective / Orthographic"
          onClick={() => window.dispatchEvent(new Event("scene-view:projection"))}
        >
          {orthographic ? "Ortho" : "Persp"} ▾
        </button>
      </div>
    </ViewportHtml>
  );
}
