// Heavy work (big files) runs in a Web Worker so the interface stays responsive (ADR-0003). A Tool keeps the work
// itself as a plain function, serves it from a worker module with `serveWorker`, and runs it with `runInWorker`:
//
//   // file.worker.ts
//   serveWorker(encodeFile);
//   // Tool UI
//   runInWorker(() => new Worker(new URL("./file.worker.ts", import.meta.url), { type: "module" }), input);

import { useEffect, useState } from "react";

/** The work a worker does; it may call `progress` with a fraction from 0 to 1. */
export type WorkerHandler<I, O> = (input: I, progress: (fraction: number) => void) => O | Promise<O>;

/** The part of a worker's global scope `serveWorker` uses. */
export interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

type Reply<O> = { type: "progress"; fraction: number } | { type: "done"; output: O } | { type: "error"; message: string };

/** A run in a worker: its result, and a way to stop it. */
export interface WorkerTask<O> {
  /** Settles with the handler's output, or rejects with its error (an `AbortError` once cancelled). */
  result: Promise<O>;
  /** Stops the worker at once; does nothing after the run has settled. */
  cancel(): void;
}

/** Byte buffers in a value or its own properties, moved rather than copied between threads. */
function transferables(value: unknown): Transferable[] {
  const found = new Set<ArrayBuffer>();
  const add = (item: unknown) => {
    if (item instanceof ArrayBuffer) found.add(item);
    else if (ArrayBuffer.isView(item) && item.buffer instanceof ArrayBuffer) found.add(item.buffer);
  };
  add(value);
  if (value && typeof value === "object") Object.values(value).forEach(add);
  return [...found];
}

/** Makes this worker module answer `runInWorker` with `handler`. */
export function serveWorker<I, O>(handler: WorkerHandler<I, O>, scope: WorkerScope = self as unknown as WorkerScope) {
  const reply = (message: Reply<O>, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
  scope.addEventListener("message", async (event) => {
    try {
      const output = await handler(event.data as I, (fraction) => reply({ type: "progress", fraction }));
      reply({ type: "done", output }, transferables(output));
    } catch (error) {
      reply({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  });
}

/**
 * Runs `input` through the handler of a fresh worker from `createWorker`, which is terminated once the run settles.
 * Byte buffers in `input` are moved to the worker, so they are unusable here afterwards.
 */
export function runInWorker<I, O>(
  createWorker: () => Worker,
  input: I,
  onProgress?: (fraction: number) => void,
): WorkerTask<O> {
  const worker = createWorker();
  let settled = false;
  let fail: (error: Error) => void = () => {};
  const result = new Promise<O>((resolve, reject) => {
    const settle = (finish: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      finish();
    };
    fail = (error) => settle(() => reject(error));
    worker.addEventListener("message", (event: MessageEvent<Reply<O>>) => {
      const reply = event.data;
      if (reply.type === "progress") onProgress?.(reply.fraction);
      else if (reply.type === "done") settle(() => resolve(reply.output));
      else fail(new Error(reply.message));
    });
    worker.addEventListener("error", (event: ErrorEvent) => fail(new Error(event.message || "The worker failed")));
    worker.addEventListener("messageerror", () => fail(new Error("The worker's reply could not be read")));
    worker.postMessage(input, transferables(input));
  });
  return {
    result,
    cancel: () => fail(new DOMException("The run was cancelled", "AbortError")),
  };
}

/** A run of `useWorkerJob`: the job it belongs to, how far it has got, and its outcome once settled. */
export interface WorkerRun<O> {
  progress: number;
  result?: O;
  error?: string;
}

/**
 * Runs `job` in a fresh worker from `spawn` whenever it changes, dropping the run of the job before. The result of the
 * old job never lands: a run is only shown while its job is the current one. Input byte buffers move to the worker.
 */
export function useWorkerJob<I, O>(spawn: () => Worker, job: I | null): (WorkerRun<O> & { job: I }) | null {
  const [run, setRun] = useState<(WorkerRun<O> & { job: I }) | null>(null);
  useEffect(() => {
    if (!job) return;
    const task = runInWorker<I, O>(spawn, job, (progress) => setRun({ job, progress }));
    task.result.then(
      (result) => setRun({ job, progress: 1, result }),
      (error: Error) => error.name !== "AbortError" && setRun({ job, progress: 1, error: error.message }),
    );
    return task.cancel;
  }, [job]);
  if (!job) return null;
  return run?.job === job ? run : { job, progress: 0 };
}
