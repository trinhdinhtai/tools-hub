import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { FileDropZone } from "@/components/file-drop-zone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSaveFile } from "@/lib/files";
import { runInWorker } from "@/lib/worker";
import type { FileJob, FileJobResult } from "./file-jobs";
import { VARIANT_NAMES, fileExtension, type Variant } from "./logic";

/** The encoded text shown in the editor; the whole of it is copied or saved. */
const PREVIEW_CHARS = 100_000;
/** Beyond this, copying would build a string too big for the main thread (or for JavaScript): save it instead. */
const COPY_LIMIT_CHARS = 50_000_000;

const spawn = () => new Worker(new URL("./file.worker.ts", import.meta.url), { type: "module" });
const latin1 = new TextDecoder("latin1");

type Run = { job: FileJob; progress: number; result?: FileJobResult; error?: string };

/** Runs `job` in a worker whenever it changes, dropping the run of the job before. */
function useFileJob(job: FileJob | null) {
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => {
    if (!job) return;
    const task = runInWorker<FileJob, FileJobResult>(spawn, job, (progress) => setRun({ job, progress }));
    task.result.then(
      (result) => setRun({ job, progress: 1, result }),
      (error: Error) => error.name !== "AbortError" && setRun({ job, progress: 1, error: error.message }),
    );
    return task.cancel;
  }, [job]);
  if (!job) return null;
  return run?.job === job ? run : { job, progress: 0 };
}

function useFormatSize() {
  const { i18n } = useTranslation();
  return (bytes: number) => {
    const [value, unit] =
      bytes >= 1e9 ? [bytes / 1e9, "gigabyte"] : bytes >= 1e6 ? [bytes / 1e6, "megabyte"] : bytes >= 1e3 ? [bytes / 1e3, "kilobyte"] : [bytes, "byte"];
    return new Intl.NumberFormat(i18n.language, { style: "unit", unit, maximumFractionDigits: 1 }).format(value);
  };
}

/** Shows the OS save dialog for `bytes`, reporting a failed write; cancelling is not a failure. */
function SaveButton({ name, bytes }: { name: string; bytes: Uint8Array }) {
  const { t } = useTranslation("base64");
  const save = useSaveFile();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          save(name, bytes).catch((reason: unknown) => setError(String(reason)));
        }}
      >
        <Download aria-hidden />
        {t("file.save")}
      </Button>
      {error && <ErrorMessage className="basis-full">{t("file.saveFailed", { message: error })}</ErrorMessage>}
    </>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-subtle-foreground">
      <progress aria-label={label} value={value} max={1} className="h-1.5 w-40 accent-primary" />
      <span aria-hidden>{label}</span>
    </div>
  );
}

const withoutExtension = (name: string) => name.replace(/\.[^.]+$/, "") || name;

/** e.g. "photo.base64.txt", named after the file and the format it was encoded to. */
function savedName({ file, variant, dataUri }: Extract<FileJob, { kind: "encode" }>) {
  const format = dataUri ? "datauri" : variant === "base32" ? "base32" : "base64";
  return `${withoutExtension(file.name)}.${format}.txt`;
}

function EncodeFile({ file, onFile, variant, dataUri }: { file: File | null; onFile: (file: File) => void; variant: Variant; dataUri: boolean }) {
  const { t } = useTranslation("base64");
  const formatSize = useFormatSize();
  const { i18n } = useTranslation();
  const formatCount = (n: number) => n.toLocaleString(i18n.language);
  const job = useMemo<FileJob | null>(() => file && { kind: "encode", file, variant, dataUri }, [file, variant, dataUri]);
  const run = useFileJob(job);
  const bytes = run?.result?.ok ? run.result.bytes : null;
  const encoded = run?.job.kind === "encode" ? run.job : null;
  const preview = useMemo(() => (bytes ? latin1.decode(bytes.subarray(0, PREVIEW_CHARS)) : ""), [bytes]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        {/* The zone is named by its own aria-label; this heading lines it up with the Output column. */}
        <Label aria-hidden>{t("input")}</Label>
        <FileDropZone
          label={t("file.zone")}
          onFile={onFile}
          hint={file ? `${file.name} · ${file.type || t("file.unknownType")} · ${formatSize(file.size)}` : undefined}
          className="h-64 min-h-0"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Label>{t("output")}</Label>
        <CodeEditor label={t("output")} value={preview} readOnly className="h-64 bg-card" />
        {run && !run.result && !run.error && <Progress label={t("file.encoding")} value={run.progress} />}
        {run?.error && <ErrorMessage>{t("file.failed", { message: run.error })}</ErrorMessage>}
        {bytes && encoded && (
          <div className="flex flex-wrap items-center gap-2">
            {bytes.length <= COPY_LIMIT_CHARS && <CopyButton value={() => latin1.decode(bytes)} />}
            <SaveButton name={savedName(encoded)} bytes={bytes} />
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {bytes.length > COPY_LIMIT_CHARS
                ? t("file.tooBigToCopy", { shown: formatCount(PREVIEW_CHARS), total: formatCount(bytes.length) })
                : bytes.length > PREVIEW_CHARS
                  ? t("file.preview", { shown: formatCount(PREVIEW_CHARS), total: formatCount(bytes.length) })
                  : t("file.chars", { count: bytes.length })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DecodeText({ text, onText, variant }: { text: string; onText: (text: string) => void; variant: Variant }) {
  const { t } = useTranslation("base64");
  const formatSize = useFormatSize();
  const job = useMemo<FileJob | null>(() => (text.trim() ? { kind: "decode", text, variant } : null), [text, variant]);
  const run = useFileJob(job);
  const result = run?.result;

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("input")}</Label>
      <CodeEditor
        label={t("input")}
        value={text}
        onChange={onText}
        invalid={result?.ok === false}
        className="h-64"
      />
      {run && !result && !run.error && <Progress label={t("file.decoding")} value={run.progress} />}
      {run?.error && <ErrorMessage>{t("file.failed", { message: run.error })}</ErrorMessage>}
      {result?.ok === false && <ErrorMessage>{t(`errors.${result.reason}`, { variant: VARIANT_NAMES[variant] })}</ErrorMessage>}
      {result?.ok && (
        <div className="flex flex-wrap items-center gap-2">
          <SaveButton name={`decoded.${fileExtension(result.mime ?? "")}`} bytes={result.bytes} />
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {result.mime ? `${t("file.dataUri")} · ${result.mime} · ` : ""}
            {formatSize(result.bytes.length)}
          </p>
        </div>
      )}
    </div>
  );
}

/** File Mode: a file to Base64 or a data URI, and Base64 or a data URI back to a file. */
export function FileMode({
  direction,
  variant,
  dataUri,
  file,
  onFile,
  text,
  onText,
}: {
  direction: "encode" | "decode";
  variant: Variant;
  dataUri: boolean;
  file: File | null;
  onFile: (file: File) => void;
  text: string;
  onText: (text: string) => void;
}) {
  return direction === "encode" ? (
    <EncodeFile file={file} onFile={onFile} variant={variant} dataUri={dataUri} />
  ) : (
    <DecodeText text={text} onText={onText} variant={variant} />
  );
}

/** The Data URI switch, shown when encoding a file. */
export function DataUriSwitch({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation("base64");
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Switch aria-labelledby={id} checked={checked} onCheckedChange={onChange} />
      <span id={id} className="text-[13px] text-subtle-foreground">
        {t("file.dataUri")}
      </span>
    </div>
  );
}
