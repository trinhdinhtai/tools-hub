import { describe, expect, it } from "vitest";
import { convert, quantityOf, UnitError, unitsOf } from "./logic";

/** The converted value in one unit, from the list `convert` returns. */
function valueIn(results: ReturnType<typeof convert>, unit: string): string | null | undefined {
  return results.find((result) => result.unit === unit)?.value;
}

describe("convert", () => {
  it("converts a length into every length unit", () => {
    const results = convert("1", "km");
    expect(valueIn(results, "m")).toBe("1000");
    expect(valueIn(results, "cm")).toBe("100000");
    expect(valueIn(results, "mi")).toBe("0.621371192237334");
    expect(valueIn(results, "ft")).toBe("3280.83989501312");
  });

  it("converts a data size between decimal and binary units, exact while the bytes are whole", () => {
    const results = convert("1", "GiB");
    expect(valueIn(results, "B")).toBe("1073741824");
    expect(valueIn(results, "MiB")).toBe("1024");
    expect(valueIn(results, "MB")).toBe("1073.741824");
    expect(valueIn(results, "GB")).toBe("1.073741824");
    expect(valueIn(results, "bit")).toBe("8589934592");
    expect(valueIn(convert("1", "PiB"), "B")).toBe("1125899906842624");
    expect(valueIn(convert("1500", "kB"), "KiB")).toBe("1464.84375");
    expect(valueIn(convert("100", "Mbit"), "MB")).toBe("12.5");
  });

  it("converts a mass into every mass unit", () => {
    const results = convert("1", "kg");
    expect(valueIn(results, "g")).toBe("1000");
    expect(valueIn(results, "lb")).toBe("2.20462262184878");
    expect(valueIn(results, "oz")).toBe("35.2739619495804");
    expect(valueIn(convert("2.5", "t"), "kg")).toBe("2500");
  });

  it("converts a temperature between Celsius, Fahrenheit and Kelvin", () => {
    expect(convert("100", "c")).toEqual([
      { unit: "c", value: "100" },
      { unit: "f", value: "212" },
      { unit: "k", value: "373.15" },
    ]);
    expect(valueIn(convert("-40", "f"), "c")).toBe("-40");
    expect(valueIn(convert("0", "k"), "c")).toBe("-273.15");
    expect(valueIn(convert("98.6", "f"), "c")).toBe("37");
  });

  it("refuses a temperature below absolute zero", () => {
    expect(() => convert("-273.16", "c")).toThrow(new UnitError("below-absolute-zero"));
    expect(() => convert("-1", "k")).toThrow(new UnitError("below-absolute-zero"));
    expect(() => convert("-460", "f")).toThrow(new UnitError("below-absolute-zero"));
  });

  it("reads decimals, exponents, signs and digit separators", () => {
    expect(valueIn(convert(" 1.5 ", "m"), "cm")).toBe("150");
    expect(valueIn(convert(".5", "m"), "cm")).toBe("50");
    expect(valueIn(convert("1e3", "m"), "km")).toBe("1");
    expect(valueIn(convert("+2", "m"), "cm")).toBe("200");
    expect(valueIn(convert("1_000", "m"), "km")).toBe("1");
    expect(valueIn(convert("1 000 000", "B"), "MB")).toBe("1");
  });

  it("reads full-width digits and the Unicode minus sign", () => {
    expect(valueIn(convert("１２", "m"), "cm")).toBe("1200");
    expect(valueIn(convert("\u22125", "c"), "k")).toBe("268.15");
  });

  it("writes very large and very small results in exponent form", () => {
    expect(valueIn(convert("1e30", "km"), "nm")).toBe("1e+42");
    expect(valueIn(convert("1", "nm"), "km")).toBe("1e-12");
  });

  it("refuses Input it cannot read, with a reason the UI translates", () => {
    expect(() => convert("", "m")).toThrow(new UnitError("empty"));
    expect(() => convert("   ", "m")).toThrow(new UnitError("empty"));
    expect(() => convert("abc", "m")).toThrow(new UnitError("invalid"));
    expect(() => convert("mười", "m")).toThrow(new UnitError("invalid"));
    expect(() => convert("1.2.3", "m")).toThrow(new UnitError("invalid"));
    expect(() => convert("0x10", "m")).toThrow(new UnitError("invalid"));
    expect(() => convert("Infinity", "m")).toThrow(new UnitError("invalid"));
    expect(() => convert("1__0", "m")).toThrow(new UnitError("invalid"));
    expect(() => convert("5 km", "m")).toThrow(new UnitError("invalid"));
    expect(() => convert("1,5", "m")).toThrow(new UnitError("comma"));
  });

  it("refuses a negative length, mass or data size", () => {
    expect(() => convert("-1", "m")).toThrow(new UnitError("negative"));
    expect(() => convert("-1", "kg")).toThrow(new UnitError("negative"));
    expect(() => convert("-1", "B")).toThrow(new UnitError("negative"));
    expect(valueIn(convert("-0", "m"), "cm")).toBe("0");
  });

  it("refuses a typed value too large to read", () => {
    expect(() => convert("1e400", "m")).toThrow(new UnitError("too-large"));
    expect(() => convert("9".repeat(400), "m")).toThrow(new UnitError("too-large"));
  });

  it("leaves out only the units a value is too large to write in", () => {
    const results = convert("1e300", "km");
    expect(valueIn(results, "nm")).toBeNull();
    expect(valueIn(results, "m")).toBe("1e+303");
  });

  it("writes integers beyond 2^53 in exponent form rather than with false trailing zeros", () => {
    expect(valueIn(convert("9007199254740993", "B"), "bit")).toBe("7.20575940379279e+16");
    expect(valueIn(convert("9".repeat(20), "B"), "kB")).toBe("1e+17");
    expect(valueIn(convert("9007199254740991", "B"), "B")).toBe("9007199254740991");
  });

  it("keeps temperatures near absolute zero free of rounding noise", () => {
    expect(valueIn(convert("-273.149999999999", "c"), "k")).toBe("1e-12");
    expect(valueIn(convert("-459.66", "f"), "k")).toBe("0.005555555556");
    expect(valueIn(convert("-459.67", "f"), "k")).toBe("0");
    expect(valueIn(convert("0", "k"), "f")).toBe("-459.67");
  });

  it("refuses a typed value too small to keep its digits, rather than reading it as 0", () => {
    expect(() => convert("1e-400", "m")).toThrow(new UnitError("too-small"));
    expect(() => convert("1e-320", "km")).toThrow(new UnitError("too-small"));
    expect(valueIn(convert("0e-400", "m"), "cm")).toBe("0");
  });

  it("leaves out only the units a value is too small to write in, converting tiny values without losing digits", () => {
    const results = convert("1e-300", "km");
    expect(valueIn(results, "nm")).toBe("1e-288");
    expect(valueIn(results, "m")).toBe("1e-297");
    expect(valueIn(convert("1e-305", "nm"), "km")).toBeNull();
  });
});

describe("unitsOf and quantityOf", () => {
  it("lists a quantity's units, each naming its quantity back", () => {
    expect(unitsOf("temperature")).toEqual(["c", "f", "k"]);
    for (const unit of unitsOf("data")) expect(quantityOf(unit)).toBe("data");
    expect(quantityOf("KiB")).toBe("data");
    expect(quantityOf("st")).toBe("mass");
  });
});
