import type { WorkerHandler } from "@/lib/worker";
import { compileRegex, findMatches, replaceMatches, type Matches, type PatternError } from "./logic";

/** What the Tool asks its worker: the matches of a pattern in a text, and the text replaced when `replacement` is set. */
export interface MatchJob {
  pattern: string;
  flags: string;
  text: string;
  replacement: string | null;
}

export type MatchJobResult = ({ ok: true; replaced: string | null } & Matches) | { ok: false; error: PatternError };

/**
 * The work of the Tool, run in `match.worker.ts`: a pattern can backtrack for minutes on some text, so it runs where
 * it can be stopped without stopping the interface.
 */
export const handleMatchJob: WorkerHandler<MatchJob, MatchJobResult> = (job, progress) => {
  // Says the worker has started, so the time limit counts the run and not the worker's start-up.
  progress(0);
  const compiled = compileRegex(job.pattern, job.flags);
  if (!compiled.ok) return compiled;
  const found = findMatches(compiled.regex, job.text);
  const replaced = job.replacement === null ? null : replaceMatches(compiled.regex, job.text, job.replacement);
  return { ok: true, ...found, replaced };
};
