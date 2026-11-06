import { useDeferredValue, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { json } from "@codemirror/lang-json";
import { Wand } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaste } from "@/lib/paste";
import { usePreference } from "@/lib/preferences";
import { JsonTree } from "./JsonTree";
import { INDENTS, parseJson, printJson, type Indent, type TransformOptions } from "./logic";
import { MODES, type Mode } from "./modes";
import { queryJson } from "./query";
import { repairJson } from "./repair";

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
  const [mode, setMode] = useState<Mode>("text");
  const [input, setInput] = useState("");
  const [path, setPath] = useState("");
  const [style, setStyle] = useState<Style>("format");
  const [sortKeys, setSortKeys] = useState(false);
  const [storedIndent, setIndent] = usePreference<string>("indent");
  const indent = INDENT_IDS.get(storedIndent) ?? 2;
  usePaste(setInput);

  // Typing stays responsive on large Input: the Output catches up when React has time.
  const deferredInput = useDeferredValue(input);
  const deferredPath = useDeferredValue(path);
  const parsed = useMemo(() => (deferredInput.trim() ? parseJson(deferredInput) : null), [deferredInput]);
  // Offered only for Input that is not JSON; the fix keeps the key order and uses the chosen indent.
  const repaired = useMemo(
    () => (parsed?.ok === false ? repairJson(deferredInput, { output: "format", indent, sortKeys: false }) : null),
    [parsed, deferredInput, indent],
  );
  const query = useMemo(() => (parsed?.ok ? queryJson(parsed.node, deferredPath) : null), [parsed, deferredPath]);
  const found = query?.ok ? query.node : null;
  const options = useMemo<TransformOptions>(() => ({ output: style, indent, sortKeys }), [style, indent, sortKeys]);
  // The tree needs no text until the user copies it.
  const output = useMemo(() => (found && mode === "text" ? printJson(found, options) : ""), [found, mode, options]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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
            invalid={parsed?.ok === false}
            className="h-96"
          />
          {parsed?.ok === false && (
            <>
              <ErrorMessage>
                {t("errorAt", {
                  line: parsed.error.line,
                  column: parsed.error.column,
                  message: t(`errors.${parsed.error.reason}`, { found: parsed.error.found }),
                })}
              </ErrorMessage>
              {repaired !== null && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setInput(repaired)}>
                    <Wand aria-hidden />
                    {t("repair.action")}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t("repair.hint")}</p>
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label aria-hidden>{t("output")}</Label>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              <Label htmlFor={`${id}-path`} className="text-xs text-subtle-foreground">
                {t("path.label")}
              </Label>
              <Input
                id={`${id}-path`}
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="$.users[0].name"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={query?.ok === false ? true : undefined}
                className="h-7 max-w-64 font-mono text-xs md:text-xs"
              />
            </div>
          </div>
          {mode === "text" ? (
            <CodeEditor label={t("output")} value={output} readOnly language={JSON_LANGUAGE} className="h-96 bg-card" />
          ) : found ? (
            <JsonTree node={found} label={t("output")} sortKeys={sortKeys} className="h-96" />
          ) : (
            <div className="h-96 rounded-lg border border-input bg-card" />
          )}
          {query?.ok === false && (
            <ErrorMessage>
              {query.error.reason === "invalid-path"
                ? t("path.invalid", { column: query.error.column })
                : t("path.notFound", { path: query.error.path })}
            </ErrorMessage>
          )}
          {found && (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={mode === "text" ? output : () => printJson(found, options)} />
              {mode === "text" && (
                <p className="font-mono text-xs text-muted-foreground tabular-nums">{t("valid", { count: countChars(output) })}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
