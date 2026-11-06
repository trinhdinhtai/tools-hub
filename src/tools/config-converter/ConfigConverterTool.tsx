import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { json } from "@codemirror/lang-json";
import { ArrowLeftRight } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaste } from "@/lib/paste";
import { usePreference } from "@/lib/preferences";
import { detectFormat, FORMATS, parseConfig, stringifyConfig, type ConfigError, type Format } from "./logic";

type Source = Format | "auto";

const SOURCES: Source[] = ["auto", ...FORMATS];
const JSON_LANGUAGE = json();
const isFormat = (value: unknown): value is Format => (FORMATS as readonly unknown[]).includes(value);

const ITEM = "px-3 text-subtle-foreground aria-pressed:text-foreground";

export default function ConfigConverterTool() {
  const { t } = useTranslation("config-converter");
  const [input, setInput] = useState("");
  const [source, setSource] = useState<Source>("auto");
  const [storedTo, setTo] = usePreference<string>("to");
  const to: Format = isFormat(storedTo) ? storedTo : "yaml";
  usePaste((text) => {
    setInput(text);
    setSource("auto");
  });

  // Typing stays responsive on large Input: the Output catches up when React has time.
  const deferredInput = useDeferredValue(input);
  const detected = useMemo(() => (source === "auto" ? detectFormat(deferredInput) : null), [source, deferredInput]);
  const from = source === "auto" ? detected : source;
  const parsed = useMemo(() => (from && deferredInput.trim() ? parseConfig(deferredInput, from) : null), [from, deferredInput]);
  const result = useMemo(() => (parsed?.ok ? stringifyConfig(parsed.docs, to) : null), [parsed, to]);
  const output = result?.ok ? result.text : "";

  const formatName = (format: Format) => t(`formats.${format}`);
  const errorText = (error: ConfigError, format: Format): string => {
    switch (error.reason) {
      case "empty":
        return "";
      case "invalid":
        return error.line === undefined
          ? t("errors.invalid", { format: formatName(format) })
          : t("errors.invalidAt", { format: formatName(format), line: error.line, column: error.column ?? 1 });
      case "toml-null":
        return t("errors.toml-null", { path: error.path });
      case "not-a-table":
        return t("errors.not-a-table", { format: formatName(format) });
      case "bad-key":
        return t("errors.bad-key", { key: error.key });
    }
  };

  const undetected = source === "auto" && deferredInput.trim() !== "" && detected === null;
  const inputError = parsed?.ok === false && from ? errorText(parsed.error, from) : "";
  const outputError = result?.ok === false ? errorText(result.error, to) : "";
  const documents = parsed?.ok ? parsed.docs.length : 0;

  function swap() {
    if (!from) return;
    if (result?.ok) setInput(result.text);
    setSource(to);
    setTo(from);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-subtle-foreground">{t("from")}</span>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={t("from")}
            value={[source]}
            onValueChange={([value]) => value && setSource(value as Source)}
          >
            {SOURCES.map((s) => (
              <ToggleGroupItem key={s} value={s} className={ITEM}>
                {s === "auto" ? t("auto") : formatName(s)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("swap")} title={t("swap")} disabled={!from} onClick={swap}>
          <ArrowLeftRight aria-hidden />
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-subtle-foreground">{t("to")}</span>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={t("to")}
            value={[to]}
            onValueChange={([value]) => value && setTo(String(value))}
          >
            {FORMATS.map((f) => (
              <ToggleGroupItem key={f} value={f} className={ITEM}>
                {formatName(f)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex h-7 items-center justify-between gap-3">
            {/* The editor is named by its own label; this heading is for sight. */}
            <Label aria-hidden>{t("input")}</Label>
            {detected && <p className="text-xs text-muted-foreground">{t("detected", { format: formatName(detected) })}</p>}
          </div>
          <CodeEditor
            label={t("input")}
            value={input}
            onChange={setInput}
            language={from === "json" ? JSON_LANGUAGE : undefined}
            invalid={Boolean(inputError) || undetected}
            className="h-96"
          />
          {undetected && <ErrorMessage>{t("errors.undetected")}</ErrorMessage>}
          {inputError && <ErrorMessage>{inputError}</ErrorMessage>}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex h-7 items-center">
            <Label aria-hidden>{t("output")}</Label>
          </div>
          <CodeEditor
            label={t("output")}
            value={output}
            readOnly
            language={to === "json" ? JSON_LANGUAGE : undefined}
            className="h-96 bg-card"
          />
          {outputError && <ErrorMessage>{outputError}</ErrorMessage>}
          {result?.ok && (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={output} />
              {(to === "env" || to === "properties") && <p className="text-xs text-muted-foreground">{t(`notes.${to}`)}</p>}
              {documents > 1 && to !== "yaml" && (
                <p className="text-xs text-muted-foreground">{t("notes.documents", { count: documents })}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
