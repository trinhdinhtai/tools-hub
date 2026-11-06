import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CodeEditor, type EditorMark } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Hint } from "@/components/hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { runInWorker } from "@/lib/worker";
import { cn } from "@/lib/utils";
import { compileRegex, type Match } from "./logic";
import type { MatchJob, MatchJobResult } from "./match-jobs";
import { MODES, type Mode } from "./modes";

const FLAGS = ["g", "i", "m", "s", "u", "y"] as const;

/** How long a run may take before it is stopped as a pattern that backtracks without end. */
const TIME_LIMIT_MS = 1000;

/** Matches listed at most; every match is still highlighted and counted. */
const LIST_LIMIT = 500;

// Neighbouring matches alternate shades so they read apart; groups take a colour by number, the same in the text and
// in the list.
const MATCH_CLASSES = ["rounded-[2px] bg-brand/20", "rounded-[2px] bg-brand/40"];
const GROUP_CLASSES = ["bg-sky-500/35", "bg-emerald-500/35", "bg-violet-500/35", "bg-rose-500/35"];
const groupClass = (number: number) => GROUP_CLASSES[(number - 1) % GROUP_CLASSES.length]!;
const NO_MARKS: EditorMark[] = [];

const spawn = () => new Worker(new URL("./match.worker.ts", import.meta.url), { type: "module" });

type Run = { job: MatchJob } & (
  | { state: "done"; result: MatchJobResult }
  | { state: "timeout" }
  | { state: "failed"; message: string }
);

/** The matches of a run that ended, if its pattern compiled. */
const matchesOf = (run: Run | null) => (run?.state === "done" && run.result.ok ? run.result : null);

function marksOf(matches: Match[]): EditorMark[] {
  return matches.flatMap((match, i) => [
    { from: match.start, to: match.end, className: MATCH_CLASSES[i % 2]! },
    ...match.groups.flatMap((group) =>
      group.span ? [{ from: group.span.start, to: group.span.end, className: groupClass(group.number) }] : [],
    ),
  ]);
}

/** Runs each job in a fresh worker, cancelling it when the job changes and stopping it after the time limit. */
function useMatchRun(job: MatchJob | null): Run | null {
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => {
    if (!job) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The clock starts when the worker says it has begun, so a slow start-up never counts as a slow pattern.
    const task = runInWorker<MatchJob, MatchJobResult>(spawn, job, () => {
      timer ??= setTimeout(() => {
        task.cancel();
        setRun({ job, state: "timeout" });
      }, TIME_LIMIT_MS);
    });
    task.result
      .then(
        (result) => setRun({ job, state: "done", result }),
        (error: Error) => {
          if (error.name !== "AbortError") setRun({ job, state: "failed", message: error.message });
        },
      )
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      task.cancel();
    };
  }, [job]);
  // Without a job there is nothing to show; a run of an older job is kept until the new one ends, so nothing flickers.
  return job ? run : null;
}

