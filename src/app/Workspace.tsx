import { Suspense, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Star, X } from "lucide-react";
import { Hint } from "@/components/hint";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { usePreference } from "@/lib/preferences";
import { PasteContext, type PastedText } from "@/lib/paste";
import { NamespaceContext, toolNamespace } from "@/lib/preferences-context";
import type { ToolMeta } from "@/lib/tool";
import { cn } from "@/lib/utils";
import { TOOLS_NS } from "@/i18n";
import { toolsWithIds } from "./registry";
import { closeAll, closeOthers, closeRight, closeTool, openTool, restoreWorkspace, showTool, type Workspace } from "./open-tools";

const sameIds = (a: unknown, b: readonly string[]) => Array.isArray(a) && a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The Open Tools, restored from the Preferences when the app starts and saved back whenever they change. Only ids
 * are saved; Input lives in the mounted Tools. The saved list is rewritten if it ever differs from the tabs on
 * screen, so "Restore defaults" does not close tabs (and with them, Input the user did not ask to throw away).
 */
export function useWorkspace(tools: readonly ToolMeta[]) {
  const [savedIds, saveIds] = usePreference<string[]>("openTools");
  const [savedActive, saveActive] = usePreference<string>("activeTool");
  const [workspace, setWorkspace] = useState(() =>
    restoreWorkspace(
      savedIds,
      savedActive,
      tools.map((tool) => tool.id),
    ),
  );

  useEffect(() => {
    if (!sameIds(savedIds, workspace.ids)) saveIds([...workspace.ids]);
  }, [savedIds, saveIds, workspace.ids]);
  useEffect(() => {
    if (savedActive !== (workspace.active ?? "")) saveActive(workspace.active ?? "");
  }, [savedActive, saveActive, workspace.active]);

  const open = useCallback((id: string) => setWorkspace((current) => openTool(current, id)), []);
  return { workspace, setWorkspace, open };
}

type Change = (workspace: Workspace) => Workspace;

/** A pasted text on its way to the Open Tool it was picked for (Paste Detection). */
export interface Handoff extends PastedText {
  readonly toolId: string;
}

/**
 * One tab per Open Tool, and every Open Tool stays mounted: a tab not on screen is only hidden, so its Input and
 * anything it runs (a Stopwatch ticking) carry on. Closing a tab unmounts its Tool, which destroys its Input.
 */
export function WorkspaceView({
  tools,
  workspace,
  onChange,
  favorites,
  onToggleFavorite,
  handoff,
}: {
  tools: readonly ToolMeta[];
  workspace: Workspace;
  onChange: (change: Change) => void;
  favorites: readonly string[];
  onToggleFavorite: (id: string) => void;
  /** A pasted text waiting for the Open Tool it was picked for. */
  handoff: Handoff | null;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;
  const emptyId = `${baseId}-empty`;
  const openTools = toolsWithIds(tools, workspace.ids);

  // After a keyboard or menu action changes the tab on screen, focus follows it (to the empty state if none is left).
  const focusActive = useRef(false);
  useEffect(() => {
    if (!focusActive.current) return;
    focusActive.current = false;
    document.getElementById(workspace.active ? tabId(workspace.active) : emptyId)?.focus();
  });
  // A tab can be off the strip's edge when it is opened from the sidebar, the palette or a paste: bring it into view.
  useEffect(() => {
    if (workspace.active) document.getElementById(tabId(workspace.active))?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  });
  const changeAndFocus = (change: Change) => {
    focusActive.current = true;
    onChange(change);
  };

  const onKeyDown = (event: KeyboardEvent, id: string) => {
    const index = workspace.ids.indexOf(id);
    const last = workspace.ids.length - 1;
    const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: last }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      const next = workspace.ids[Math.min(Math.max(target, 0), last)]!;
      changeAndFocus((current) => showTool(current, next));
    } else if (event.key === "Delete") {
      event.preventDefault();
      changeAndFocus((current) => closeTool(current, id));
    }
  };

  if (openTools.length === 0) return <EmptyState headingId={emptyId} />;
  return (
    <div className="flex h-full flex-col">
      <div
        role="tablist"
        aria-label={t("tabs.label")}
        // The strip's bottom hairline is an inset shadow, so the tab on screen paints over it and joins its panel.
        className="no-scrollbar flex h-9 shrink-0 overflow-x-auto bg-sidebar px-3 pt-1 shadow-[inset_0_-1px_0_var(--tab-border)]"
      >
        {openTools.map((tool, index) => (
          <Tab
            key={tool.id}
            tool={tool}
            id={tabId(tool.id)}
            panel={panelId(tool.id)}
            active={tool.id === workspace.active}
            only={openTools.length === 1}
            last={index === openTools.length - 1}
            onKeyDown={(event) => onKeyDown(event, tool.id)}
            onChange={onChange}
            onMenuChange={changeAndFocus}
          />
        ))}
      </div>
      {openTools.map((tool) => (
        <div
          key={tool.id}
          role="tabpanel"
          id={panelId(tool.id)}
          aria-labelledby={tabId(tool.id)}
          hidden={tool.id !== workspace.active}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <PasteContext.Provider value={handoff?.toolId === tool.id ? handoff : null}>
            <ToolView tool={tool} favorite={favorites.includes(tool.id)} onToggleFavorite={() => onToggleFavorite(tool.id)} />
          </PasteContext.Provider>
        </div>
      ))}
    </div>
  );
}

