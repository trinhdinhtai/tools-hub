import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { FileDropZone } from "@/components/file-drop-zone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFormatSize } from "@/lib/files";
import { runInWorker } from "@/lib/worker";
import type { FileJob, FileJobResult } from "./file-jobs";
import { ALGORITHMS, digestsOf, type AlgorithmId } from "./logic";
import { MODES, type Mode } from "./modes";

const utf8 = new TextEncoder();
const spawn = () => new Worker(new URL("./file.worker.ts", import.meta.url), { type: "module" });

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

/** One row per algorithm: its untranslated name, the hex digest, and a copy button. */
function DigestList({ digests }: { digests: Record<AlgorithmId, string> }) {
  const { t } = useTranslation("hash-generator");
  return (
    <div className="flex flex-col gap-2">
      <Label>{t("output")}</Label>
      <ul className="divide-y rounded-lg border">
        {ALGORITHMS.map(({ id, name }) => (
          <li key={id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-24 shrink-0 text-[13px] font-medium">{name}</span>
            <span className="min-w-0 flex-1 font-mono text-[13px] break-all">{digests[id]}</span>
            <CopyButton value={digests[id]} />
          </li>
        ))}
      </ul>
    </div>
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

function TextMode({ text, onText }: { text: string; onText: (text: string) => void }) {
  const { t } = useTranslation("hash-generator");
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-input`}>{t("input")}</Label>
      <Textarea
        id={`${id}-input`}
        value={text}
        onChange={(event) => onText(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        className="min-h-40 resize-y font-mono text-[13px] leading-5"
      />
    </div>
  );
}

function FileMode({ file, onFile }: { file: File | null; onFile: (file: File) => void }) {
  const { t } = useTranslation("hash-generator");
  const formatSize = useFormatSize();

  return (
    <FileDropZone
      label={t("file.zone")}
      onFile={onFile}
      hint={file ? `${file.name} · ${formatSize(file.size)}` : undefined}
      className="h-40 min-h-0"
    />
  );
}

/** Hash Generator: every algorithm's digest of a text or a file, with an optional HMAC key. */
export default function HashGeneratorTool() {
  const { t } = useTranslation("hash-generator");
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [keyText, setKeyText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const key = useMemo(() => (keyText ? utf8.encode(keyText) : null), [keyText]);
  const textDigests = useMemo(() => (mode === "text" ? digestsOf(utf8.encode(text), key) : null), [mode, text, key]);
  const fileJob = useMemo<FileJob | null>(() => (mode === "file" && file ? { file, key } : null), [mode, file, key]);
  const fileRun = useFileJob(fileJob);

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
        <div className="w-64">
          <Input
            aria-label={t("key.label")}
            value={keyText}
            onChange={(event) => setKeyText(event.target.value)}
            placeholder={t("key.label")}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-[13px]"
          />
        </div>
        <p className="text-xs text-subtle-foreground">{t("key.hint")}</p>
      </div>

      {mode === "text" ? (
        <>
          <TextMode text={text} onText={setText} />
          {textDigests && <DigestList digests={textDigests} />}
        </>
      ) : (
        <>
          <FileMode file={file} onFile={setFile} />
          {fileRun && !fileRun.result && !fileRun.error && <Progress label={t("file.hashing")} value={fileRun.progress} />}
          {fileRun?.error && <ErrorMessage>{t("file.failed", { message: fileRun.error })}</ErrorMessage>}
          {fileRun?.result && <DigestList digests={fileRun.result} />}
        </>
      )}
    </div>
  );
}
