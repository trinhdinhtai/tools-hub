import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeEditor } from "@/components/code-editor";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreference } from "@/lib/preferences";
import { runInWorker } from "@/lib/worker";
import type { CompareJob } from "./compare-jobs";
import { DiffResult } from "./DiffResult";
import { MAX_LENGTH, MAX_LINES, unifiedDiff, type CompareResult, type Granularity, type Side } from "./logic";

const GRANULARITIES: Granularity[] = ["line", "word", "char"];
const isGranularity = (value: unknown): value is Granularity => (GRANULARITIES as unknown[]).includes(value);

/** Typing pauses this long before the texts are compared again, so a worker is not started on every key. */
const DEBOUNCE_MS = 150;

const spawn = () => new Worker(new URL("./compare.worker.ts", import.meta.url), { type: "module" });

type Run = { job: CompareJob } & ({ state: "done"; result: CompareResult } | { state: "failed"; message: string });

/** Compares each job in a fresh worker once typing pauses, cancelling it when the job changes. */
function useCompareRun(job: CompareJob | null): Run | null {
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => {
    if (!job) return;
    let cancel = () => {};
    const timer = setTimeout(() => {
      const task = runInWorker<CompareJob, CompareResult>(spawn, job);
      cancel = task.cancel;
      task.result.then(
        (result) => setRun({ job, state: "done", result }),
        (error: Error) => {
          if (error.name !== "AbortError") setRun({ job, state: "failed", message: error.message });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [job]);
  // The run of an older job stays shown until the new one ends, so the result does not flicker while typing.
  return job ? run : null;
}

export default function TextCompareTool() {
  const { t, i18n } = useTranslation("text-compare");
  const id = useId();
  const [original, setOriginal] = useState("");
  const [modified, setModified] = useState("");
  const [storedGranularity, setGranularity] = usePreference<string>("granularity");
  const [ignoreWhitespace, setIgnoreWhitespace] = usePreference<boolean>("ignoreWhitespace");
  const [ignoreCase, setIgnoreCase] = usePreference<boolean>("ignoreCase");
  const granularity: Granularity = isGranularity(storedGranularity) ? storedGranularity : "word";

  const deferredOriginal = useDeferredValue(original);
  const deferredModified = useDeferredValue(modified);
  // Both texts are needed before there is anything to compare; until then the user is still pasting.
  const job = useMemo<CompareJob | null>(
    () =>
      deferredOriginal && deferredModified
        ? {
            original: deferredOriginal,
            modified: deferredModified,
            options: { granularity, ignoreWhitespace: Boolean(ignoreWhitespace), ignoreCase: Boolean(ignoreCase) },
          }
        : null,
    [deferredOriginal, deferredModified, granularity, ignoreWhitespace, ignoreCase],
  );
  const run = useCompareRun(job);
  const fresh = run?.job === job ? run : null;
  const result = run?.state === "done" ? run.result : null;

  const tooLarge = (side: Side) =>
    fresh?.state === "done" && !fresh.result.ok && fresh.result.side === side
      ? t("errors.too-large", {
          side: t(side),
          lines: MAX_LINES.toLocaleString(i18n.language),
          characters: MAX_LENGTH.toLocaleString(i18n.language),
        })
      : "";

  const editor = (side: Side, value: string, onChange: (value: string) => void) => {
    const error = tooLarge(side);
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex h-7 items-center">
          {/* The editor is named by its own label; this heading is for sight. */}
          <Label aria-hidden>{t(side)}</Label>
        </div>
        <CodeEditor label={t(side)} value={value} onChange={onChange} invalid={Boolean(error)} className="h-64" />
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </div>
    );
  };

  const toggle = (key: string, checked: boolean, onChange: (checked: boolean) => void) => (
    <div className="flex items-center gap-2">
      <Switch aria-labelledby={`${id}-${key}`} checked={checked} onCheckedChange={onChange} />
      <span id={`${id}-${key}`} className="text-[13px] text-subtle-foreground">
        {t(key)}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {editor("original", original, setOriginal)}
        {editor("modified", modified, setModified)}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-subtle-foreground">{t("granularity.label")}</span>
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label={t("granularity.label")}
            value={[granularity]}
            onValueChange={([value]) => value && setGranularity(String(value))}
          >
            {GRANULARITIES.map((g) => (
              <ToggleGroupItem key={g} value={g} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
                {t(`granularity.${g}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {toggle("ignoreWhitespace", Boolean(ignoreWhitespace), setIgnoreWhitespace)}
        {toggle("ignoreCase", Boolean(ignoreCase), setIgnoreCase)}
      </div>

      {fresh?.state === "failed" && <ErrorMessage>{t("errors.failed", { message: fresh.message })}</ErrorMessage>}

      {job && result?.ok && (
        <DiffResult
          rows={result.rows}
          hunks={result.hunks}
          stats={result.stats}
          pending={fresh === null}
          unifiedDiff={() => unifiedDiff(result.rows, { original: t("original"), modified: t("modified") })}
        />
      )}
    </div>
  );
}
