import { createContext, useContext, useEffect, useEffectEvent } from "react";

/**
 * Text the user pasted on the app and picked this Tool for (Paste Detection). It is Input: held in memory only, and
 * dropped by the app shell once the Tool has `taken` it.
 */
export interface PastedText {
  readonly text: string;
  taken(): void;
}

/** Provided by the app shell around each Open Tool; `null` when nothing is waiting for it. */
export const PasteContext = createContext<PastedText | null>(null);

/**
 * How a Tool that declares `detectPaste` receives what Paste Detection opened it for: `onPaste` gets the pasted text
 * once, when the Tool opens with it, or later if it is already open, and should make that text the Tool's Input.
 */
export function usePaste(onPaste: (text: string) => void) {
  const pasted = useContext(PasteContext);
  const handle = useEffectEvent(onPaste);
  useEffect(() => {
    if (!pasted) return;
    handle(pasted.text);
    pasted.taken();
  }, [pasted]);
}
