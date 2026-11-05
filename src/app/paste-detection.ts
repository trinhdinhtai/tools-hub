import type { ToolMeta } from "@/lib/tool";

/** Where a paste goes to the element itself: fields, editable content, and anything inside a dialog or menu. */
const PASTES_NORMALLY =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"], [role="menu"]';
/** Open over the app: while one is up, a paste never lands on the app's empty space, even if focus slipped to the body. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/**
 * Whether a paste landed on the app's empty space rather than in a field or a dialog. Only paste events the user
 * made reach here: the app never reads the clipboard on its own.
 */
export function pastedOnApp(event: ClipboardEvent): boolean {
  const target = event.target;
  if (target instanceof Element && target.closest(PASTES_NORMALLY)) return false;
  return document.querySelector(OVERLAY) === null;
}

/**
 * Ids of the Tools whose `detectPaste` matches the text, best match first (registry order among equals). A score of
 * 0 is no match; a detector that throws counts as no match, so one broken Tool cannot stop the others.
 */
export function suggestTools(tools: readonly ToolMeta[], text: string): string[] {
  if (!text.trim()) return [];
  return tools
    .flatMap((tool) => {
      if (!tool.detectPaste) return [];
      let score: number;
      try {
        score = tool.detectPaste(text);
      } catch {
        return [];
      }
      return Number.isFinite(score) && score > 0 ? [{ id: tool.id, score }] : [];
    })
    .sort((a, b) => b.score - a.score)
    .map(({ id }) => id);
}
