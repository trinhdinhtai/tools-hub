import { useId, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardPaste } from "lucide-react";
import { Kbd } from "@/components/kbd";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TOOLS_NS } from "@/i18n";
import type { ToolMeta } from "@/lib/tool";
import { cn } from "@/lib/utils";
import { isComposing } from "./Palette";

/** A text the user pasted on the app, and the Tools that match it, best first. */
export interface Pasted {
  text: string;
  ids: readonly string[];
}

interface Props {
  tools: readonly ToolMeta[];
  pasted: Pasted | null;
  onClose: () => void;
  onPick: (id: string, text: string) => void;
}

/** The Tools suggested for a paste. Picking one opens it with the pasted text as its Input; Esc pastes nothing. */
export function PasteSuggestions({ tools, pasted, onClose, onPick }: Props) {
  const { t } = useTranslation();
  // Keeps the paste on screen while the dialog animates out, then lets go of it: the text is Input (ADR-0004).
  const [shown, setShown] = useState(pasted);
  if (pasted && pasted !== shown) setShown(pasted);
  return (
    <Dialog
      open={pasted !== null}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => !open && setShown(null)}
    >
      <DialogContent showCloseButton={false} className="top-[15vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        {shown && (
          <SuggestionList
            // A new paste starts again from the best match.
            key={shown.text}
            tools={tools}
            pasted={shown}
            onPick={(id) => {
              onClose();
              onPick(id, shown.text);
            }}
          />
        )}
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
      </DialogContent>
    </Dialog>
  );
}

function SuggestionList({ tools, pasted, onPick }: { tools: readonly ToolMeta[]; pasted: Pasted; onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const { t: tTools } = useTranslation(TOOLS_NS);
  const [active, setActive] = useState(0);
  const listId = useId();
  const optionId = (id: string) => `${listId}-${id}`;
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  const ids = pasted.ids.filter((id) => byId.has(id));
  const current = ids[Math.min(active, ids.length - 1)];

  const onKeyDown = (event: KeyboardEvent) => {
    if (isComposing(event.nativeEvent)) return;
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && ids.length > 0) {
      event.preventDefault();
      setActive((index) => (Math.min(index, ids.length - 1) + step + ids.length) % ids.length);
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      onPick(current);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1 border-b px-4 py-3">
        <DialogTitle className="flex items-center gap-2 text-[15px] font-medium">
          <ClipboardPaste className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          {t("paste.title")}
        </DialogTitle>
        <DialogDescription className="truncate font-mono text-[13px] text-subtle-foreground">{pasted.text.trim()}</DialogDescription>
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label={t("paste.title")}
        aria-activedescendant={current ? optionId(current) : undefined}
        tabIndex={0}
        autoFocus
        onKeyDown={onKeyDown}
        className="no-scrollbar max-h-[min(400px,60vh)] overflow-y-auto p-2 outline-none"
      >
        {ids.map((id) => {
          const tool = byId.get(id)!;
          const Icon = tool.icon;
          const selected = id === current;
          return (
            <div
              key={id}
              id={optionId(id)}
              role="option"
              aria-selected={selected}
              onMouseMove={() => setActive(ids.indexOf(id))}
              onClick={() => onPick(id)}
              className={cn(
                "flex h-9 cursor-default items-center gap-2 rounded-md px-2 text-subtle-foreground",
                selected && "bg-accent text-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} strokeWidth={1.5} aria-hidden />
              <span className="truncate">{tTools(`${id}.name`)}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t(`categories.${tool.category}`)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
