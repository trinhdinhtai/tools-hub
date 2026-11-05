import { describe, expect, it } from "vitest";
import { inlineWorker } from "../../tests/inline-worker";
import { runInWorker } from "./worker";

const spawn = (Worker: new () => object) => () => new Worker() as unknown as Worker;

describe("runInWorker", () => {
  it("resolves with what the worker's handler returns, then terminates the worker", async () => {
    const Fake = inlineWorker(async (n: number) => n * 2);
    await expect(runInWorker(spawn(Fake), 21).result).resolves.toBe(42);
    expect(Fake.instances[0]!.terminated).toBe(true);
  });

  it("reports the handler's progress", async () => {
    const Fake = inlineWorker(async (_: null, progress) => {
      progress(0.5);
      progress(1);
      return "done";
    });
    const seen: number[] = [];
    await runInWorker(spawn(Fake), null, (fraction) => seen.push(fraction)).result;
    expect(seen).toEqual([0.5, 1]);
  });

  it("rejects with the handler's error message", async () => {
    const Fake = inlineWorker(async () => {
      throw new RangeError("too big");
    });
    await expect(runInWorker(spawn(Fake), null).result).rejects.toThrow("too big");
    expect(Fake.instances[0]!.terminated).toBe(true);
  });

  it("stops the worker when cancelled and rejects with an AbortError", async () => {
    const Fake = inlineWorker(() => new Promise<never>(() => {}));
    const task = runInWorker(spawn(Fake), null);
    task.cancel();
    await expect(task.result).rejects.toMatchObject({ name: "AbortError" });
    expect(Fake.instances[0]!.terminated).toBe(true);
  });
});
