export type ViewportTool = "hand" | "translate" | "rotate" | "scale";
const tools: { value: ViewportTool; label: string; key: string; path: string }[] = [
  {
    value: "hand",
    label: "Hand",
    key: "Q",
    path: "M7 11V5a1 1 0 0 1 2 0v4-6a1 1 0 0 1 2 0v6-5a1 1 0 0 1 2 0v5-3a1 1 0 0 1 2 0v6c0 4-2 6-5 6H9c-1 0-2-1-3-3l-3-5c-1-2 1-3 2-1l2 2",
  },
  {
    value: "translate",
    label: "Move",
    key: "W",
    path: "M10 2v16M2 10h16M7 5l3-3 3 3M7 15l3 3 3-3M5 7l-3 3 3 3M15 7l3 3-3 3",
  },
  { value: "rotate", label: "Rotate", key: "E", path: "M16 7a7 7 0 1 0 1 6M16 3v5h-5" },
  {
    value: "scale",
    label: "Scale",
    key: "R",
    path: "M3 12v5h5M12 3h5v5M3 17l5-5M17 3l-5 5M3 3h5v5H3zM12 12h5v5h-5z",
  },
];
export function ViewportTools({
  tool,
  onTool,
}: {
  tool: ViewportTool;
  onTool: (tool: ViewportTool) => void;
}) {
  return (
    <div className="viewport-tool-strip" role="toolbar" aria-label="Viewport tools">
      {tools.map(({ value, label, key, path }) => (
        <button
          key={value}
          aria-label={label}
          aria-pressed={tool === value}
          title={`${label} (${key})`}
          onClick={() => onTool(value)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}