function MatchList({ matches, truncated }: { matches: Match[]; truncated: boolean }) {
  const { t } = useTranslation("regex-tester");
  const shown = matches.slice(0, LIST_LIMIT);
  return (
    <div className="h-96 overflow-auto rounded-lg border border-input bg-card">
      <ol aria-label={t("matches")}>
        {shown.map((match, i) => (
          <li key={match.start + ":" + i} className="flex flex-col gap-1 border-b border-border px-3 py-2 last:border-b-0">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-medium text-foreground">{t("match", { number: i + 1 })}</span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {t("span", { start: match.start, end: match.end })}
              </span>
            </div>
            <p className="font-mono text-[13px] break-all whitespace-pre-wrap">
              {match.text ? (
                <span className={MATCH_CLASSES[i % 2]}>{match.text}</span>
              ) : (
                <span className="text-muted-foreground italic">{t("empty")}</span>
              )}
            </p>
            {match.groups.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
                {match.groups.map((group) => (
                  <div key={group.number} className="contents">
                    <dt className="text-muted-foreground">
                      {group.number}
                      {group.name && <span className="text-subtle-foreground"> {group.name}</span>}
                    </dt>
                    <dd className="break-all whitespace-pre-wrap">
                      {group.span === null ? (
                        <span className="text-muted-foreground italic">{t("unmatched")}</span>
                      ) : group.span.text ? (
                        <span className={cn("rounded-[2px]", groupClass(group.number))}>{group.span.text}</span>
                      ) : (
                        <span className="text-muted-foreground italic">{t("empty")}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ol>
      {matches.length > shown.length && (
        <p className="px-3 py-2 text-xs text-muted-foreground">{t("shown", { shown: shown.length, count: truncated ? `${matches.length}+` : matches.length })}</p>
      )}
    </div>
  );
}

export default function RegexTesterTool() {
  const { t } = useTranslation("regex-tester");
  const id = useId();
  const [mode, setMode] = useState<Mode>("match");
  const [pattern, setPattern] = useState("");
  const [flagList, setFlagList] = useState<string[]>(["g"]);
  const [text, setText] = useState("");
  const [replacement, setReplacement] = useState("");
  // In the order JavaScript prints them, e.g. /a/gimsuy.
  const flags = FLAGS.filter((flag) => flagList.includes(flag)).join("");

  // Compiling is quick and never runs the pattern, so a syntax error shows at once; matching runs in the worker.
  const compiled = useMemo(() => (pattern ? compileRegex(pattern, flags) : null), [pattern, flags]);
  const job = useMemo<MatchJob | null>(
    () => (compiled?.ok ? { pattern, flags, text, replacement: mode === "replace" ? replacement : null } : null),
    [compiled, pattern, flags, text, mode, replacement],
  );
  const run = useMatchRun(job);
  const fresh = run?.job === job ? run : null;
  const result = matchesOf(run);

  // Marks are laid only on the text they were found in; until then the editor keeps moving the last ones with edits.
  const marks = useMemo(() => {
    if (!job) return NO_MARKS;
    const found = matchesOf(fresh);
    return found ? marksOf(found.matches) : undefined;
  }, [job, fresh]);

  // How many matches were found, as a sentence: "Matches: 3", or the first 10,000 when there are more.
  const summary = result
    ? t(result.truncated ? "truncated" : "count", { count: result.matches.length })
    : "";
  const status = result && (result.matches.length === 0 ? t("noMatch") : summary);

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-pattern`}>{t("pattern")}</Label>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-64 flex-1 items-center gap-1.5 font-mono text-sm">
            <span aria-hidden className="text-muted-foreground">
              /
            </span>
            <Input
              id={`${id}-pattern`}
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="(?<year>\d{4})-(\d{2})"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={compiled?.ok === false ? true : undefined}
              className="font-mono"
            />
            <span aria-hidden className="text-muted-foreground">
              /{flags}
            </span>
          </div>
          <ToggleGroup variant="outline" size="sm" multiple aria-label={t("flags.label")} value={flagList} onValueChange={setFlagList}>
            {FLAGS.map((flag) => (
              <Hint key={flag} label={t(`flags.${flag}`)}>
                <ToggleGroupItem
                  value={flag}
                  aria-label={`${flag}: ${t(`flags.${flag}`)}`}
                  className="w-8 font-mono text-subtle-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                >
                  {flag}
                </ToggleGroupItem>
              </Hint>
            ))}
          </ToggleGroup>
        </div>
        {compiled?.ok === false && (
          <ErrorMessage>
            {t("invalid", { message: t(`errors.${compiled.error.reason}`, { detail: compiled.error.detail }) })}
          </ErrorMessage>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          {/* The editor is named by its own label; this heading is for sight. As tall as the row beside it. */}
          <div className="flex h-7 items-center">
            <Label aria-hidden>{t("text")}</Label>
          </div>
          <CodeEditor label={t("text")} value={text} onChange={setText} marks={marks} className="h-96" />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          {mode === "match" ? (
            <>
              <div className="flex h-7 items-center">
                <Label aria-hidden>{t("matches")}</Label>
              </div>
              {result ? <MatchList matches={result.matches} truncated={result.truncated} /> : <div className="h-96 rounded-lg border border-input bg-card" />}
            </>
          ) : (
            <>
              <div className="flex h-7 items-center justify-between gap-3">
                <Label aria-hidden>{t("result")}</Label>
                <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                  <Label htmlFor={`${id}-replacement`} className="text-xs text-subtle-foreground">
                    {t("replacement")}
                  </Label>
                  <Input
                    id={`${id}-replacement`}
                    value={replacement}
                    onChange={(event) => setReplacement(event.target.value)}
                    placeholder="$2/$<year>"
                    spellCheck={false}
                    autoComplete="off"
                    aria-describedby={`${id}-replacement-hint`}
                    className="h-7 max-w-64 font-mono text-xs md:text-xs"
                  />
                </div>
              </div>
              <CodeEditor label={t("result")} value={result?.replaced ?? ""} readOnly className="h-96 bg-card" />
              <p id={`${id}-replacement-hint`} className="text-xs text-muted-foreground">
                {t("replacementHint")}
              </p>
            </>
          )}

          {fresh?.state === "timeout" && <ErrorMessage>{t("timeout", { seconds: TIME_LIMIT_MS / 1000 })}</ErrorMessage>}
          {fresh?.state === "failed" && <ErrorMessage>{t("failed", { message: fresh.message })}</ErrorMessage>}
          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton
                value={mode === "replace" ? (result.replaced ?? "") : () => result.matches.map((match) => match.text).join("\n")}
                disabled={mode === "match" && result.matches.length === 0}
              />
              <p role="status" className="font-mono text-xs text-muted-foreground tabular-nums">
                {status}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
