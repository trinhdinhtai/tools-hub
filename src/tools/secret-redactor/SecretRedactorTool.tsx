import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { useWorkerRun } from "@/lib/worker";
import { MAX_LENGTH, restore, type Redaction, type RedactResult } from "./logic";

const NO_REDACTIONS: Redaction[] = [];

/** Typing pauses this long before the text is scanned again, so a worker is not started on every key. */
const DEBOUNCE_MS = 150;

const spawn = () => new Worker(new URL("./redact.worker.ts", import.meta.url), { type: "module" });

function Pane({ label, side, children }: { label: string; side?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex h-7 items-center justify-between gap-3">
        {/* The editor is named by its own label; this heading is for sight. */}
        <Label aria-hidden>{label}</Label>
        {side}
      </div>
      {children}
    </div>
  );
}

function Count({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs text-muted-foreground tabular-nums">{children}</p>;
}

/** The placeholders given out, each with the kind of value it hides; never the values themselves. */
function FoundList({ redactions }: { redactions: Redaction[] }) {
  const { t } = useTranslation("secret-redactor");
  if (redactions.length === 0) return <p className="text-[13px] text-muted-foreground">{t("nothingFound")}</p>;
  return (
    <ul aria-label={t("found")} className="flex flex-wrap gap-1.5">
      {redactions.map(({ placeholder, kind }) => (
        <li key={placeholder} className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 text-xs">
          <span className="font-mono text-foreground">{placeholder}</span>
          <span className="text-muted-foreground">{t(`kinds.${kind}`)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function SecretRedactorTool() {
  const { t, i18n } = useTranslation("secret-redactor");
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("");

  // Which placeholder stands for which value lives only here, in memory: it goes with the Input, and with the Open
  // Tool. The text is scanned in a worker; a text over the limit is refused before it is sent there.
  const deferredInput = useDeferredValue(input);
  const tooLarge = deferredInput.length > MAX_LENGTH;
  const job = deferredInput && !tooLarge ? deferredInput : null;
  const run = useWorkerRun<string, RedactResult>(spawn, job, DEBOUNCE_MS);
  const scanned = job && run?.state === "done" && run.result.ok ? run.result : null;
  const redactions = scanned?.redactions ?? NO_REDACTIONS;
  const redacted = scanned?.text ?? "";
  const pending = job !== null && run?.job !== job;
  const failed = run?.state === "failed" && run.job === job ? run.message : null;

  const deferredReply = useDeferredValue(reply);
  const restoration = useMemo(() => restore(deferredReply, redactions), [deferredReply, redactions]);
  const nothingToRestore = deferredReply.trim() !== "" && redactions.length === 0 && !pending;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-label={t("steps.redact")}>
        <h2 className="text-sm font-medium text-foreground">{t("steps.redact")}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Pane label={t("input")}>
            <CodeEditor label={t("input")} value={input} onChange={setInput} invalid={tooLarge} className="h-56" />
            {tooLarge && (
              <ErrorMessage>{t("errors.too-large", { characters: MAX_LENGTH.toLocaleString(i18n.language) })}</ErrorMessage>
            )}
            {failed && <ErrorMessage>{t("errors.failed", { message: failed })}</ErrorMessage>}
          </Pane>
          <Pane
            label={t("redacted")}
            side={
              pending ? (
                <Count>{t("scanning")}</Count>
              ) : (
                redactions.length > 0 && <Count>{t("hiddenCount", { count: redactions.length })}</Count>
              )
            }
          >
            <CodeEditor label={t("redacted")} value={redacted} readOnly className="h-56 bg-card" />
            <div>
              <CopyButton value={redacted} label={t("copyRedacted")} disabled={!redacted} />
            </div>
          </Pane>
        </div>
        {scanned && <FoundList redactions={redactions} />}
        <p className="text-xs text-muted-foreground">{t("memoryOnly")}</p>
      </section>

      <section className="flex flex-col gap-3" aria-label={t("steps.restore")}>
        <h2 className="text-sm font-medium text-foreground">{t("steps.restore")}</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Pane label={t("reply")}>
            <CodeEditor label={t("reply")} value={reply} onChange={setReply} className="h-56" />
            {nothingToRestore && <ErrorMessage>{t("errors.nothing-to-restore")}</ErrorMessage>}
            {!nothingToRestore && !pending && restoration.unknown.length > 0 && (
              <ErrorMessage>{t("errors.unknown", { placeholders: restoration.unknown.join(", ") })}</ErrorMessage>
            )}
          </Pane>
          <Pane
            label={t("restored")}
            side={restoration.restored > 0 && <Count>{t("restoredCount", { count: restoration.restored })}</Count>}
          >
            <CodeEditor label={t("restored")} value={restoration.text} readOnly className="h-56 bg-card" />
            <div>
              <CopyButton value={restoration.text} label={t("copyRestored")} disabled={!restoration.text} />
            </div>
          </Pane>
        </div>
      </section>
    </div>
  );
}
