import { useDeferredValue, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { json } from "@codemirror/lang-json";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePreference } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { compareDocuments, isJsonText, MAX_DEPTH, type Change, type DocumentError, type Side } from "./logic";

const JSON_LANGUAGE = json();

/** Changes listed at most; the patch always holds them all. */
const LIST_LIMIT = 500;

/** Longest value shown in the list, in characters; the patch has the whole of it. */
const VALUE_LIMIT = 120;

const SIGNS: Record<Change["kind"], { sign: string; className: string }> = {
  added: { sign: "+", className: "text-emerald-600 dark:text-emerald-400" },
  removed: { sign: "−", className: "text-rose-600 dark:text-rose-400" },
  changed: { sign: "~", className: "text-amber-600 dark:text-amber-400" },
};

function shortJson(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > VALUE_LIMIT ? `${text.slice(0, VALUE_LIMIT - 1)}…` : text;
}

function ChangeRow({ change }: { change: Change }) {
  const { t } = useTranslation("json-diff");
  const { sign, className } = SIGNS[change.kind];
  return (
    <li className="flex gap-3 border-b border-border px-3 py-2 font-mono text-[13px] last:border-b-0">
      <span aria-hidden className={cn("w-3 shrink-0 text-center", className)}>
        {sign}
      </span>
      <span className="sr-only">{t(`kinds.${change.kind}`)}</span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="break-all text-foreground">{change.path}</span>
        <span className="break-all text-muted-foreground">
          {change.kind === "added" && shortJson(change.after)}
          {change.kind === "removed" && <span className="line-through">{shortJson(change.before)}</span>}
          {change.kind === "changed" && (
            <>
              <span className="line-through">{shortJson(change.before)}</span>
              <span> → </span>
              <span className="text-subtle-foreground">{shortJson(change.after)}</span>
            </>
          )}
        </span>
      </div>
    </li>
  );
}

function ChangeList({ changes }: { changes: Change[] }) {
  const { t } = useTranslation("json-diff");
  const shown = changes.slice(0, LIST_LIMIT);
  return (
    <div className="h-80 overflow-auto rounded-lg border border-input bg-card">
      {changes.length === 0 ? (
        <p className="px-3 py-2 text-[13px] text-muted-foreground">{t("noChanges")}</p>
      ) : (
        <ol aria-label={t("changes")}>
          {shown.map((change, i) => (
            <ChangeRow key={i} change={change} />
          ))}
        </ol>
      )}
      {changes.length > shown.length && (
        <p className="px-3 py-2 text-xs text-muted-foreground">{t("shown", { shown: shown.length, count: changes.length })}</p>
      )}
    </div>
  );
}

export default function JsonDiffTool() {
  const { t } = useTranslation("json-diff");
  const id = useId();
  const [original, setOriginal] = useState("");
  const [modified, setModified] = useState("");
  const [arrayKey, setArrayKey] = usePreference<string>("arrayKey");

  // Typing stays responsive on large Input: the result catches up when React has time.
  const deferredOriginal = useDeferredValue(original);
  const deferredModified = useDeferredValue(modified);
  const deferredKey = useDeferredValue(arrayKey);
  const result = useMemo(
    () => compareDocuments(deferredOriginal, deferredModified, { arrayKey: deferredKey }),
    [deferredOriginal, deferredModified, deferredKey],
  );
  const patch = useMemo(() => (result.ok ? JSON.stringify(result.patch, null, 2) + "\n" : ""), [result]);

  // An empty document is not a mistake, only a wait for the user; the result shows once both are there.
  const errorOf = (side: Side): DocumentError | undefined =>
    result.ok ? undefined : result.errors.find((error) => error.side === side && error.reason !== "empty");
  const errorText = (error: DocumentError) => {
    const name = t(error.side);
    if (error.reason === "too-deep") return t("errors.too-deep", { side: name, depth: MAX_DEPTH });
    return error.reason === "invalid" && error.line !== undefined
      ? t("errors.invalidAt", { side: name, line: error.line, column: error.column ?? 1 })
      : t("errors.invalid", { side: name });
  };

  const counts = { added: 0, removed: 0, changed: 0 };
  for (const change of result.ok ? result.changes : []) counts[change.kind]++;

  const editor = (side: Side, value: string, onChange: (value: string) => void) => {
    const error = errorOf(side);
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex h-7 items-center">
          {/* The editor is named by its own label; this heading is for sight. */}
          <Label aria-hidden>{t(side)}</Label>
        </div>
        <CodeEditor
          label={t(side)}
          value={value}
          onChange={onChange}
          language={isJsonText(value) ? JSON_LANGUAGE : undefined}
          invalid={Boolean(error)}
          className="h-80"
        />
        {error && <ErrorMessage>{errorText(error)}</ErrorMessage>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {editor("original", original, setOriginal)}
        {editor("modified", modified, setModified)}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-key`}>{t("arrayKey")}</Label>
        <Input
          id={`${id}-key`}
          value={arrayKey}
          onChange={(event) => setArrayKey(event.target.value)}
          placeholder="id"
          spellCheck={false}
          autoComplete="off"
          aria-describedby={`${id}-key-hint`}
          className="max-w-64 font-mono"
        />
        <p id={`${id}-key-hint`} className="text-xs text-muted-foreground">
          {t("arrayKeyHint")}
        </p>
      </div>

      {result.ok && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex h-7 items-center justify-between gap-3">
              <Label aria-hidden>{t("changes")}</Label>
              {result.changes.length > 0 && (
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {t("summary", counts)}
                </p>
              )}
            </div>
            <ChangeList changes={result.changes} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex h-7 items-center">
              <Label aria-hidden>{t("patch")}</Label>
            </div>
            <CodeEditor label={t("patch")} value={patch} readOnly language={JSON_LANGUAGE} className="h-80 bg-card" />
            <div>
              <CopyButton value={patch} label={t("copyPatch")} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
