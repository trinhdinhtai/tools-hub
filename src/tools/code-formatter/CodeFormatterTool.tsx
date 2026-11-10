import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreference } from "@/lib/preferences";
import { useWorkerRun } from "@/lib/worker";
import type { FormatJob } from "./format-jobs";
import { ACTIONS, detectLanguage, INDENTS, LANGUAGES, type Action, type FormatResult, type Indent, type Language } from "./logic";

type Source = Language | "auto";

const SOURCES: Source[] = ["auto", ...LANGUAGES];
const ITEM = "px-3 text-subtle-foreground aria-pressed:text-foreground";

/** Typing pauses this long before the code is formatted again, so a worker is not started on every key. */
const DEBOUNCE_MS = 150;

const isAction = (value: unknown): value is Action => (ACTIONS as readonly unknown[]).includes(value);
const isIndent = (value: unknown): value is Indent => (INDENTS as readonly unknown[]).includes(value);

const spawn = () => new Worker(new URL("./format.worker.ts", import.meta.url), { type: "module" });

export default function CodeFormatterTool() {
  const { t } = useTranslation("code-formatter");
  const [input, setInput] = useState("");
  const [source, setSource] = useState<Source>("auto");
  const [storedAction, setAction] = usePreference<string>("action");
  const [storedIndent, setIndent] = usePreference<string>("indent");
  const action: Action = isAction(storedAction) ? storedAction : "beautify";
  const indent: Indent = isIndent(storedIndent) ? storedIndent : "2";

  const deferredInput = useDeferredValue(input);
  const detected = useMemo(() => (source === "auto" ? detectLanguage(deferredInput) : null), [source, deferredInput]);
  const language = source === "auto" ? detected : source;
  const empty = !deferredInput.trim();
  const job = useMemo<FormatJob | null>(
    () => (language && !empty ? { text: deferredInput, language, action, indent } : null),
    [deferredInput, language, action, indent, empty],
  );
  const run = useWorkerRun<FormatJob, FormatResult>(spawn, job, DEBOUNCE_MS);
  const fresh = run?.job === job ? run : null;
  const result = run?.state === "done" ? run.result : null;
  const output = result?.ok ? result.text : "";

  const languageName = (l: Language) => t(`languages.${l}`);
  const undetected = source === "auto" && !empty && detected === null;
  let error = "";
  let detail = "";
  if (fresh?.state === "failed") error = t("errors.failed", { message: fresh.message });
  else if (fresh?.state === "done" && !fresh.result.ok && fresh.result.error.reason === "invalid") {
    const { line, column, message } = fresh.result.error;
    const name = languageName(fresh.job.language);
    error =
      line === undefined ? t("errors.invalid", { language: name }) : t("errors.invalidAt", { language: name, line, column });
    if (message) detail = t("errors.detail", { message });
  }
  const pending = job !== null && fresh === null;
  const saved =
    fresh?.state === "done" && fresh.result.ok && fresh.job.action === "minify" && fresh.job.text.length > 0
      ? Math.round((1 - fresh.result.text.length / fresh.job.text.length) * 100)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-subtle-foreground">{t("language")}</span>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={t("language")}
            value={[source]}
            onValueChange={([value]) => value && setSource(value as Source)}
          >
            {SOURCES.map((s) => (
              <ToggleGroupItem key={s} value={s} className={ITEM}>
                {s === "auto" ? t("auto") : languageName(s)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={t("action.label")}
          value={[action]}
          onValueChange={([value]) => value && setAction(String(value))}
        >
          {ACTIONS.map((a) => (
            <ToggleGroupItem
              key={a}
              value={a}
              className="px-3 text-subtle-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {t(`action.${a}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={t("indent.label")}
          value={[indent]}
          disabled={action === "minify"}
          onValueChange={([value]) => value && setIndent(String(value))}
        >
          {INDENTS.map((i) => (
            <ToggleGroupItem key={i} value={i} className={ITEM}>
              {t(`indent.${i}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex h-7 items-center justify-between gap-3">
            {/* The editor is named by its own label; this heading is for sight. */}
            <Label aria-hidden>{t("input")}</Label>
            {detected && <p className="text-xs text-muted-foreground">{t("detected", { language: languageName(detected) })}</p>}
          </div>
          <CodeEditor label={t("input")} value={input} onChange={setInput} invalid={Boolean(error) || undetected} className="h-96" />
          {undetected && <ErrorMessage>{t("errors.undetected")}</ErrorMessage>}
          {error && <ErrorMessage>{error}</ErrorMessage>}
          {detail && <p className="text-xs break-words text-muted-foreground">{detail}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex h-7 items-center justify-between gap-3">
            <Label aria-hidden>{t("output")}</Label>
            {pending && <p className="text-xs text-muted-foreground">{t("formatting")}</p>}
          </div>
          <CodeEditor label={t("output")} value={job ? output : ""} readOnly className="h-96 bg-card" />
          {job && result?.ok && (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={output} />
              {saved !== null && saved > 0 && <p className="text-xs text-muted-foreground">{t("saved", { percent: saved })}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
