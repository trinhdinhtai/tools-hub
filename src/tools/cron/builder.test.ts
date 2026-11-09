import { describe, expect, it } from "vitest";
import { readBuilder, setField } from "./builder";

describe("readBuilder", () => {
  it("reads each field as the choice the builder offers for it", () => {
    expect(readBuilder("*/15 9-17/2 1,15 * 1-5")).toEqual({
      minute: { kind: "step", step: 15 },
      hour: { kind: "range", start: 9, end: 17, step: 2 },
      day: { kind: "values", values: [1, 15] },
      month: { kind: "every" },
      weekday: { kind: "range", start: 1, end: 5, step: 1 },
    });
  });

  it("reads names, ? and lists it has no choice for as the values they allow", () => {
    expect(readBuilder("1-5,10 0 ? JAN-MAR 5-7")).toEqual({
      minute: { kind: "values", values: [1, 2, 3, 4, 5, 10] },
      hour: { kind: "values", values: [0] },
      day: { kind: "every" },
      month: { kind: "range", start: 1, end: 3, step: 1 },
      // 5-7 ends on 7, which the builder shows as Sunday, 0.
      weekday: { kind: "values", values: [0, 5, 6] },
    });
  });

  it("keeps a range of one value a range", () => {
    expect(readBuilder("5-5 * * * *")?.minute).toEqual({ kind: "range", start: 5, end: 5, step: 1 });
  });

  it("reads empty input as every minute, and a macro as what it is short for", () => {
    const everyField = { minute: { kind: "every" }, hour: { kind: "every" }, day: { kind: "every" }, month: { kind: "every" }, weekday: { kind: "every" } };
    expect(readBuilder("")).toEqual(everyField);
    expect(readBuilder("   ")).toEqual(everyField);
    expect(readBuilder("@Daily")).toEqual({ ...everyField, minute: { kind: "values", values: [0] }, hour: { kind: "values", values: [0] } });
  });

  it("marks only the fields it cannot read, so the rest can still be built", () => {
    const spec = readBuilder("61 * * * ０");
    expect(spec?.minute).toBeNull();
    expect(spec?.hour).toEqual({ kind: "every" });
    expect(spec?.weekday).toBeNull();
    expect(readBuilder(`${"9".repeat(10_000)} * * * *`)?.minute).toBeNull();
  });

  it("cannot read an expression that is not five fields, or a macro with no schedule", () => {
    expect(readBuilder("* * * *")).toBeNull();
    expect(readBuilder("* * * * * *")).toBeNull();
    expect(readBuilder("@reboot")).toBeNull();
    expect(readBuilder("@sometimes")).toBeNull();
    expect(readBuilder("* ".repeat(10_000))).toBeNull();
  });
});

describe("setField", () => {
  it("writes the builder's choice into its field and leaves the others as written", () => {
    expect(setField("0 9 * * MON-FRI", "minute", { kind: "step", step: 15 })).toBe("*/15 9 * * MON-FRI");
    expect(setField("0 9 * * 1", "hour", { kind: "range", start: 9, end: 17, step: 1 })).toBe("0 9-17 * * 1");
    expect(setField("0 9 * * 1", "hour", { kind: "range", start: 8, end: 18, step: 2 })).toBe("0 8-18/2 * * 1");
    expect(setField("0 9 1 * *", "day", { kind: "every" })).toBe("0 9 * * *");
  });

  it("writes picked values in order, runs of three or more as ranges", () => {
    expect(setField("* * * * *", "weekday", { kind: "values", values: [5, 1, 2, 3] })).toBe("* * * * 1-3,5");
    expect(setField("* * * * *", "month", { kind: "values", values: [1, 2, 6, 7] })).toBe("* * * 1,2,6,7 *");
  });

  it("builds from every minute when the input is empty, and expands a macro", () => {
    expect(setField("", "hour", { kind: "values", values: [9] })).toBe("* 9 * * *");
    expect(setField("@daily", "minute", { kind: "values", values: [30] })).toBe("30 0 * * *");
  });

  it("tidies the spacing and keeps a field it could not read", () => {
    expect(setField("  0   61 * * ０ ", "minute", { kind: "every" })).toBe("* 61 * * ０");
  });

  it("round-trips what it writes", () => {
    const text = setField(setField("* * * * *", "minute", { kind: "step", step: 10 })!, "weekday", { kind: "values", values: [0, 6] });
    expect(readBuilder(text!)).toMatchObject({ minute: { kind: "step", step: 10 }, weekday: { kind: "values", values: [0, 6] } });
  });

  it("returns null when the expression is not five fields, so nothing typed is thrown away", () => {
    expect(setField("* * * *", "minute", { kind: "every" })).toBeNull();
    expect(setField("@reboot", "minute", { kind: "every" })).toBeNull();
  });
});
