import type { WorkerHandler } from "@/lib/worker";
import { formatCode, type Action, type FormatResult, type Indent, type Language } from "./logic";

/** What the Tool asks its worker: `text` beautified or minified as `language`. */
export interface FormatJob {
  text: string;
  language: Language;
  action: Action;
  indent: Indent;
}

/**
 * The work of the Tool, run in `format.worker.ts`: the parsers are large and a big Input takes them a while, so they
 * load and run away from the interface.
 */
export const handleFormatJob: WorkerHandler<FormatJob, FormatResult> = (job) =>
  formatCode(job.text, job.language, job.action, job.indent);
