import { describe, expect, it } from "vitest";
import { CronError, explain, nextRuns, parseCron } from "./logic";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function reasonOf(text: string): unknown {
  try {
    parseCron(text);
  } catch (error) {
    if (error instanceof CronError) return { reason: error.reason, ...error.details };
    throw error;
  }
  return "parsed";
}

describe("parseCron", () => {
  it("reads the five fields into the values each one allows", () => {
    const cron = parseCron("*/15 9-17 1,15 * 1-5");
    expect(cron.fields.minute.values).toEqual([0, 15, 30, 45]);
    expect(cron.fields.hour.values).toEqual(range(9, 17));
    expect(cron.fields.day.values).toEqual([1, 15]);
    expect(cron.fields.month.values).toEqual(range(1, 12));
    expect(cron.fields.weekday.values).toEqual([1, 2, 3, 4, 5]);
    expect(cron.fields.minute.text).toBe("*/15");
  });

  it("reads month and weekday names in any case, and 7 as Sunday", () => {
    const cron = parseCron("0 0 * jan,Jul-SEP sun,7,FRI");
    expect(cron.fields.month.values).toEqual([1, 7, 8, 9]);
    expect(cron.fields.weekday.values).toEqual([0, 5]);
  });

  it("reads a start with a step as running to the end of the field", () => {
    expect(parseCron("5/20 * * * *").fields.minute.values).toEqual([5, 25, 45]);
    expect(parseCron("0 8-18/4 * * *").fields.hour.values).toEqual([8, 12, 16]);
  });

  it("allows leading zeros", () => {
    expect(parseCron("0005 09 * * *").fields.minute.values).toEqual([5]);
    expect(parseCron("*/0030 * * * *").fields.minute.values).toEqual([0, 30]);
  });

  it("reads ? as * in the day fields", () => {
    expect(parseCron("0 0 ? * MON").fields.day.restricted).toBe(false);
  });

  it("marks a field that starts with * as unrestricted, even with a step", () => {
    const cron = parseCron("0 0 */2 * 1");
    expect(cron.fields.day.restricted).toBe(false);
    expect(cron.fields.weekday.restricted).toBe(true);
  });

  it.each([
    ["@yearly", "0 0 1 1 *"],
    ["@annually", "0 0 1 1 *"],
    ["@monthly", "0 0 1 * *"],
    ["@weekly", "0 0 * * 0"],
    ["@daily", "0 0 * * *"],
    ["@midnight", "0 0 * * *"],
    ["@HOURLY", "0 * * * *"],
  ])("reads the macro %s as %s", (macro, expanded) => {
    const cron = parseCron(macro);
    expect(cron.fields).toEqual(parseCron(expanded).fields);
    expect(cron.macro).toBe(macro.toLowerCase());
  });

  it("allows spaces and tabs around and between the fields", () => {
    expect(parseCron("  0\t9  * *   *\n").fields.hour.values).toEqual([9]);
  });

  it.each([
    ["", { reason: "empty" }],
    ["   ", { reason: "empty" }],
    ["* * * *", { reason: "field-count", count: 4 }],
    ["0 0 * * * *", { reason: "field-count", count: 6 }],
    ["60 * * * *", { reason: "out-of-range", field: "minute", value: "60", min: 0, max: 59 }],
    ["0 24 * * *", { reason: "out-of-range", field: "hour", value: "24", min: 0, max: 23 }],
    ["0 0 0 * *", { reason: "out-of-range", field: "day", value: "0", min: 1, max: 31 }],
    ["0 0 * 13 *", { reason: "out-of-range", field: "month", value: "13", min: 1, max: 12 }],
    ["0 0 * * 8", { reason: "out-of-range", field: "weekday", value: "8", min: 0, max: 7 }],
    ["0 0 * foo *", { reason: "invalid", field: "month", value: "foo" }],
    ["0 0 * * MON-", { reason: "invalid", field: "weekday", value: "MON-" }],
    ["1,,2 * * * *", { reason: "invalid", field: "minute", value: "1,,2" }],
    ["30-10 * * * *", { reason: "backwards", field: "minute", value: "30-10" }],
    ["*/0 * * * *", { reason: "zero-step", field: "minute", value: "*/0" }],
    ["*/0000 * * * *", { reason: "zero-step", field: "minute", value: "*/0000" }],
    ["? * * * *", { reason: "invalid", field: "minute", value: "?" }],
    ["0 0 L * *", { reason: "invalid", field: "day", value: "L" }],
    ["@reboot", { reason: "reboot" }],
    ["@often", { reason: "unknown-macro", value: "@often" }],
  ])("rejects %j", (text, expected) => {
    expect(reasonOf(text)).toEqual(expected);
  });

  it("rejects digits that are not ASCII and other Unicode", () => {
    expect(reasonOf("０ 9 * * *")).toMatchObject({ reason: "invalid", field: "minute" });
    expect(reasonOf("0 9 * * thứ2")).toMatchObject({ reason: "invalid", field: "weekday" });
  });

  it("handles very large Input without hanging", () => {
    const many = Array.from({ length: 50_000 }, (_, i) => i % 60).join(",");
    expect(parseCron(`${many} * * * *`).fields.minute.values).toEqual(range(0, 59));
    expect(reasonOf("* ".repeat(100_000))).toEqual({ reason: "field-count", count: 100_000 });
    expect(reasonOf(`${"9".repeat(10_000)} * * * *`)).toMatchObject({ reason: "out-of-range", field: "minute" });
  });
});

