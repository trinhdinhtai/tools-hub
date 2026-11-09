import { describe, expect, it } from "vitest";
import { canonicalZone, formatIso, parseInstant, relativeTime, TimestampError, unixValues, type ParseOptions } from "./logic";

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

const at = (iso: string) => BigInt(Date.parse(iso)) * 1_000_000n;

describe("parseInstant: date strings", () => {
  it.each([
    ["2023-11-14T22:13:20Z", "2023-11-14T22:13:20Z"],
    ["2023-11-14T22:13:20.123Z", "2023-11-14T22:13:20.123Z"],
    ["2023-11-14 22:13:20z", "2023-11-14T22:13:20Z"],
    ["2023-11-15T05:13:20+07:00", "2023-11-14T22:13:20Z"],
    ["2023-11-14T17:13:20-0500", "2023-11-14T22:13:20Z"],
    ["2023-11-15T05:13+07", "2023-11-14T22:13:00Z"],
  ])("reads ISO 8601 %s", (text, iso) => {
    expect(parseInstant(text, UTC)).toEqual({ instant: at(iso), source: "date" });
  });

  it("keeps a fraction of a second down to the nanosecond", () => {
    expect(parseInstant("1970-01-01T00:00:00.123456789Z", UTC).instant).toBe(123_456_789n);
    expect(parseInstant("1970-01-01T00:00:01,5Z", UTC).instant).toBe(1_500_000_000n);
  });

  it("reads a date or time without an offset in the zone given", () => {
    const hcm = { now: NOW, zone: "Asia/Ho_Chi_Minh" };
    expect(parseInstant("2024-03-10 08:00", hcm).instant).toBe(at("2024-03-10T01:00:00Z"));
    expect(parseInstant("2024-03-10", hcm).instant).toBe(at("2024-03-09T17:00:00Z"));
    expect(parseInstant("2024-03-10", UTC).instant).toBe(at("2024-03-10T00:00:00Z"));
  });

  it("follows daylight saving time, reading a skipped hour forward and a repeated hour as the first", () => {
    const ny = { now: NOW, zone: "America/New_York" };
    expect(parseInstant("2024-07-01T12:00", ny).instant).toBe(at("2024-07-01T16:00:00Z"));
    expect(parseInstant("2024-01-01T12:00", ny).instant).toBe(at("2024-01-01T17:00:00Z"));
    // 02:30 does not exist on 10 March: it reads as 03:30 daylight time.
    expect(parseInstant("2024-03-10T02:30", ny).instant).toBe(at("2024-03-10T07:30:00Z"));
    // 01:30 happens twice on 3 November: the first, daylight time, is taken.
    expect(parseInstant("2024-11-03T01:30", ny).instant).toBe(at("2024-11-03T05:30:00Z"));
  });

  it("follows daylight saving time the same way east of UTC", () => {
    const berlin = { now: NOW, zone: "Europe/Berlin" };
    // 02:30 does not exist on 31 March: it reads as 03:30 summer time.
    expect(parseInstant("2024-03-31T02:30", berlin).instant).toBe(at("2024-03-31T01:30:00Z"));
    // 02:30 happens twice on 27 October: the first, summer time, is taken.
    expect(parseInstant("2024-10-27T02:30", berlin).instant).toBe(at("2024-10-27T00:30:00Z"));
    const sydney = { now: NOW, zone: "Australia/Sydney" };
    expect(parseInstant("2024-10-06T02:30", sydney).instant).toBe(at("2024-10-05T16:30:00Z"));
    expect(parseInstant("2024-04-07T02:30", sydney).instant).toBe(at("2024-04-06T15:30:00Z"));
  });

  it("refuses text in other scripts and full-width digits", () => {
    for (const text of ["１７００００００００", "२०२३-११-१४", "2023-11-14T22:13:20Ｚ", "now – 1d"]) {
      expect(() => parseInstant(text, UTC)).toThrow(expect.objectContaining({ reason: "invalid" }));
    }
  });

  it("reads HTTP and email dates (RFC 7231, RFC 2822)", () => {
    expect(parseInstant("Tue, 14 Nov 2023 22:13:20 GMT", UTC).instant).toBe(at("2023-11-14T22:13:20Z"));
    expect(parseInstant("14 Nov 2023 17:13:20 -0500", UTC).instant).toBe(at("2023-11-14T22:13:20Z"));
  });

  it("reads dates before 1970 and past 9999", () => {
    expect(parseInstant("1969-12-31T23:59:59Z", UTC).instant).toBe(-1_000_000_000n);
    expect(parseInstant("+010000-01-01T00:00:00Z", UTC).instant).toBe(at("+010000-01-01T00:00:00Z"));
  });
});

