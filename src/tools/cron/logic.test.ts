import { describe, expect, it } from "vitest";
import { CronError, parseCron } from "./logic";

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