describe("explain", () => {
  it.each([
    ["* * * * *", "Every minute", "Mỗi phút"],
    ["*/15 * * * *", "Every 15 minutes", "Mỗi 15 phút"],
    ["0 9 * * *", "At 09:00", "Lúc 09:00"],
    ["30 8,17 * * *", "At 08:30 and 17:30", "Lúc 08:30 và 17:30"],
    ["30 * * * *", "At minute 30 of every hour", "Vào phút 30 của mỗi giờ"],
    ["0,30 * * * *", "At minutes 0 and 30 of every hour", "Vào phút 0 và 30 của mỗi giờ"],
    ["*/15 9-17 * * 1-5", "Every 15 minutes, between 09:00 and 17:59, Monday through Friday", "Mỗi 15 phút, từ 09:00 đến 17:59, từ Thứ Hai đến Thứ Sáu"],
    ["* 9 * * *", "Every minute, between 09:00 and 09:59", "Mỗi phút, từ 09:00 đến 09:59"],
    ["0 */2 * * *", "At minute 0, every 2 hours", "Vào phút 0, mỗi 2 giờ"],
    ["0-30 8-18/2 * * *", "At minutes 0 through 30, every 2 hours from 8 through 18", "Vào phút từ 0 đến 30, mỗi 2 giờ từ 8 đến 18"],
    ["0 0 1 * *", "At 00:00, on day 1 of the month", "Lúc 00:00, vào ngày 1 của tháng"],
    ["0 0 1,15 * *", "At 00:00, on days 1 and 15 of the month", "Lúc 00:00, vào ngày 1 và 15 của tháng"],
    ["0 0 */2 * *", "At 00:00, every 2 days", "Lúc 00:00, mỗi 2 ngày"],
    ["5 0 * 8 *", "At 00:05, in August", "Lúc 00:05, vào tháng 8"],
    ["0 0 1 1-3,10 *", "At 00:00, on day 1 of the month, in January through March and October", "Lúc 00:00, vào ngày 1 của tháng, vào từ tháng 1 đến tháng 3 và tháng 10"],
    ["0 0 1 */3 *", "At 00:00, on day 1 of the month, every 3 months", "Lúc 00:00, vào ngày 1 của tháng, mỗi 3 tháng"],
    ["0 22 * * 1,3,5", "At 22:00, on Monday, Wednesday and Friday", "Lúc 22:00, vào Thứ Hai, Thứ Tư và Thứ Sáu"],
    ["0 0 * * 7", "At 00:00, on Sunday", "Lúc 00:00, vào Chủ Nhật"],
    ["0 0 13 * FRI", "At 00:00, on day 13 of the month or on Friday", "Lúc 00:00, vào ngày 13 của tháng hoặc vào Thứ Sáu"],
    ["0 9,10,11 * * *", "At 09:00, 10:00 and 11:00", "Lúc 09:00, 10:00 và 11:00"],
  ])("explains %s", (text, en, vi) => {
    const cron = parseCron(text);
    expect(explain(cron, "en")).toBe(en);
    expect(explain(cron, "vi")).toBe(vi);
  });

  it("explains a macro as what it stands for", () => {
    expect(explain(parseCron("@weekly"), "en")).toBe("At 00:00, on Sunday");
    expect(explain(parseCron("@hourly"), "vi")).toBe("Vào phút 0 của mỗi giờ");
  });

  it("lists minutes rather than times when there are too many times to read", () => {
    expect(explain(parseCron("0,10,20,30,40,50 9,17 * * *"), "en")).toBe("At minutes 0, 10, 20, 30, 40 and 50, during hours 9 and 17");
    expect(explain(parseCron("0,10,20,30,40,50 9,17 * * *"), "vi")).toBe("Vào phút 0, 10, 20, 30, 40 và 50, trong giờ 9 và 17");
  });
});

