import { attemptError } from "@/lib/attempt";
import type { WorkerHandler } from "@/lib/worker";
import { DecodeError, type DecodeErrorReason, type Variant, dataUriPrefix, decodeBytes, encodeBytes, parseDataUri } from "./logic";

/** What File Mode asks its worker to do. */
export type FileJob =
  | { kind: "encode"; file: File; variant: Variant; dataUri: boolean }
  | { kind: "decode"; text: string; variant: Variant };

/** Encoded text as ASCII bytes, or decoded bytes with the MIME type of the data URI they came from (else null). */
export type FileJobResult = { ok: true; bytes: Uint8Array; mime: string | null } | { ok: false; reason: DecodeErrorReason };

/** Bytes read at a time: whole Base64 (3-byte) and Base32 (5-byte) groups, so only the last chunk is padded. */
const CHUNK = 3 * 5 * (1 << 18);

function encodedLength(size: number, variant: Variant): number {
  if (variant === "base32") return Math.ceil(size / 5) * 8;
  if (variant === "url-safe") return Math.floor(size / 3) * 4 + (size % 3 === 0 ? 0 : (size % 3) + 1);
  return Math.ceil(size / 3) * 4;
}

/** Encodes a file chunk by chunk, so a file of hundreds of MB is never held twice as a string. */
async function encodeFile(file: Blob, variant: Variant, dataUri: boolean, progress: (fraction: number) => void) {
  const alphabet = dataUri ? "standard" : variant;
  const prefix = dataUri ? new TextEncoder().encode(dataUriPrefix(file.type)) : new Uint8Array(0);
  const out = new Uint8Array(prefix.length + encodedLength(file.size, alphabet));
  out.set(prefix);
  let at = prefix.length;
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const chunk = new Uint8Array(await file.slice(offset, offset + CHUNK).arrayBuffer());
    const encoded = encodeBytes(chunk, alphabet);
    out.set(encoded, at);
    at += encoded.length;
    progress(Math.min(1, (offset + CHUNK) / file.size));
  }
  return out;
}

/** The work of File Mode, run in `file.worker.ts`. */
export const handleFileJob: WorkerHandler<FileJob, FileJobResult> = async (job, progress) => {
  if (job.kind === "encode") {
    return { ok: true, bytes: await encodeFile(job.file, job.variant, job.dataUri, progress), mime: null };
  }
  const { value, error } = attemptError(() => {
    const uri = parseDataUri(job.text);
    return uri ? { bytes: uri.bytes, mime: uri.mime } : { bytes: decodeBytes(job.text, job.variant), mime: null };
  }, DecodeError);
  return error ? { ok: false, reason: error.reason } : { ok: true, ...value };
};
