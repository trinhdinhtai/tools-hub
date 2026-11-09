import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

// 2023-11-14T22:13:20Z.
const NOW = Date.UTC(2023, 10, 14, 22, 13, 20);

describe("relativeTime", () => {
  it.each([
    [NOW, 0, "second"],
    [NOW - 45_000, -45, "second"],
    [NOW + 90_000, 2, "minute"],
    [NOW - 3 * 3_600_000, -3, "hour"],
    [NOW - 86_400_000, -1, "day"],
    [NOW + 20 * 86_400_000, 3, "week"],
    [NOW - 75 * 86_400_000, -2, "month"],
    [NOW - 3 * 365 * 86_400_000, -3, "year"],
  ] as const)("puts %d in the largest fitting unit", (ms, value, unit) => {
    expect(relativeTime(ms, NOW)).toEqual({ value, unit });
  });
});
