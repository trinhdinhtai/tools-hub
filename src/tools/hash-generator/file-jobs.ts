import type { WorkerHandler } from "@/lib/worker";
import { createHashers, type AlgorithmId } from "./logic";

/** What File Mode asks its worker to do. The key is UTF-8 bytes, or null for a plain hash. */
export interface FileJob {
  file: File;
  key: Uint8Array | null;
}

/** Every algorithm's digest of the file, keyed by algorithm id. */
export type FileJobResult = Record<AlgorithmId, string>;

/** Bytes read at a time: big enough that progress moves in visible steps, small enough to hold twice. */
const CHUNK = 1 << 22;

/** The work of File Mode, run in `file.worker.ts`: hash a file chunk by chunk so it is never held whole. */
export const handleFileJob: WorkerHandler<FileJob, FileJobResult> = async (job, progress) => {
  const hashers = createHashers(job.key);
  for (let offset = 0; offset < job.file.size; offset += CHUNK) {
    hashers.update(new Uint8Array(await job.file.slice(offset, offset + CHUNK).arrayBuffer()));
    progress(Math.min(1, (offset + CHUNK) / job.file.size));
  }
  return hashers.final();
};
