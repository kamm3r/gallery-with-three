export type LayoutName = "scene" | "assets";
export type WorkspaceLayout = {
  sizes: { left: number; right: number; bottom: number };
  open: boolean;
};
type WorkspaceSettings = { active: LayoutName; layouts: Record<LayoutName, WorkspaceLayout> };
const key = "painted-forest.editor-layout.v1";
export function readWorkspaceLayouts(): WorkspaceSettings {
  const result: WorkspaceSettings = {
    active: "scene",
    layouts: {
      scene: { sizes: { left: 224, right: 300, bottom: 184 }, open: true },
      assets: { sizes: { left: 224, right: 300, bottom: 270 }, open: true },
    },
  };
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!saved) return result;
    if (["scene", "assets"].includes(saved.active ?? saved.layout))
      result.active = saved.active ?? saved.layout;
    for (const name of ["scene", "assets"] as const) {
      const layout = saved.layouts?.[name] ?? (saved.layout === name ? saved : null);
      if (
        !layout?.sizes ||
        ![layout.sizes.left, layout.sizes.right, layout.sizes.bottom].every(
          (n) => typeof n === "number" && Number.isFinite(n),
        )
      )
        continue;
      result.layouts[name] = {
        open: layout.open !== false,
        sizes: {
          left: Math.max(140, Math.min(400, layout.sizes.left)),
          right: Math.max(200, Math.min(500, layout.sizes.right)),
          bottom: Math.max(100, Math.min(400, layout.sizes.bottom)),
        },
      };
    }
  } catch {
    /* Use default layouts if storage is unavailable or invalid. */
  }
  return result;
}
export function rememberWorkspaceLayout(name: LayoutName, layout?: WorkspaceLayout) {
  const settings = readWorkspaceLayouts();
  settings.active = name;
  if (layout) settings.layouts[name] = layout;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    /* The active session remains usable. */
  }
}
