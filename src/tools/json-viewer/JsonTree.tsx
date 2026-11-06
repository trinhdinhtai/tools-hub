import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JsonNode } from "./logic";
import { hasChildren, nodeLabel, treeChildren, valueType, type TreeChild, type ValueType } from "./tree";

/** Rows shown at once under one container; more come on request, so a huge array does not render all at once. */
const PAGE = 200;

const VALUE_COLORS: Record<ValueType, string> = {
  object: "text-muted-foreground",
  array: "text-muted-foreground",
  string: "text-[light-dark(#15803d,#4ade80)]",
  number: "text-[light-dark(#1d4ed8,#60a5fa)]",
  boolean: "text-[light-dark(#1d4ed8,#60a5fa)]",
  null: "text-muted-foreground italic",
};

const ITEM = '[role="treeitem"]';

function focusItem(item: Element | null | undefined) {
  if (item instanceof HTMLElement) item.focus();
}

/** The rows under a container; at the root, the first row is the one Tab reaches. */
function Children({ node, depth, sortKeys }: { node: JsonNode; depth: number; sortKeys: boolean }) {
  const { t } = useTranslation("json-viewer");
  const [shown, setShown] = useState(PAGE);
  const children = treeChildren(node, { sortKeys });
  return (
    <>
      {children.slice(0, shown).map((child, i) => (
        <Item key={i} child={child} depth={depth} sortKeys={sortKeys} first={depth === 0 && i === 0} />
      ))}
      {children.length > shown && (
        <li role="none" style={{ paddingInlineStart: depth * 16 + 24 }}>
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="rounded px-1 text-xs text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t("tree.showMore", { count: Math.min(PAGE, children.length - shown) })}
          </button>
        </li>
      )}
    </>
  );
}

function Item({ child, depth, sortKeys, first }: { child: TreeChild; depth: number; sortKeys: boolean; first?: boolean }) {
  const { node, key, label } = child;
  const container = hasChildren(node);
  const [open, setOpen] = useState(false);

  function onKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.target !== event.currentTarget) return;
    const item = event.currentTarget;
    if (event.key === "ArrowRight" && container) {
      if (open) focusItem(item.querySelector(ITEM));
      else setOpen(true);
    } else if (event.key === "ArrowLeft") {
      if (container && open) setOpen(false);
      else focusItem(item.parentElement?.closest(ITEM));
    } else if ((event.key === "Enter" || event.key === " ") && container) {
      setOpen(!open);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <li
      role="treeitem"
      aria-expanded={container ? open : undefined}
      tabIndex={first ? 0 : -1}
      onKeyDown={onKeyDown}
      className="rounded outline-none focus-visible:[&>div]:bg-accent focus-visible:[&>div]:ring-2 focus-visible:[&>div]:ring-ring"
    >
      <div
        onClick={container ? () => setOpen(!open) : undefined}
        style={{ paddingInlineStart: depth * 16 }}
        className={cn("flex min-w-0 items-center gap-1 rounded px-1 py-0.5", container && "cursor-pointer hover:bg-accent/60")}
      >
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90", !container && "invisible")}
        />
        <span className={cn("shrink-0", typeof key === "number" ? "text-muted-foreground" : "text-foreground")}>{key}</span>
        <span aria-hidden className="text-muted-foreground">
          :
        </span>
        <span className={cn("truncate", VALUE_COLORS[valueType(node)])}>{label}</span>
      </div>
      {container && open && (
        <ul role="group">
          <Children node={node} depth={depth + 1} sortKeys={sortKeys} />
        </ul>
      )}
    </li>
  );
}

/** A collapsible tree of parsed JSON: the members of the root, each opened on request. */
export function JsonTree({ node, label, sortKeys, className }: { node: JsonNode; label: string; sortKeys: boolean; className?: string }) {
  // A scalar or an empty root has no members to list, so it is its own single row.
  const single = !hasChildren(node);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(ITEM)];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const target =
      event.key === "ArrowDown" ? items[index + 1] : event.key === "ArrowUp" ? items[index - 1] : event.key === "Home" ? items[0] : event.key === "End" ? items.at(-1) : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  return (
    <ul
      role="tree"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("overflow-auto rounded-lg border border-input bg-card p-2 font-mono text-[13px] leading-5", className)}
    >
      {single ? (
        <Item child={{ key: "$", node, label: nodeLabel(node) }} depth={0} sortKeys={sortKeys} first />
      ) : (
        <Children node={node} depth={0} sortKeys={sortKeys} />
      )}
    </ul>
  );
}
