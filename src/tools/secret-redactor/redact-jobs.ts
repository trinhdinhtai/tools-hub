import type { WorkerHandler } from "@/lib/worker";
import { redact, type RedactResult } from "./logic";

/**
 * The work of the Tool, run in `redact.worker.ts`: a dozen patterns over up to millions of characters take a moment,
 * so they run away from the interface. Which placeholder stands for which value comes back in the result, to memory.
 */
export const handleRedactJob: WorkerHandler<string, RedactResult> = (text) => redact(text);
