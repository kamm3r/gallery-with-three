import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { NodeContextMenu, type NodeMenuItem } from "./NodeContextMenu";
import type { EditorPreferences } from "./editorPreferences";

const paths = {
  add: "M8 3v10M3 8h10",
  duplicate: "M5 5h9v9H5zM2 11V2h9",
  delete: "M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10M7 7v4M9 7v4",
  world: "M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0M2 8h12M8 2c-4 4-4 8 0 12 4-4 4-8 0-12",
  local: "M8 1l6 3v8l-6 3-6-3V4zM2 4l6 3 6-3M8 7v8",
  center: "M3 3h10v10H3zM8 1v5m0 4v5M1 8h5m4 0h5",
  pivot: "M3 3h10v10H3zM3 8v5h5M1 13h7M3 8v7",
  snap: "M3 2v7a5 5 0 0 0 10 0V2h-3v7a2 2 0 0 1-4 0V2zM3 5h3m4 0h3",
  perspective: "M1 4l9-2 5 3-1 8-9 1-4-4zM1 4l4 3 10-2M5 7v7",
  orthographic: "M3 3h10v10H3zM3 6h10M6 3v10M1 1h4M1 1v4",
  shaded: "M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0M8 2v12M8 2C3 5 3 11 8 14",
  wireframe: "M8 1l6 4v6l-6 4-6-4V5zM2 5h12M2 11h12M8 1v14M2 5l12 6M14 5L2 11",
  grid: "M2 2h12v12H2zM2 6h12M2 10h12M6 2v12M10 2v12",
  gizmos: "M8 2a4 4 0 0 1 3 7l-1 2H6L5 9a4 4 0 0 1 3-7M6 13h4M7 15h2",
  collider: "M8 1l6 3v8l-6 3-6-3V4zM2 4l6 3 6-3M8 7v8M5 5v7m6-7v7",
  camera: "M1 4h10v9H1zM11 7l4-3v9l-4-3M4 4l1-2h3l2 2",
  settings:
    "M8 1v2m0 10v2M1 8h2m10 0h2M3 3l2 2m6 6 2 2M3 13l2-2m6-6 2-2M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
} as const;
type IconName = keyof typeof paths;
function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={paths[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
type Flag = "gizmos" | "preview" | "wireframe" | "grid" | "colliders";
export function CompactViewportBar({
  ready,
  canDuplicate,
  canDelete,
  duplicate,
  remove,
  add,
  projection,
  flags,
  toggleFlag,
  preferences,
  setPreferences,
  snapping,
  snapValue,
  snapBounds,
  snapUnit,
  updateSnap,
}: {
  ready: boolean;
  canDuplicate: boolean;
  canDelete: boolean;
  duplicate: () => void;
  remove: () => void;
  add: (shape: "box" | "sphere" | "cylinder" | "cone") => void;
  projection: string;
  flags: Record<Flag, boolean>;
  toggleFlag: (flag: Flag) => void;
  preferences: EditorPreferences;
  setPreferences: Dispatch<SetStateAction<EditorPreferences>>;
  snapping: boolean;
  snapValue: number;
  snapBounds: number[];
  snapUnit: string;
  updateSnap: (value: number) => void;
}) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    type: "create" | "shading" | "options";
  } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => {
    setMenu(null);
    trigger.current?.focus();
  }, []);
  const open = (button: HTMLButtonElement, type: "create" | "shading" | "options") => {
    const rect = button.getBoundingClientRect();
    trigger.current = button;
    setMenu({ x: rect.x, y: rect.bottom + 2, type });
  };
  const frame = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF" }));
  const items: NodeMenuItem[] =
    menu?.type === "create"
      ? (["box", "sphere", "cylinder", "cone"] as const).map((shape) => ({
          label: `Add ${shape[0].toUpperCase()}${shape.slice(1)}`,
          icon: "◇",
          action: () => add(shape),
        }))
      : menu?.type === "shading"
        ? [
            {
              label: "Shaded",
              icon: flags.wireframe ? "" : "✓",
              action: () => {
                if (flags.wireframe) toggleFlag("wireframe");
              },
            },
            {
              label: "Wireframe",
              icon: flags.wireframe ? "✓" : "",
              action: () => {
                if (!flags.wireframe) toggleFlag("wireframe");
              },
            },
          ]
        : [
            { label: "Frame Selection", shortcut: "F", icon: "⊙", action: frame },
            {
              label: "Reset View",
              icon: "↶",
              action: () => window.dispatchEvent(new Event("scene-view:reset")),
            },
            ...(
              [
                ["gizmos", "Light and Camera Icons"],
                ["preview", "Camera Preview"],
                ["grid", "Grid"],
                ["colliders", "Colliders"],
              ] as const
            ).map(([key, label], index) => ({
              label,
              icon: flags[key] ? "✓" : "",
              separator: index === 0,
              action: () => toggleFlag(key),
            })),
          ];
  const button = (name: IconName, label: string, action: () => void, pressed?: boolean) => (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} onClick={action}>
      <Icon name={name} />
    </button>
  );
  return (
    <div className="compact-viewport-bar" role="toolbar" aria-label="Scene viewport settings">
      <button
        type="button"
        disabled={!ready}
        aria-label="Add object"
        title="Add object"
        aria-haspopup="menu"
        aria-expanded={menu?.type === "create"}
        className="has-dropdown"
        onClick={(event) => open(event.currentTarget, "create")}
      >
        <Icon name="add" />
        <span>▾</span>
      </button>
      <button
        type="button"
        disabled={!canDuplicate}
        aria-label="Duplicate"
        title="Duplicate (Ctrl+D)"
        onClick={duplicate}
      >
        <Icon name="duplicate" />
      </button>
      <button
        type="button"
        disabled={!canDelete}
        aria-label="Delete"
        title="Delete"
        onClick={remove}
      >
        <Icon name="delete" />
      </button>
      <i />
      {button(
        preferences.space === "world" ? "world" : "local",
        `Transform space: ${preferences.space === "world" ? "World" : "Local"}`,
        () =>
          setPreferences((current) => ({
            ...current,
            space: current.space === "world" ? "local" : "world",
          })),
      )}
      {button(
        preferences.pivot === "center" ? "center" : "pivot",
        `Handle position: ${preferences.pivot === "center" ? "Center" : "Pivot"}`,
        () =>
          setPreferences((current) => ({
            ...current,
            pivot: current.pivot === "center" ? "pivot" : "center",
          })),
      )}
      {button(
        "snap",
        "Grid snapping (hold Ctrl temporarily)",
        () =>
          setPreferences((current) => ({
            ...current,
            snap: { ...current.snap, enabled: !current.snap.enabled },
          })),
        preferences.snap.enabled,
      )}
      {snapping && (
        <input
          type="number"
          aria-label={`Snap increment (${snapUnit})`}
          title={`Snap increment (${snapUnit})`}
          min={snapBounds[0]}
          max={snapBounds[1]}
          step={snapBounds[2]}
          value={snapValue}
          onChange={(event) => updateSnap(event.currentTarget.valueAsNumber)}
        />
      )}
      <span className="compact-viewport-spacer" />
      {button(
        projection === "Orthographic" ? "orthographic" : "perspective",
        "Toggle scene projection",
        () => window.dispatchEvent(new Event("scene-view:projection")),
      )}
      <button
        type="button"
        aria-label="Shading mode"
        title={`Shading: ${flags.wireframe ? "Wireframe" : "Shaded"}`}
        aria-haspopup="menu"
        aria-expanded={menu?.type === "shading"}
        className="has-dropdown"
        onClick={(event) => open(event.currentTarget, "shading")}
      >
        <Icon name={flags.wireframe ? "wireframe" : "shaded"} />
        <span>▾</span>
      </button>
      <i />
      {button("gizmos", "Light and camera icons", () => toggleFlag("gizmos"), flags.gizmos)}
      {button("grid", "Grid", () => toggleFlag("grid"), flags.grid)}
      {button("collider", "Colliders", () => toggleFlag("colliders"), flags.colliders)}
      {button("camera", "Camera preview", () => toggleFlag("preview"), flags.preview)}
      <button
        type="button"
        aria-label="Viewport options"
        title="Viewport options"
        aria-haspopup="menu"
        aria-expanded={menu?.type === "options"}
        className="has-dropdown"
        onClick={(event) => open(event.currentTarget, "options")}
      >
        <Icon name="settings" />
        <span>▾</span>
      </button>
      {menu && (
        <NodeContextMenu
          title={
            menu.type === "create" ? "Create" : menu.type === "shading" ? "Shading" : "Viewport"
          }
          ariaLabel="Viewport menu"
          x={menu.x}
          y={menu.y}
          items={items}
          close={close}
        />
      )}
    </div>
  );
}
