import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NS } from "@/i18n";
import { cn } from "@/lib/utils";

const hasFiles = (event: DragEvent) => event.dataTransfer?.types?.includes("Files") ?? false;

/**
 * Where the user gives a Tool a file: dropped on it, or picked with the "Choose a file" button (keyboard and screen
 * readers). The file is Input: read in memory, never written anywhere.
 */
export function FileDropZone({
  label,
  onFile,
  accept,
  hint,
  className,
}: {
  /** The accessible name of the zone and its file field, e.g. "File to encode". */
  label: string;
  onFile: (file: File) => void;
  /** File types the picker offers, as for `<input accept>`; dropping takes any file. */
  accept?: string;
  /** A line under the prompt, e.g. what was opened last. */
  hint?: string;
  className?: string;
}) {
  const { t } = useTranslation(APP_NS);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDragOver(event: DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      role="group"
      aria-label={label}
      data-dragging={dragging || undefined}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 py-6 text-center transition-colors data-dragging:border-primary data-dragging:bg-primary/5",
        className,
      )}
    >
      <FileUp aria-hidden className="size-5 text-muted-foreground" />
      <p className="text-sm text-subtle-foreground">
        {dragging ? t("components.file.release") : `${t("components.file.drop")} ${t("components.file.or")}`}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
        {t("components.file.choose")}
      </Button>
      {hint && <p className="max-w-full truncate font-mono text-xs text-muted-foreground">{hint}</p>}
      <input
        ref={input}
        type="file"
        hidden
        aria-label={label}
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same file again still reports it.
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