describe("parseInstant: errors", () => {
  const reason = (text: string, options: ParseOptions = UTC) => {
    try {
      parseInstant(text, options);
    } catch (error) {
      return error instanceof TimestampError ? error.reason : error;
    }
    return "parsed";
  };

  it("says the Input is empty", () => {
    expect(reason("")).toBe("empty");
    expect(reason("  \n\t")).toBe("empty");
  });

  it.each(["hello", "1700000000abc", "12.34.56", "2023-13-01", "2023-11-14T25:00Z", "2023-11-14T22:61Z", "1,2", "--5", "١٧٠٠٠٠٠٠٠٠", "１７００００００００", "2023-11-14T22:13:20+25:00", "😀"])(
    "refuses %s as not a timestamp or date",
    (text) => {
      expect(reason(text)).toBe("invalid");
    },
  );

  it("refuses a day the month does not have", () => {
    expect(reason("2023-02-29")).toBe("invalid-date");
    expect(reason("2023-04-31T00:00Z")).toBe("invalid-date");
    expect(parseInstant("2024-02-29", UTC).instant).toBe(at("2024-02-29T00:00:00Z"));
  });

  it("refuses an instant beyond what a calendar date can show (±100 million days)", () => {
    expect(reason("8640000000000001", { ...UTC, unit: "ms" })).toBe("out-of-range");
    expect(reason("99999999999999999999999")).toBe("out-of-range");
    expect(reason("+275760-09-14T00:00:01Z")).toBe("out-of-range");
    expect(reason("+999999-01-01")).toBe("out-of-range");
    expect(reason("-271821-04-19T00:00", { now: NOW, zone: "Asia/Ho_Chi_Minh" })).toBe("out-of-range");
    expect(reason("-271821-04-20T00:00", { now: NOW, zone: "Asia/Ho_Chi_Minh" })).toBe("out-of-range");
    expect(parseInstant("8640000000000000", { ...UTC, unit: "ms" }).instant).toBe(8_640_000_000_000_000_000_000n);
  });

  it("refuses a very long Input quickly", () => {
    const start = performance.now();
    expect(reason("1".repeat(1_000_000))).toBe("out-of-range");
    expect(reason("x".repeat(1_000_000))).toBe("invalid");
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("parseInstant: expressions", () => {
  const ns = (ms: number) => BigInt(ms) * 1_000_000n;

  it("reads now as the current time", () => {
    expect(parseInstant("now", UTC)).toEqual({ instant: ns(NOW), source: "now" });
    expect(parseInstant(" NOW ", UTC).instant).toBe(ns(NOW));
  });

  it.each([
    ["now - 1d", NOW - 86_400_000],
    ["now-1d", NOW - 86_400_000],
    ["now + 2h", NOW + 7_200_000],
    ["now + 1h30m", NOW + 5_400_000],
    ["now - 1.5h", NOW - 5_400_000],
    ["now + 1w", NOW + 7 * 86_400_000],
    ["now - 90s + 500ms", NOW - 89_500],
    ["now + 3 days", NOW + 3 * 86_400_000],
    ["now - 2 hours 15 min", NOW - 8_100_000],
  ])("works out %s", (text, ms) => {
    expect(parseInstant(text, UTC)).toEqual({ instant: ns(ms), source: "now" });
  });

  it("adds a duration to a timestamp or a date as well", () => {
    expect(parseInstant("1700000000 + 1d", UTC)).toEqual({ instant: 1_700_086_400_000_000_000n, source: "unix", unit: "s" });
    expect(parseInstant("2024-01-01T00:00Z - 1d", UTC).instant).toBe(at("2023-12-31T00:00:00Z"));
    expect(parseInstant("2024-01-01 - 1h", UTC).instant).toBe(at("2023-12-31T23:00:00Z"));
  });

  it.each(["now - 1x", "now -", "now - d", "now + 1d -", "now 1d", "tomorrow", "now - 1d2"])("refuses %s", (text) => {
    expect(() => parseInstant(text, UTC)).toThrow(TimestampError);
  });

  it("refuses a sum that leaves the range", () => {
    expect(() => parseInstant("now + 99999999999w", UTC)).toThrow(expect.objectContaining({ reason: "out-of-range" }));
  });
});

describe("unixValues", () => {
  it("gives the instant in every unit, rounding down", () => {
    expect(unixValues(1_700_000_000_123_456_789n)).toEqual({ s: "1700000000", ms: "1700000000123", us: "1700000000123456", ns: "1700000000123456789" });
  });

  it("rounds down before 1970 too, so the value is never past the instant", () => {
    expect(unixValues(-1n)).toEqual({ s: "-1", ms: "-1", us: "-1", ns: "-1" });
    expect(unixValues(-1_000_000_000n)).toEqual({ s: "-1", ms: "-1000", us: "-1000000", ns: "-1000000000" });
  });
});

describe("formatIso", () => {
  const instant = 1_700_000_000_000_000_000n;

  it("writes UTC with Z and milliseconds", () => {
    expect(formatIso(instant, "UTC")).toBe("2023-11-14T22:13:20.000Z");
  });

  it("writes the wall-clock time and offset of a zone", () => {
    expect(formatIso(instant, "Asia/Ho_Chi_Minh")).toBe("2023-11-15T05:13:20.000+07:00");
    expect(formatIso(instant, "America/New_York")).toBe("2023-11-14T17:13:20.000-05:00");
    expect(formatIso(at("2024-07-01T16:00:00Z"), "America/New_York")).toBe("2024-07-01T12:00:00.000-04:00");
    expect(formatIso(instant, "Asia/Kolkata")).toBe("2023-11-15T03:43:20.000+05:30");
  });

  it("shows micro- and nanoseconds only when there are any", () => {
    expect(formatIso(1_700_000_000_123_400_000n, "UTC")).toBe("2023-11-14T22:13:20.123400Z");
    expect(formatIso(1_700_000_000_123_456_789n, "UTC")).toBe("2023-11-14T22:13:20.123456789Z");
    expect(formatIso(-1n, "UTC")).toBe("1969-12-31T23:59:59.999999999Z");
  });

  it("writes years past 9999 and before year 0 with six digits and a sign", () => {
    expect(formatIso(at("+010000-01-01T00:00:00Z"), "UTC")).toBe("+010000-01-01T00:00:00.000Z");
    expect(formatIso(at("-000001-06-01T00:00:00Z"), "UTC")).toBe("-000001-06-01T00:00:00.000Z");
  });
});

describe("relativeTime", () => {
  const ns = (ms: number) => BigInt(ms) * 1_000_000n;

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
    expect(relativeTime(ns(ms), NOW)).toEqual({ value, unit });
  });
});

describe("canonicalZone", () => {
  it("spells a known zone the runtime's way", () => {
    expect(canonicalZone("Asia/Ho_Chi_Minh")).toBe("Asia/Ho_Chi_Minh");
    expect(canonicalZone(" asia/tokyo ")).toBe("Asia/Tokyo");
    expect(canonicalZone("UTC")).toBe("UTC");
  });

  it("refuses zones the runtime does not know", () => {
    expect(canonicalZone("Mars/Olympus")).toBeNull();
    expect(canonicalZone("")).toBeNull();
    expect(canonicalZone("Á/日本")).toBeNull();
  });
});
