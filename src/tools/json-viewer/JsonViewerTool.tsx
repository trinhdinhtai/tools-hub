import { useDeferredValue, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { json } from "@codemirror/lang-json";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaste } from "@/lib/paste";
import { usePreference } from "@/lib/preferences";
import { INDENTS, transformJson, type Indent, type TransformOptions } from "./logic";

type Style = TransformOptions["output"];

const STYLES: Style[] = ["format", "minify"];
const JSON_LANGUAGE = json();

/** The indent as stored in its Preference, which keeps one type for every value. */
const INDENT_IDS = new Map<string, Indent>(INDENTS.map((indent) => [String(indent), indent]));

/** Characters as error columns count them: an emoji is one, not two UTF-16 units. */
function countChars(text: string): number {
  let count = text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff) count--;
  }
  return count;
}

export default function JsonViewerTool() {
  const { t } = useTranslation("json-viewer");
  const id = useId();
  const [input, setInput] = useState("");
  const [style, setStyle] = useState<Style>("format");
  const [sortKeys, setSortKeys] = useState(false);
  const [storedIndent, setIndent] = usePreference<string>("indent");
  const indent = INDENT_IDS.get(storedIndent) ?? 2;
  usePaste(setInput);

  // Typing stays responsive on large Input: the Output catches up when React has time.
  const deferredInput = useDeferredValue(input);
  const result = useMemo(
    () => (deferredInput.trim() ? transformJson(deferredInput, { output: style, indent, sortKeys }) : null),
    [deferredInput, style, indent, sortKeys],
  );
  const output = result?.ok ? result.text : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Single choice: Base UI ToggleGroup values are arrays; pressing the active item again keeps it. */}
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={t("style.label")}
          value={[style]}
          onValueChange={([value]) => value && setStyle(value as Style)}
        >
          {STYLES.map((s) => (
            <ToggleGroupItem
              key={s}
              value={s}
              className="px-3 text-subtle-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {t(`style.${s}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={t("indent.label")}
          value={[String(indent)]}
          disabled={style === "minify"}
          onValueChange={([value]) => value && setIndent(String(value))}
        >
          {INDENTS.map((i) => (
            <ToggleGroupItem key={i} value={String(i)} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
              {t(`indent.${i}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Switch aria-labelledby={`${id}-sort`} checked={sortKeys} onCheckedChange={setSortKeys} />
          <span id={`${id}-sort`} className="text-[13px] text-subtle-foreground">
            {t("sortKeys")}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          {/* The editor is named by its own label; this heading is for sight. */}
          <Label aria-hidden>{t("input")}</Label>
          <CodeEditor
            label={t("input")}
            value={input}
            onChange={setInput}
            language={JSON_LANGUAGE}
            invalid={result?.ok === false}
            className="h-96"
          />
          {result?.ok === false && (
            <ErrorMessage>
              {t("errorAt", {
                line: result.error.line,
                column: result.error.column,
                message: t(`errors.${result.error.reason}`, { found: result.error.found }),
              })}
            </ErrorMessage>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label aria-hidden>{t("output")}</Label>
          <CodeEditor label={t("output")} value={output} readOnly language={JSON_LANGUAGE} className="h-96 bg-card" />
          {result?.ok && (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={output} />
              <p className="font-mono text-xs text-muted-foreground tabular-nums">{t("valid", { count: countChars(output) })}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
