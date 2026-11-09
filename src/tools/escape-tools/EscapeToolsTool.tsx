import { useDeferredValue, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { convert, EscapeError, type Direction } from "./logic";
import { MODES, type Mode } from "./modes";

const DIRECTIONS: Direction[] = ["escape", "unescape"];

function run(input: string, mode: Mode, direction: Direction): { output: string; error?: EscapeError } {
  try {
    return { output: convert(input, mode, direction) };
  } catch (error) {
    if (error instanceof EscapeError) return { output: "", error };
    throw error;
  }
}

export default function EscapeToolsTool() {
  const { t } = useTranslation("escape-tools");
  const id = useId();
  const [mode, setMode] = useState<Mode>("html");
  const [direction, setDirection] = useState<Direction>("escape");
  const [input, setInput] = useState("");

  // Typing stays responsive on large Input: the Output catches up when React has time.
  const deferredInput = useDeferredValue(input);
  const { output, error } = useMemo(() => run(deferredInput, mode, direction), [deferredInput, mode, direction]);

  const directionLabel = (d: Direction) =>
    mode === "punycode" ? t(d === "escape" ? "direction.toPunycode" : "direction.toUnicode") : t(`direction.${d}`);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {/* Single choice: Base UI ToggleGroup values are arrays; pressing the active item again keeps it. */}
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={t("mode")}
            value={[mode]}
            onValueChange={([value]) => value && setMode(value as Mode)}
          >
            {MODES.map((m) => (
              <ToggleGroupItem key={m} value={m} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
                {t(`modes.${m}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={t("direction.label")}
            value={[direction]}
            onValueChange={([value]) => value && setDirection(value as Direction)}
          >
            {DIRECTIONS.map((d) => (
              <ToggleGroupItem
                key={d}
                value={d}
                className="px-3 text-subtle-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              >
                {directionLabel(d)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <p className="text-xs text-muted-foreground">{t(`about.${mode}`)}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-input`}>{t("input")}</Label>
          <Textarea
            id={`${id}-input`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className="min-h-64 resize-y font-mono text-[13px] leading-5"
          />
          {error && <ErrorMessage>{t(`errors.${error.reason}`, { sequence: error.sequence })}</ErrorMessage>}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${id}-output`}>{t("output")}</Label>
          <Textarea
            id={`${id}-output`}
            value={output}
            readOnly
            spellCheck={false}
            className="min-h-64 resize-y bg-card font-mono text-[13px] leading-5 break-all"
          />
          {output && (
            <div>
              <CopyButton value={output} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