const utc = (iso: string) => Date.parse(iso);
const runsAt = (text: string, from: string, zone = "UTC", count = 5) =>
  nextRuns(parseCron(text), utc(from), zone, count).map((run) => new Date(run.at).toISOString());

describe("nextRuns", () => {
  it("lists the next runs after the given instant", () => {
    expect(runsAt("*/15 * * * *", "2026-11-09T12:07:30Z", "UTC", 3)).toEqual([
      "2026-11-09T12:15:00.000Z",
      "2026-11-09T12:30:00.000Z",
      "2026-11-09T12:45:00.000Z",
    ]);
  });

  it("leaves out a run at the very instant given", () => {
    expect(runsAt("*/15 * * * *", "2026-11-09T12:15:00Z", "UTC", 1)).toEqual(["2026-11-09T12:30:00.000Z"]);
  });

  it("works out the times in the zone given, with its wall time and offset", () => {
    const [run] = nextRuns(parseCron("0 9 * * *"), utc("2026-11-09T03:00:00Z"), "Asia/Ho_Chi_Minh", 1);
    expect(run).toEqual({ at: utc("2026-11-10T02:00:00Z"), wall: "2026-11-10 09:00", weekday: 2, offset: 420 });
  });

  it("runs on either the day of the month or the weekday when both are restricted", () => {
    expect(runsAt("0 0 13 * 5", "2026-01-01T00:00:00Z", "UTC", 4)).toEqual([
      "2026-01-02T00:00:00.000Z",
      "2026-01-09T00:00:00.000Z",
      "2026-01-13T00:00:00.000Z",
      "2026-01-16T00:00:00.000Z",
    ]);
  });

  it("runs only on days both allow when one of them starts with *", () => {
    expect(runsAt("0 0 */2 * 1", "2026-01-01T00:00:00Z", "UTC", 3)).toEqual([
      "2026-01-05T00:00:00.000Z",
      "2026-01-19T00:00:00.000Z",
      "2026-02-09T00:00:00.000Z",
    ]);
  });

  it("finds a leap day years ahead, skipping 2100", () => {
    expect(runsAt("0 0 29 2 *", "2026-01-01T00:00:00Z", "UTC", 1)).toEqual(["2028-02-29T00:00:00.000Z"]);
    expect(runsAt("0 0 29 2 *", "2097-01-01T00:00:00Z", "UTC", 1)).toEqual(["2104-02-29T00:00:00.000Z"]);
  });

  it("finds no runs for a day that never comes", () => {
    expect(runsAt("0 0 31 4,6 *", "2026-01-01T00:00:00Z")).toEqual([]);
  });

  it("skips a time that does not exist when the clocks go forward", () => {
    // New York moves from 02:00 to 03:00 on 2026-03-08.
    expect(runsAt("30 2 * * *", "2026-03-07T12:00:00Z", "America/New_York", 2)).toEqual([
      "2026-03-09T06:30:00.000Z",
      "2026-03-10T06:30:00.000Z",
    ]);
  });

  it("runs once at a time that happens twice when the clocks go back", () => {
    // New York goes from 02:00 back to 01:00 on 2026-11-01.
    expect(runsAt("30 1 * * *", "2026-10-31T12:00:00Z", "America/New_York", 2)).toEqual([
      "2026-11-01T05:30:00.000Z",
      "2026-11-02T06:30:00.000Z",
    ]);
  });

  it("gives back nothing for a count of 0", () => {
    expect(runsAt("* * * * *", "2026-01-01T00:00:00Z", "UTC", 0)).toEqual([]);
  });

  it("rejects a zone the runtime does not know", () => {
    expect(() => nextRuns(parseCron("* * * * *"), 0, "Mars/Olympus", 1)).toThrow(expect.objectContaining({ reason: "unknown-zone" }));
  });
});
