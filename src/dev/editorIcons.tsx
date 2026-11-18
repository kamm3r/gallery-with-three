export type SceneObjectKind = "world" | "group" | "mesh" | "light" | "camera" | "bone";

type IconProps = { size?: number };

const iconProps = (size = 14) => ({
  viewBox: "0 0 24 24",
  width: size,
  height: size,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function NodeTypeIcon({ kind, size }: { kind: SceneObjectKind; size?: number }) {
  const props = iconProps(size);
  switch (kind) {
    case "light":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
        </svg>
      );
    case "world":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
        </svg>
      );
    case "mesh":
      return (
        <svg {...props}>
          <path d="M12 2.8 21 7v10l-9 4.2L3 17V7l9-4.2Z" />
          <path d="M3 7l9 4.2L21 7M12 11.2v10" />
        </svg>
      );
    case "camera":
      return (
        <svg {...props}>
          <path d="M4 7.5h10.5v9H4z" />
          <path d="m14.5 10.5 5-2.5v8l-5-2.5z" />
        </svg>
      );
    case "bone":
      return (
        <svg {...props}>
          <path d="M7 7a2.2 2.2 0 1 1 2.7-2.6 2.2 2.2 0 1 1 2.6 2.7l4.6 4.6a2.2 2.2 0 1 1 2.7 2.6 2.2 2.2 0 1 1-2.6 2.7 2.2 2.2 0 1 1-2.7-2.6L9.7 10" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" strokeDasharray="3 3" />
          <circle cx="12" cy="12" r="2.2" />
        </svg>
      );
  }
}

export function EyeIcon({ visible, size }: { visible: boolean } & IconProps) {
  const props = iconProps(size);
  return (
    <svg {...props}>
      <path d="M2.8 12S6.3 6.8 12 6.8 21.2 12 21.2 12 17.7 17.2 12 17.2 2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.7" />
      {!visible && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function LockIcon({ locked, size }: { locked: boolean } & IconProps) {
  const props = iconProps(size);
  return (
    <svg {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="1.6" />
      <path
        d={locked ? "M8.2 10.5V7.9a3.8 3.8 0 0 1 7.6 0v2.6" : "M8.2 10.5V8a3.8 3.8 0 0 1 7.3-1.8"}
      />
    </svg>
  );
}

export function ChevronIcon({ open, size = 12 }: { open: boolean; size?: number }) {
  return (
    <svg {...iconProps(size)}>
      <path d={open ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

export function RevertIcon({ size = 12 }: IconProps) {
  return (
    <svg {...iconProps(size)}>
      <path d="M4 5v5h5" />
      <path d="M4.6 10a7.5 7.5 0 1 1 .9 5.4" />
    </svg>
  );
}
