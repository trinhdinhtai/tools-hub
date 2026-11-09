import { useId, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** One labelled, read-only result of a Tool, with its copy button and an optional line under it. */
export function ResultRow({
  label,
  value,
  note,
  action,
  multiline,
  onCopied,
}: {
  label: string;
  /** Null shows a dash, with nothing to copy. */
  value: string | null;
  note?: string;
  /** A control beside the copy button, such as a select that changes this result. */
  action?: ReactNode;
  /** A textarea that wraps anywhere, for long values; a one-line field by default. */
  multiline?: boolean;
  /** Called once the value is on the clipboard. */
  onCopied?: () => void;
}) {
  const id = useId();
  const shown = value ?? "—";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* h-7 keeps the label row the height of the CopyButton, so the fields line up. */}
      <div className="flex h-7 items-center justify-between gap-2">
        <Label htmlFor={id} className="min-w-0 truncate">
          {label}
        </Label>
        <div className="flex items-center gap-2">
          {action}
          <CopyButton value={value ?? ""} disabled={value === null} onCopied={onCopied} />
        </div>
      </div>
      {multiline ? (
        <Textarea
          id={id}
          value={shown}
          readOnly
          spellCheck={false}
          className="min-h-14 resize-y bg-card font-mono text-[13px] leading-5 break-all"
        />
      ) : (
        <Input id={id} value={shown} readOnly spellCheck={false} className="bg-card font-mono text-[13px]" />
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
