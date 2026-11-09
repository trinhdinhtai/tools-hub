import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NS } from "@/i18n";

type CopyState = "idle" | "done" | "failed";

/** How long "Copied" stays before the button reads "Copy" again. */
const RESET_MS = 2000;

/**
 * Copies text to the clipboard and says whether it worked, on the button and to screen readers. `value` may be a
 * function, for output that is costly to build and only needed when the user copies. The app only ever writes to the
 * clipboard, never reads it.
 */
export function CopyButton({
  value,
  label,
  disabled,
  className,
  onCopied,
}: {
  value: string | (() => string);
  /** The button's text; "Copy" by default. */
  label?: string;
  disabled?: boolean;
  className?: string;
  /** Called once the text is on the clipboard, not when the copy failed. */
  onCopied?: () => void;
}) {
  const { t } = useTranslation(APP_NS);
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), RESET_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(typeof value === "function" ? value() : value);
      setState("done");
    } catch {
      setState("failed");
      return;
    }
    onCopied?.();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={copy} className={className}>
        {state === "done" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {state === "done" ? t("components.copy.done") : (label ?? t("components.copy.label"))}
      </Button>
      <span role="status" className="sr-only">
        {state === "done" ? t("components.copy.done") : state === "failed" ? t("components.copy.failed") : ""}
      </span>
    </>
  );
}
