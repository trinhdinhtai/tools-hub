import { describe, expect, it } from "vitest";
import { parseInstant } from "./logic";

// 2023-11-14T22:13:20Z, a known worked example.
const NOW = Date.UTC(2023, 10, 14, 22, 13, 20);
const UTC = { now: NOW, zone: "UTC" };

describe("parseInstant: Unix timestamps", () => {
  it("reads ten digits as seconds", () => {
    expect(parseInstant("1700000000", UTC)).toEqual({ instant: 1_700_000_000_000_000_000n, source: "unix", unit: "s" });
  });

  it.each([
    ["1700000000123", "ms", 1_700_000_000_123_000_000n],
    ["1700000000123456", "us", 1_700_000_000_123_456_000n],
    ["1700000000123456789", "ns", 1_700_000_000_123_456_789n],
    ["0", "s", 0n],
    ["99999999999", "s", 99_999_999_999_000_000_000n],
    ["100000000000", "ms", 100_000_000_000_000_000n],
  ] as const)("tells the unit of %s from its size: %s", (text, unit, instant) => {
    expect(parseInstant(text, UTC)).toMatchObject({ instant, unit });
  });

  it("reads negative timestamps, before 1970, by their size too", () => {
    expect(parseInstant("-86400", UTC)).toMatchObject({ instant: -86_400_000_000_000n, unit: "s" });
    expect(parseInstant("-86400000", UTC)).toMatchObject({ instant: -86_400_000_000_000_000n, unit: "s" });
    expect(parseInstant("-100000000000", UTC)).toMatchObject({ instant: -100_000_000_000_000_000n, unit: "ms" });
  });

  it("keeps a fraction down to the nanosecond, dropping what is finer", () => {
    expect(parseInstant("1700000000.5", UTC)).toMatchObject({ instant: 1_700_000_000_500_000_000n, unit: "s" });
    expect(parseInstant("1700000000.1234567891", UTC)).toMatchObject({ instant: 1_700_000_000_123_456_789n });
    expect(parseInstant("1700000000123.5", UTC)).toMatchObject({ instant: 1_700_000_000_123_500_000n, unit: "ms" });
  });

  it("allows spaces around it and digit-group underscores or commas", () => {
    expect(parseInstant("  1_700_000_000 \n", UTC)).toMatchObject({ instant: 1_700_000_000_000_000_000n });
    expect(parseInstant("1,700,000,000", UTC)).toMatchObject({ instant: 1_700_000_000_000_000_000n });
  });

  it("reads in the unit asked for instead of guessing", () => {
    expect(parseInstant("1700000000", { ...UTC, unit: "ms" })).toMatchObject({ instant: 1_700_000_000_000_000n, unit: "ms" });
    expect(parseInstant("1700000000", { ...UTC, unit: "auto" })).toMatchObject({ unit: "s" });
  });
});
