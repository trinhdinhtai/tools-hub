import type { WorkerHandler } from "@/lib/worker";
import { compareTexts, type CompareOptions, type CompareResult } from "./logic";

/** What the Tool asks its worker: the two texts compared with `options`. */
export interface CompareJob {
  original: string;
  modified: string;
  options: CompareOptions;
}

/** The work of the Tool, run in `compare.worker.ts` so that comparing thousands of lines never blocks the interface. */
export const handleCompareJob: WorkerHandler<CompareJob, CompareResult> = (job) =>
  compareTexts(job.original, job.modified, job.options);
