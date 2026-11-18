import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Object3D } from "three";
import { assetThumbnail, sceneThumbnail } from "./assetThumbnails";
import { assetSize, type AssetEntry } from "./assetTypes";
export type SceneResource = {
  id: string;
  name: string;
  kind: "Mesh" | "Material";
  object: Object3D;
  color?: string;
  ownerId?: string;
  ownerName?: string;
};
function FolderIcon() {
  return (
    <svg viewBox="0 0 64 52" aria-hidden="true">
      <path d="M3 6h22l6 7h30v32H3z" fill="#a8a9ad" />
      <path d="M3 14h58v32H3z" fill="#c7c8cc" />
    </svg>
  );
}
function Thumbnail({ asset, resource }: { asset?: AssetEntry; resource?: SceneResource }) {
  const host = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void (
        asset
          ? assetThumbnail(asset)
          : resource
            ? sceneThumbnail(resource.object, resource.id, resource.kind, resource.color)
            : Promise.resolve(null)
      ).then((value) => {
        if (active) setUrl(value);
      });
    });
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [asset, resource?.id, resource?.object, resource?.kind, resource?.color]);
  return (
    <span ref={host} className="project-thumbnail">
      {asset?.kind === "folder" ? (
        <FolderIcon />
      ) : asset?.kind === "image" ? (
        <img src={asset.url} alt="" loading="lazy" />
      ) : url ? (
        <img src={url} alt="" />
      ) : (
        <span className="project-file-icon">
          {asset?.kind === "audio"
            ? "♫"
            : asset?.kind === "file"
              ? "▤"
              : resource?.kind === "Material"
                ? "●"
                : "◇"}
        </span>
      )}
    </span>
  );
}
export function ProjectBrowser({
  resources,
  open,
  toggleOpen,
  selectResource,
  openResource,
  selectedAsset,
  selectAsset,
}: {
  resources: SceneResource[];
  open: boolean;
  toggleOpen: () => void;
  selectResource: (resource: SceneResource) => void;
  openResource: (resource: SceneResource) => void;
  selectedAsset: AssetEntry | null;
  selectAsset: (asset: AssetEntry) => void;
}) {
  const [tab, setTab] = useState<"project" | "scene">("project");
  const [folder, setFolder] = useState("");
  const [folderIndex, setFolderIndex] = useState<Map<string, AssetEntry[]>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"Mesh" | "Material">("Mesh");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState(72);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open || tab !== "project") return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch(`/__editor/assets?folder=${encodeURIComponent(folder)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Cannot read Assets");
        setFolderIndex((current) => new Map(current).set(folder, payload.entries as AssetEntry[]));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Cannot read Assets");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [folder, tab, open, revision]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    if (!open || tab !== "project") return;
    const missing = [...expanded].filter((path) => path !== folder && !folderIndex.has(path));
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.allSettled(
      missing.map(async (path) => {
        const response = await fetch(`/__editor/assets?folder=${encodeURIComponent(path)}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Cannot read folder");
        return { path, entries: payload.entries as AssetEntry[] };
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      if (results.some((result) => result.status === "fulfilled"))
        setFolderIndex((current) => {
          const next = new Map(current);
          for (const result of results)
            if (result.status === "fulfilled") next.set(result.value.path, result.value.entries);
          return next;
        });
    });
    return () => controller.abort();
  }, [expanded, folderIndex, folder, tab, open]);
  const toggleFolder = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const navigate = (path: string) => {
    setFolder(path);
    setQuery("");
    setExpanded(
      (current) =>
        new Set([
          ...current,
          path,
          ...path.split("/").map((_, index, list) => list.slice(0, index).join("/")),
        ]),
    );
  };
  const tree = (path: string, depth: number): ReactNode => (
    <div key={path}>
      <button
        className={`project-folder-row${folder === path ? " selected" : ""}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => navigate(path)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" && !expanded.has(path)) {
            event.preventDefault();
            toggleFolder(path);
          }
          if (event.key === "ArrowLeft" && expanded.has(path)) {
            event.preventDefault();
            toggleFolder(path);
          }
        }}
        onDoubleClick={() =>
          setExpanded((current) => {
            const next = new Set(current);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
          })
        }
      >
        <span
          className="project-folder-disclosure"
          aria-hidden="true"
          onClick={(event) => {
            event.stopPropagation();
            toggleFolder(path);
          }}
        >
          {expanded.has(path) ? "▾" : "▸"}
        </span>
        <FolderIcon />
        <span>{path.split("/").at(-1) || "Assets"}</span>
      </button>
      {expanded.has(path) &&
        (folderIndex.get(path) ?? [])
          .filter((entry) => entry.kind === "folder")
          .map((entry) => tree(entry.path, depth + 1))}
    </div>
  );
  const entries = (folderIndex.get(folder) ?? []).filter((entry) =>
    entry.name.toLowerCase().includes(query.toLowerCase()),
  );
  const sceneEntries = resources.filter(
    (entry) => entry.kind === kind && entry.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="project-browser-header">
        <button
          className="project-drawer-toggle"
          aria-label={open ? "Collapse Project browser" : "Expand Project browser"}
          aria-expanded={open}
          onClick={toggleOpen}
        >
          ▤
        </button>
        <button
          aria-pressed={tab === "project"}
          onClick={() => {
            setTab("project");
            if (!open) toggleOpen();
          }}
        >
          Project
        </button>
        <button
          aria-pressed={tab === "scene"}
          onClick={() => {
            setTab("scene");
            if (!open) toggleOpen();
          }}
        >
          Scene Resources
        </button>
        <input
          aria-label="Search current asset folder"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <button
          aria-label="Refresh Assets"
          title="Refresh Assets"
          onClick={() => setRevision((value) => value + 1)}
        >
          ↻
        </button>
        <input
          type="range"
          aria-label="Thumbnail size"
          title="Thumbnail size"
          min={48}
          max={112}
          value={size}
          onChange={(event) => setSize(Number(event.currentTarget.value))}
        />
      </div>
      {open && (
        <div className="project-browser-body">
          <div className="project-folder-tree">
            {tab === "project" ? (
              tree("", 0)
            ) : (
              <>
                <button
                  className="project-folder-row"
                  aria-pressed={kind === "Mesh"}
                  onClick={() => setKind("Mesh")}
                >
                  ◇ Meshes
                </button>
                <button
                  className="project-folder-row"
                  aria-pressed={kind === "Material"}
                  onClick={() => setKind("Material")}
                >
                  ● Materials
                </button>
              </>
            )}
          </div>
          <div className="project-browser-content">
            <nav className="project-breadcrumbs" aria-label="Asset folder path">
              {tab === "scene" ? (
                `Scene / ${kind === "Mesh" ? "Meshes" : "Materials"}`
              ) : (
                <>
                  <button onClick={() => navigate("")}>Assets</button>
                  {folder
                    .split("/")
                    .filter(Boolean)
                    .map((part, index, list) => (
                      <span key={index}>
                        {" "}
                        ›{" "}
                        <button onClick={() => navigate(list.slice(0, index + 1).join("/"))}>
                          {part}
                        </button>
                      </span>
                    ))}
                </>
              )}
            </nav>
            <div
              className="project-thumbnail-grid"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}
            >
              {tab === "project"
                ? entries.map((entry) => (
                    <button
                      key={entry.path}
                      draggable={entry.kind === "model"}
                      onDragStart={(event) => {
                        if (entry.kind !== "model") return;
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData(
                          "application/x-playground-model",
                          JSON.stringify({
                            assetUrl: entry.url,
                            name: entry.name.replace(/\.(glb|gltf)$/i, ""),
                          }),
                        );
                      }}
                      className={selectedAsset?.path === entry.path ? "selected" : ""}
                      title={`${entry.name}${entry.kind === "folder" ? "" : ` · ${assetSize(entry.size)}`}`}
                      onClick={() =>
                        entry.kind === "folder" ? navigate(entry.path) : selectAsset(entry)
                      }
                      onDoubleClick={() => {
                        if (entry.kind === "folder") navigate(entry.path);
                        else selectAsset(entry);
                      }}
                    >
                      <Thumbnail asset={entry} />
                      <span>{entry.name}</span>
                    </button>
                  ))
                : sceneEntries.map((entry) => (
                    <button
                      key={entry.id}
                      title={entry.name}
                      onClick={() => selectResource(entry)}
                      onDoubleClick={() => openResource(entry)}
                    >
                      <Thumbnail resource={entry} />
                      <span>{entry.name}</span>
                    </button>
                  ))}
            </div>
            {error ? (
              <p className="project-browser-message" role="alert">
                {error}
              </p>
            ) : loading ? (
              <p className="project-browser-message">Loading…</p>
            ) : (
              (tab === "project" ? entries : sceneEntries).length === 0 && (
                <p className="project-browser-message">No matching assets.</p>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
