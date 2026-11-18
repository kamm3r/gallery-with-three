import { NodeContextMenu, type NodeMenuItem } from "./NodeContextMenu";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Object3D, Scene } from "three";
import { ChevronIcon, EyeIcon, LockIcon, NodeTypeIcon } from "./editorIcons";

import { buildRows, fingerprint, filterRows, countRows, type TreeRow } from "./sceneGraph";
import {
  selectSceneObject,
  selectSceneObjects,
  toggleSceneObject,
  getSelectedIds,
  subscribeSelection,
} from "./sceneSelection";

export type NodeCommand =
  | "copy"
  | "cut"
  | "paste"
  | "duplicate"
  | "delete"
  | "add-box"
  | "add-sphere"
  | "add-cylinder"
  | "add-cone";

export function SceneTree({
  scene,
  selectedId,
  canPaste,
  onCommand,
  readOnly = false,
}: {
  scene: Scene | null;
  selectedId: string | null;
  canPaste: boolean;
  readOnly?: boolean;
  onCommand: (command: NodeCommand, object: Object3D | null) => void;
}) {
  const selectedIds = useSyncExternalStore(subscribeSelection, getSelectedIds, getSelectedIds);
  const [rows, setRows] = useState<TreeRow[]>(() => buildRows(scene));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const tree = useRef<HTMLDivElement>(null);
  const seenBranches = useRef(new Set<string>());
  const [context, setContext] = useState<{ row: TreeRow; x: number; y: number } | null>(null);
  const contextTrigger = useRef<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [notice, setNotice] = useState("");
  const abortRename = useRef(false);
  const closeMenu = useCallback(() => {
    setContext(null);
    contextTrigger.current?.focus({ preventScroll: true });
  }, []);
  const openMenu = (row: TreeRow, x: number, y: number, trigger: HTMLElement) => {
    contextTrigger.current = trigger;
    selectSceneObject(row.object);
    setContext({ row, x, y });
  };
  const rename = (row: TreeRow) => {
    abortRename.current = false;
    setDraftName(row.label);
    setRenaming(row.id);
  };
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let current = "";
    const sync = () => {
      const next = buildRows(scene);
      const nextSignature = fingerprint(next);
      if (nextSignature === current) return;
      current = nextSignature;
      const newlyCollapsed: string[] = [];
      const visit = (items: TreeRow[]) =>
        items.forEach((row) => {
          if (row.children.length && !seenBranches.current.has(row.id)) {
            seenBranches.current.add(row.id);
            if (row.kind !== "world") newlyCollapsed.push(row.id);
          }
          visit(row.children);
        });
      visit(next);
      if (newlyCollapsed.length)
        setCollapsed((previous) => new Set([...previous, ...newlyCollapsed]));
      setRows(next);
    };
    sync();
    window.addEventListener("scene-view:document", sync);
    const poll = window.setInterval(sync, 700);
    return () => {
      window.removeEventListener("scene-view:document", sync);
      window.clearInterval(poll);
    };
  }, [scene]);

  const visibleRows = useMemo(() => filterRows(rows, query.trim()), [rows, query]);
  const filtering = query.trim().length > 0;
  const total = useMemo(() => Math.max(0, countRows(rows) - 1), [rows]);
  const shown = useMemo(() => Math.max(0, countRows(visibleRows) - 1), [visibleRows]);

  useEffect(() => {
    if (!selectedId) return;
    const ancestors: string[] = [];
    const find = (items: TreeRow[]): boolean =>
      items.some((row) => {
        if (row.id === selectedId) return true;
        if (!find(row.children)) return false;
        ancestors.push(row.id);
        return true;
      });
    find(rows);
    setCollapsed((current) => {
      if (!ancestors.some((id) => current.has(id))) return current;
      return new Set([...current].filter((id) => !ancestors.includes(id)));
    });
    const frame = requestAnimationFrame(() => {
      tree.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, rows]);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectNode = (object: Object3D | null) => {
    selectSceneObject(object);
  };

  const focusNode = (object: Object3D | null) => {
    if (!object) return;
    selectNode(object);
    requestAnimationFrame(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyF", bubbles: true })),
    );
  };

  const setProperty = (id: string, patch: { visible?: boolean; locked?: boolean }) =>
    window.dispatchEvent(new CustomEvent("scene-view:node-properties", { detail: { id, patch } }));

  const branch = (row: TreeRow, collapse: boolean) => {
    const ids: string[] = [];
    const collect = (node: TreeRow) => {
      if (node.children.length) ids.push(node.id);
      node.children.forEach(collect);
    };
    collect(row);
    setCollapsed((current) => {
      const next = new Set(current);
      ids.forEach((id) => (collapse ? next.add(id) : next.delete(id)));
      return next;
    });
  };
  const menuItems = (row: TreeRow): NodeMenuItem[] => {
    const root = row.kind === "world";
    const editable = Boolean(row.object);
    const branchCopy = row.children.length > 0;
    const command = (name: NodeCommand) => () => onCommand(name, row.object);
    return [
      ...(["box", "sphere", "cylinder", "cone"] as const).map((type, index) => ({
        label: `Add ${type[0].toUpperCase()}${type.slice(1)}`,
        icon: index === 0 ? "+" : "◇",
        action: command(`add-${type}`),
      })),
      {
        label: "Frame Selected",
        icon: "⊙",
        shortcut: "F",
        separator: true,
        disabled: !editable,
        action: () => focusNode(row.object),
      },
      {
        label: "Expand Branch",
        icon: "⌄",
        disabled: !row.children.length,
        action: () => branch(row, false),
      },
      {
        label: "Collapse Branch",
        icon: "›",
        disabled: !row.children.length,
        action: () => branch(row, true),
      },
      {
        label: "Cut",
        icon: "✂",
        shortcut: "Ctrl+X",
        separator: true,
        disabled: root || branchCopy || !editable,
        reason: "Copy or cut individual objects; branch copying is not supported yet.",
        action: command("cut"),
      },
      {
        label: "Copy",
        icon: "▣",
        shortcut: "Ctrl+C",
        disabled: root || branchCopy || !editable,
        reason: "Copy individual objects; branch copying is not supported yet.",
        action: command("copy"),
      },
      {
        label: "Paste",
        icon: "▤",
        shortcut: "Ctrl+V",
        disabled: !canPaste,
        action: command("paste"),
      },
      {
        label: "Duplicate",
        icon: "⧉",
        shortcut: "Ctrl+D",
        disabled: root || branchCopy || !editable,
        reason: "Duplicate individual objects; branch duplication is not supported yet.",
        action: command("duplicate"),
      },
      {
        label: "Rename",
        icon: "I",
        shortcut: "F2",
        separator: true,
        disabled: !editable,
        action: () => rename(row),
      },
      ...(!root
        ? [
            {
              label: row.visible ? "Hide" : "Show",
              icon: "◉",
              action: () => setProperty(row.id, { visible: !row.visible }),
            },
            {
              label: row.locked ? "Unlock" : "Lock",
              icon: "◇",
              action: () => setProperty(row.id, { locked: !row.locked }),
            },
          ]
        : []),
      {
        label: "Copy Node Path",
        icon: "↗",
        separator: true,
        disabled: !editable,
        action: () => {
          const names: string[] = [];
          for (let node = row.object; node; node = node.parent) {
            if (node.userData.sceneObjectId)
              names.unshift(node.name || node.userData.sceneObjectId);
          }
          void (
            navigator.clipboard?.writeText(`/${names.join("/")}`) ??
            Promise.reject(new Error("Clipboard unavailable"))
          )
            .then(() => setNotice("Node path copied"))
            .catch(() => setNotice("The browser could not copy the node path"));
        },
      },
      {
        label: "Delete",
        icon: "▥",
        shortcut: "Delete",
        danger: true,
        separator: true,
        disabled: root || !editable,
        action: command("delete"),
      },
    ];
  };

  const renderRow = (row: TreeRow, depth: number): ReactNode => {
    const hasChildren = row.children.length > 0;
    const open = filtering || !collapsed.has(row.id);
    const selected = row.object !== null && (selectedIds.includes(row.id) || row.id === selectedId);
    const root = row.kind === "world";
    return (
      <div key={row.id} role="none">
        <div
          role="treeitem"
          tabIndex={selected || (!selectedId && root) ? 0 : -1}
          aria-level={depth + 1}
          aria-selected={selected}
          aria-expanded={hasChildren ? open : undefined}
          className={[
            "outliner-node",
            selected ? "selected" : "",
            row.visible ? "" : "hidden",
            row.locked ? "locked" : "",
            root ? "root" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ paddingLeft: 3 + depth * 12 }}
          onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            if ((event.ctrlKey || event.metaKey) && scene) toggleSceneObject(row.object, scene);
            else if (event.shiftKey && selectedId) {
              const flat: TreeRow[] = [];
              const visit = (items: TreeRow[]) =>
                items.forEach((item) => {
                  flat.push(item);
                  if (filtering || !collapsed.has(item.id)) visit(item.children);
                });
              visit(visibleRows);
              const start = flat.findIndex((item) => item.id === selectedId),
                end = flat.findIndex((item) => item.id === row.id);
              if (start >= 0 && end >= 0)
                selectSceneObjects(
                  flat
                    .slice(Math.min(start, end), Math.max(start, end) + 1)
                    .flatMap((item) => (item.object ? [item.object] : [])),
                );
            } else selectNode(row.object);
          }}
          onDoubleClick={() => focusNode(row.object)}
          onContextMenu={(event) => {
            if (readOnly) return;
            event.preventDefault();
            event.stopPropagation();
            openMenu(row, event.clientX, event.clientY, event.currentTarget);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "F2" && !readOnly) {
              event.preventDefault();
              rename(row);
              return;
            }
            if (
              !readOnly &&
              (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
            ) {
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu(row, rect.x + 20, rect.bottom, event.currentTarget);
              return;
            }
            const items = Array.from(
              tree.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
            );
            const index = items.indexOf(event.currentTarget);
            let target: HTMLElement | undefined;
            if (event.key === "ArrowDown") target = items[index + 1];
            else if (event.key === "ArrowUp") target = items[index - 1];
            else if (event.key === "Home") target = items[0];
            else if (event.key === "End") target = items.at(-1);
            else if (event.key === "ArrowRight") {
              if (hasChildren && !open) toggle(row.id);
              else if (hasChildren) target = items[index + 1];
            } else if (event.key === "ArrowLeft") {
              if (hasChildren && open) toggle(row.id);
              else
                target = items
                  .slice(0, index)
                  .reverse()
                  .find((item) => Number(item.getAttribute("aria-level")) < depth + 1);
            } else if (event.key === "Enter" || event.key === " ") selectNode(row.object);
            else return;
            event.preventDefault();
            event.stopPropagation();
            target?.click();
          }}
        >
          {hasChildren ? (
            <button
              className="scene-tree-toggle"
              aria-label={`${open ? "Collapse" : "Expand"} ${row.label}`}
              onClick={(event) => {
                event.stopPropagation();
                toggle(row.id);
              }}
            >
              <ChevronIcon open={open} />
            </button>
          ) : (
            <span className="scene-tree-toggle" aria-hidden="true" />
          )}
          <span className={`node-icon kind-${row.kind}`}>
            <NodeTypeIcon kind={row.kind} />
          </span>
          {renaming === row.id ? (
            <input
              autoFocus
              aria-label="Rename node"
              className="scene-node-rename"
              value={draftName}
              maxLength={120}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => setDraftName(event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Escape") {
                  abortRename.current = true;
                  event.currentTarget.blur();
                } else if (event.key === "Enter") event.currentTarget.blur();
              }}
              onBlur={() => {
                const name = draftName.trim();
                if (!abortRename.current && name && name !== row.label)
                  window.dispatchEvent(
                    new CustomEvent("scene-view:node-properties", {
                      detail: { id: row.id, patch: { name } },
                    }),
                  );
                setRenaming(null);
              }}
            />
          ) : (
            <span className="node-name">{row.label}</span>
          )}
          {!root && (
            <span className="scene-tree-actions">
              <button
                disabled={readOnly}
                className="scene-tree-action scene-tree-visibility"
                aria-label={`${row.visible ? "Hide" : "Show"} ${row.label}`}
                aria-pressed={row.visible}
                title={row.visible ? "Hide node" : "Show node"}
                onClick={(event) => {
                  event.stopPropagation();
                  setProperty(row.id, { visible: !row.visible });
                }}
              >
                <EyeIcon visible={row.visible} size={13} />
              </button>
              <button
                disabled={readOnly}
                className="scene-tree-action scene-tree-lock"
                aria-label={`${row.locked ? "Unlock" : "Lock"} ${row.label}`}
                aria-pressed={row.locked}
                title={row.locked ? "Unlock node" : "Lock node"}
                onClick={(event) => {
                  event.stopPropagation();
                  setProperty(row.id, { locked: !row.locked });
                }}
              >
                <LockIcon locked={row.locked} size={13} />
              </button>
            </span>
          )}
        </div>
        {hasChildren && open && (
          <div role="group">{row.children.map((child) => renderRow(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <section className="editor-panel editor-scene-tree" aria-label="Scene tree">
      <header className="editor-panel-header">
        <span
          className="editor-panel-title"
          title={filtering ? `${shown} of ${total} nodes` : `${total} nodes`}
        >
          Hierarchy
        </span>
        <div className="scene-tree-tools">
          <button
            disabled={readOnly}
            aria-label="Scene node actions"
            title="Node actions"
            onClick={(event) => {
              const find = (nodes: TreeRow[]): TreeRow | undefined => {
                for (const node of nodes) {
                  if (node.id === selectedId) return node;
                  const match = find(node.children);
                  if (match) return match;
                }
              };
              const row = find(rows) ?? rows[0];
              if (!row) return;
              const rect = event.currentTarget.getBoundingClientRect();
              openMenu(row, rect.x, rect.bottom, event.currentTarget);
            }}
          >
            ⋮
          </button>
        </div>
      </header>
      <div className="scene-tree-filter">
        <input
          aria-label="Filter scene tree"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
        />
        {query && (
          <button aria-label="Clear scene filter" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>
      {notice && (
        <div className="scene-tree-notice" role="status">
          {notice}
        </div>
      )}
      <div
        className="scene-graph-container"
        onKeyDown={(event) => {
          if (event.key === "Escape") setQuery("");
        }}
      >
        <div
          ref={tree}
          className="scene-graph-tree"
          role="tree"
          aria-multiselectable="true"
          aria-label="Scene objects"
        >
          {visibleRows.length ? (
            visibleRows.map((row) => renderRow(row, 0))
          ) : (
            <p className="scene-tree-empty">
              {query.trim() ? `No nodes match “${query.trim()}”.` : "Loading scene…"}
            </p>
          )}
        </div>
      </div>
      {context && (
        <NodeContextMenu
          x={context.x}
          y={context.y}
          title={context.row.label}
          items={menuItems(context.row)}
          close={closeMenu}
        />
      )}
    </section>
  );
}
