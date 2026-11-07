import { describe, expect, it } from "vitest";
import { handleFileJob, type FileJob } from "./file-jobs";
import { digestsOf } from "./logic";

const utf8 = new TextEncoder();

async function hashOf(job: FileJob) {
  const fractions: number[] = [];
  const result = await handleFileJob(job, (fraction) => fractions.push(fraction));
  return { result, fractions };
}

describe("handleFileJob", () => {
  it("hashes a file's bytes exactly as the direct digests do", async () => {
    const bytes = utf8.encode("hello, file");
    const { result, fractions } = await hashOf({ file: new File([bytes], "a.txt"), key: null });

    expect(result).toEqual(digestsOf(bytes, null));
    expect(fractions.at(-1)).toBe(1);
  });

  it("hashes a file as HMAC with a key, like the direct digests do", async () => {
    const bytes = utf8.encode("hello, file");
    const key = utf8.encode("khoá");
    const { result } = await hashOf({ file: new File([bytes], "a.txt"), key });

    expect(result).toEqual(digestsOf(bytes, key));
  });

  it("hashes the empty file", async () => {
    const { result } = await hashOf({ file: new File([], "empty"), key: null });

    expect(result["sha-256"]).toBe(digestsOf(new Uint8Array(0), null)["sha-256"]);
  });

  it("hashes a file larger than one chunk through several progress steps", async () => {
    // Two chunks plus a remainder, so chunking and the last short chunk are both covered.
    const bytes = new Uint8Array(2 * (1 << 22) + 123).fill(0x61);
    const { result, fractions } = await hashOf({ file: new File([bytes], "big.bin"), key: null });

    expect(fractions.length).toBeGreaterThan(1);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(result["md5"]).toBe(digestsOf(bytes, null)["md5"]);
  }, 20_000);
});