/**
 * The tab on screen. Each bottom corner curves out: a square just outside the tab whose inner corner is rounded,
 * with the hairline drawn along the curve and a shadow in the panel's colour filling the space under it.
 */
const ACTIVE_TAB = cn(
  "z-10 border-tab-border bg-background text-foreground",
  // Each square is as wide as the top corners' radius (rounded-lg), so all four curves match.
  "before:pointer-events-none before:absolute before:bottom-0 before:-left-(--radius) before:size-(--radius) before:rounded-br-lg before:border-r before:border-b before:border-tab-border before:shadow-[calc(var(--radius)/2)_calc(var(--radius)/2)_0_calc(var(--radius)/2)_var(--background)]",
  "after:pointer-events-none after:absolute after:-right-(--radius) after:bottom-0 after:size-(--radius) after:rounded-bl-lg after:border-b after:border-l after:border-tab-border after:shadow-[calc(var(--radius)/-2)_calc(var(--radius)/2)_0_calc(var(--radius)/2)_var(--background)]",
);

function Tab({
  tool,
  id,
  panel,
  active,
  only,
  last,
  onKeyDown,
  onChange,
  onMenuChange,
}: {
  tool: ToolMeta;
  id: string;
  panel: string;
  active: boolean;
  only: boolean;
  last: boolean;
  onKeyDown: (event: KeyboardEvent) => void;
  onChange: (change: Change) => void;
  /** Menu actions take focus along to the tab left on screen: the menu's own trigger may have just closed. */
  onMenuChange: (change: Change) => void;
}) {
  const close = (current: Workspace) => closeTool(current, tool.id);
  const { t } = useTranslation();
  const { t: tTools } = useTranslation(TOOLS_NS);
  const name = tTools(`${tool.id}.name`);
  const Icon = tool.icon;
  return (
    <ContextMenu>
      {/* Right-click, Shift+F10 or the Menu key on a tab opens its menu. */}
      <ContextMenuTrigger
        render={<div role="presentation" />}
        className={cn(
          // Editor-style tabs. The tab on screen takes the panel's background, with rounded top corners, a hairline round
          // its top and sides, and bottom corners that curve out into the panel; the others sit on the strip, muted.
          // Tabs shrink to fit the strip (the name truncates) down to a floor, and only then does the strip scroll.
          "group/tab relative flex h-full max-w-56 min-w-24 items-center rounded-t-lg border-x border-t border-transparent text-[13px] text-muted-foreground transition-colors duration-150",
          active ? ACTIVE_TAB : "hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <button
          type="button"
          role="tab"
          id={id}
          aria-selected={active}
          aria-controls={panel}
          tabIndex={active ? 0 : -1}
          onClick={() => onChange((current) => showTool(current, tool.id))}
          onKeyDown={onKeyDown}
          className="flex h-full min-w-0 items-center gap-2 rounded-tl-lg pr-1 pl-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        >
          <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} strokeWidth={1.5} aria-hidden />
          <span className="truncate">{name}</span>
        </button>
        {/* Out of the tab order: from the keyboard, Delete closes the focused tab. */}
        <Hint label={t("tabs.close", { name })} side="bottom">
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("tabs.close", { name })}
            onClick={() => onChange(close)}
            className={cn(
              "mr-2 grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground",
              !active && "opacity-0 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100",
            )}
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden />
          </button>
        </Hint>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onMenuChange(close)}>{t("tabs.menu.close")}</ContextMenuItem>
        <ContextMenuItem disabled={only} onClick={() => onMenuChange((current) => closeOthers(current, tool.id))}>
          {t("tabs.menu.closeOthers")}
        </ContextMenuItem>
        <ContextMenuItem disabled={last} onClick={() => onMenuChange((current) => closeRight(current, tool.id))}>
          {t("tabs.menu.closeRight")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onMenuChange(closeAll)}>{t("tabs.menu.closeAll")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ToolView({ tool, favorite, onToggleFavorite }: { tool: ToolMeta; favorite: boolean; onToggleFavorite: () => void }) {
  const { t } = useTranslation(TOOLS_NS);
  const { t: tApp } = useTranslation();
  const Component = tool.component;
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-6">
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-2xl font-medium">{t(`${tool.id}.name`)}</h1>
          <p className="text-subtle-foreground">{t(`${tool.id}.description`)}</p>
        </div>
        <Hint label={tApp(favorite ? "favorites.remove" : "favorites.add")} side="bottom">
          <button
            type="button"
            aria-pressed={favorite}
            aria-label={tApp("favorites.toggle")}
            onClick={onToggleFavorite}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150",
              "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              favorite && "text-primary hover:text-primary",
            )}
          >
            <Star className="size-4" strokeWidth={1.5} fill={favorite ? "currentColor" : "none"} aria-hidden />
          </button>
        </Hint>
      </header>
      <NamespaceContext.Provider value={toolNamespace(tool.id)}>
        <Suspense fallback={null}>
          <Component />
        </Suspense>
      </NamespaceContext.Provider>
    </div>
  );
}

/** Its heading takes focus when the last tab closes from the keyboard, so keyboard users keep their place. */
function EmptyState({ headingId }: { headingId: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 px-8">
      <h1 id={headingId} tabIndex={-1} className="text-2xl font-medium outline-none">
        {t("empty.title")}
      </h1>
      <p className="max-w-md text-subtle-foreground">{t("empty.body")}</p>
    </div>
  );
}
