import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Kbd } from "@/components/kbd";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LOCALES, TOOLS_NS } from "@/i18n";
import type { ToolMeta } from "@/lib/tool";
import { cn } from "@/lib/utils";
import { searchTools, type SearchEntry } from "./search";

/** The palette's shortcut as shown to the user: `Cmd+K` on macOS, `Ctrl+K` elsewhere. */
export const paletteShortcutLabel = (isMac: boolean) => (isMac ? "⌘K" : "Ctrl K");

/**
 * `Cmd+K` on macOS, `Ctrl+K` elsewhere. On macOS Ctrl+K stays with text fields (delete to the end of the line).
 * Checks the key's position, not its character, so it works whatever the keyboard layout.
 */
/** Whether an IME is composing a word (Telex, VNI, CJK): its keys belong to the IME, not to the app. */
export function isComposing(event: globalThis.KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

export function isPaletteShortcut(event: globalThis.KeyboardEvent, isMac: boolean): boolean {
  const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return modifier && !isComposing(event) && !event.altKey && !event.shiftKey && event.code === "KeyK";
}

interface PaletteProps {
  tools: readonly ToolMeta[];
  /** Ids of the Tools used recently, newest first. */
  recent: readonly string[];
  onPick: (id: string) => void;
}

/** Opens over whatever is on screen; picking a Tool opens it (or shows its tab) and closes the palette. */
export function CommandPalette({ open, onOpenChange, ...props }: PaletteProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[15vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">{t("palette.title")}</DialogTitle>
        <PalettePanel
          {...props}
          onPick={(id) => {
            onOpenChange(false);
            props.onPick(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface Group {
  label: string;
  ids: string[];
}

/** Lives inside the dialog content, so the query starts empty each time the palette opens. */
function PalettePanel({ tools, recent, onPick }: PaletteProps) {
  const { t } = useTranslation();
  const { t: tTools, i18n } = useTranslation(TOOLS_NS);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const optionId = (id: string) => `${listId}-${id}`;

  const name = (id: string) => tTools(`${id}.name`);
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  // Alphabetical in the language on screen; search keeps this order among equally good matches.
  const sorted = [...tools].sort((a, b) => name(a.id).localeCompare(name(b.id), i18n.language));
  // Names and aliases in every language, whatever the language on screen.
  const entries: SearchEntry[] = sorted.map((tool) => ({
    id: tool.id,
    names: LOCALES.map((lng) => i18n.getFixedT(lng, TOOLS_NS)(`${tool.id}.name`)),
    aliases: [tool.id, ...LOCALES.flatMap((lng) => tool.aliases[lng])],
  }));

  const recentIds = recent.filter((id) => byId.has(id));
  const groups: Group[] = query.trim()
    ? [{ label: t("palette.results"), ids: searchTools(query, entries) }]
    : [
        { label: t("palette.recent"), ids: recentIds },
        { label: t("palette.all"), ids: sorted.map((tool) => tool.id).filter((id) => !recentIds.includes(id)) },
      ];
  const options = groups.flatMap((group) => group.ids);
  const current = options[Math.min(active, options.length - 1)];

  useEffect(() => {
    if (current) document.getElementById(optionId(current))?.scrollIntoView?.({ block: "nearest" });
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (isComposing(event.nativeEvent)) return;
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && options.length > 0) {
      event.preventDefault();
      setActive((index) => (Math.min(index, options.length - 1) + step + options.length) % options.length);
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      onPick(current);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-label={t("palette.title")}
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current ? optionId(current) : undefined}
          placeholder={t("palette.placeholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div id={listId} role="listbox" aria-label={t("palette.title")} className="no-scrollbar max-h-[min(400px,60vh)] overflow-y-auto p-2">
        {options.length === 0 && <p className="px-2 py-6 text-center text-subtle-foreground">{t("palette.empty", { query: query.trim() })}</p>}
        {groups
          .filter((group) => group.ids.length > 0)
          .map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="not-first:mt-2">
              <div aria-hidden className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">
                {group.label}
              </div>
              {group.ids.map((id) => {
                const tool = byId.get(id)!;
                const Icon = tool.icon;
                const selected = id === current;
                return (
                  <div
                    key={id}
                    id={optionId(id)}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => setActive(options.indexOf(id))}
                    // Keep focus in the input, so typing carries on after a click elsewhere in the list.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onPick(id)}
                    className={cn(
                      "flex h-9 cursor-default items-center gap-2 rounded-md px-2 text-subtle-foreground",
                      selected && "bg-accent text-foreground",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} strokeWidth={1.5} aria-hidden />
                    <span className="truncate">{name(id)}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t(`categories.${tool.category}`)}</span>
                  </div>
                );
              })}
            </div>
          ))}
      </div>
      <div aria-hidden className="flex gap-4 border-t bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t("palette.hint.move")}
        </span>
        <span>
          <Kbd>Enter</Kbd> {t("palette.hint.open")}
        </span>
        <span>
          <Kbd>Esc</Kbd> {t("palette.hint.close")}
        </span>
      </div>
    </>
  );
}
