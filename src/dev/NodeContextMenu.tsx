import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export type NodeMenuItem = {
  label: string;
  shortcut?: string;
  reason?: string;
  icon?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  action: () => void;
};

export function NodeContextMenu({
  x,
  y,
  title,
  items,
  close,
  ariaLabel,
}: {
  x: number;
  y: number;
  title: string;
  ariaLabel?: string;
  items: NodeMenuItem[];
  close: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(6, Math.min(x, innerWidth - rect.width - 6))}px`;
    node.style.top = `${Math.max(6, Math.min(y, innerHeight - rect.height - 6))}px`;
    node.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!node.contains(event.target as Node)) close();
    };
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", close);
    };
  }, [x, y, close]);
  return createPortal(
    <div
      ref={menu}
      className="scene-node-menu"
      role="menu"
      aria-label={ariaLabel ?? `Node actions for ${title}`}
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        const buttons = Array.from(
          menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
        );
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape" || event.key === "Tab") close();
        else if (event.key === "ArrowDown") buttons[(index + 1) % buttons.length]?.focus();
        else if (event.key === "ArrowUp")
          buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
        else if (event.key === "Home") buttons[0]?.focus();
        else if (event.key === "End") buttons.at(-1)?.focus();
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="scene-node-menu-title">{title}</div>
      {items.map((item) => (
        <div key={item.label} role="none">
          {item.separator && <div className="scene-node-menu-separator" role="separator" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            title={item.disabled ? item.reason : undefined}
            className={item.danger ? "is-danger" : undefined}
            onClick={() => {
              close();
              item.action();
            }}
          >
            <span className="scene-node-menu-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
