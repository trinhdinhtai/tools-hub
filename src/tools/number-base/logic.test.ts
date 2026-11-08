import { describe, expect, it } from "vitest";
import { NumberBaseError, evaluateExpression, parseNumber, ROMAN_MAX, toBase, toRoman, toSigned, toggleBit, toTwoComplement, wrapUnsigned } from "./logic";

describe("evaluateExpression", () => {
  it("evaluates integer arithmetic with the usual precedence", () => {
    expect(evaluateExpression("1 + 2 * 3")).toBe(7n);
    expect(evaluateExpression("(1 + 2) * 3")).toBe(9n);
    expect(evaluateExpression("2 * (3 + 4) - 5")).toBe(9n);
    expect(evaluateExpression("-3 + 5")).toBe(2n);
    expect(evaluateExpression("100 / 7")).toBe(14n); // truncates toward zero
    expect(evaluateExpression("-100 / 7")).toBe(-14n);
    expect(evaluateExpression("100 % 7")).toBe(2n);
    expect(evaluateExpression("-100 % 7")).toBe(-2n); // sign follows the dividend
  });

  it("evaluates bitwise operations and shifts", () => {
    expect(evaluateExpression("0xff & 0x0f")).toBe(15n);
    expect(evaluateExpression("0xf0 | 0x0f")).toBe(255n);
    expect(evaluateExpression("0xff ^ 0x0f")).toBe(240n);
    expect(evaluateExpression("~0")).toBe(-1n);
    expect(evaluateExpression("1 << 10")).toBe(1024n);
    expect(evaluateExpression("-16 >> 2")).toBe(-4n); // arithmetic shift
    expect(evaluateExpression("1 << 3 | 1 << 1")).toBe(10n);
  });

  it("accepts base prefixes and underscores inside literals", () => {
    expect(evaluateExpression("0b101 + 0o7 + 0xff + 1_000")).toBe(1267n);
    expect(evaluateExpression("0xff_ff")).toBe(65535n);
  });

  it("rejects malformed expressions with a clear reason", () => {
    expect(() => evaluateExpression("")).toThrow(NumberBaseError);
    expect(() => evaluateExpression("1 +")).toThrow(NumberBaseError);
    expect(() => evaluateExpression("(1 + 2")).toThrow(NumberBaseError);
    expect(() => evaluateExpression("1 + * 2")).toThrow(NumberBaseError);
    expect(() => evaluateExpression("1 2")).toThrow(NumberBaseError);
    expect(() => evaluateExpression("hai")).toThrow(NumberBaseError);
    try {
      evaluateExpression("(1 + 2");
    } catch (error) {
      expect((error as NumberBaseError).reason).toBe("invalid");
    }
  });

  it("rejects division and modulo by zero", () => {
    expect(() => evaluateExpression("1 / 0")).toThrow(NumberBaseError);
    expect(() => evaluateExpression("1 % 0")).toThrow(NumberBaseError);
    try {
      evaluateExpression("1 / 0");
    } catch (error) {
      expect((error as NumberBaseError).reason).toBe("division-by-zero");
    }
  });

  it("rejects shifts that would try to build a gigantic integer instead of crashing", () => {
    expect(() => evaluateExpression("1 << 99999999999")).toThrow(NumberBaseError);
    expect(() => evaluateExpression("1 << -1")).toThrow(NumberBaseError);
    expect(() => evaluateExpression("1 >> -1")).toThrow(NumberBaseError);
    expect(evaluateExpression("1 << 1024")).toBe((1n << 1024n));
  });
});

describe("two's complement and the bit grid", () => {
  it("writes the two's complement of a value at a fixed width", () => {
    expect(toTwoComplement(-1n, 8)).toBe("11111111");
    expect(toTwoComplement(-128n, 8)).toBe("10000000");
    expect(toTwoComplement(42n, 8)).toBe("00101010");
    expect(toTwoComplement(42n, 16)).toBe("0000000000101010");
    expect(toTwoComplement(-2n, 16)).toBe("1111111111111110");
  });

  it("wraps values that do not fit the width, like a fixed-width register", () => {
    expect(toTwoComplement(300n, 8)).toBe("00101100"); // 300 mod 256
    expect(toTwoComplement(-129n, 8)).toBe("01111111"); // -129 mod 256
    expect(wrapUnsigned(300n, 8)).toBe(44n);
    expect(wrapUnsigned(-1n, 16)).toBe(65535n);
    expect(toSigned(65535n, 16)).toBe(-1n);
    expect(toSigned(128n, 8)).toBe(-128n);
    expect(toSigned(42n, 8)).toBe(42n);
  });

  it("toggles a single bit of the unsigned grid value", () => {
    expect(toggleBit(0b0000n, 3)).toBe(0b1000n);
    expect(toggleBit(0b1000n, 3)).toBe(0n);
    expect(toggleBit(0n, 0)).toBe(1n);
    // Round trip through the signed view: set the top bit of a byte and the signed value flips negative.
    expect(toSigned(toggleBit(wrapUnsigned(42n, 8), 7), 8)).toBe(-86n);
  });
});

describe("toBase", () => {
  it("formats every common base from known values", () => {
    expect(toBase(255n, 2)).toBe("11111111");
    expect(toBase(255n, 8)).toBe("377");
    expect(toBase(255n, 10)).toBe("255");
    expect(toBase(255n, 16)).toBe("ff");
    expect(toBase(255n, 36)).toBe("73");
  });

  it("formats zero, negatives and numbers beyond 2^53", () => {
    expect(toBase(0n, 2)).toBe("0");
    expect(toBase(-255n, 16)).toBe("-ff");
    expect(toBase(123456789012345678901234567890n, 16)).toBe("18ee90ff6c373e0ee4e3f0ad2");
  });
});

describe("toRoman", () => {
  it("writes Roman numerals with the subtractive notation", () => {
    expect(toRoman(1n)).toBe("I");
    expect(toRoman(4n)).toBe("IV");
    expect(toRoman(9n)).toBe("IX");
    expect(toRoman(14n)).toBe("XIV");
    expect(toRoman(40n)).toBe("XL");
    expect(toRoman(90n)).toBe("XC");
    expect(toRoman(400n)).toBe("CD");
    expect(toRoman(900n)).toBe("CM");
    expect(toRoman(2026n)).toBe("MMXXVI");
    expect(toRoman(3999n)).toBe("MMMCMXCIX");
  });

  it("returns null outside 1–3999, the range Roman numerals can write", () => {
    expect(ROMAN_MAX).toBe(3999n);
    expect(toRoman(0n)).toBeNull();
    expect(toRoman(-5n)).toBeNull();
    expect(toRoman(4000n)).toBeNull();
  });
});

describe("parseNumber", () => {
  it("parses decimal, including numbers beyond 2^53 without losing precision", () => {
    expect(parseNumber("42")).toBe(42n);
    expect(parseNumber("9007199254740993")).toBe(9007199254740993n); // 2^53 + 1, a float would round this down
    expect(parseNumber("123456789012345678901234567890")).toBe(123456789012345678901234567890n);
    expect(parseNumber("-17")).toBe(-17n);
    expect(parseNumber("+17")).toBe(17n);
  });

  it("detects the base from 0x, 0b and 0o prefixes, and accepts an explicit base", () => {
    expect(parseNumber("0xff")).toBe(255n);
    expect(parseNumber("0XFF")).toBe(255n);
    expect(parseNumber("0b1010")).toBe(10n);
    expect(parseNumber("0o17")).toBe(15n);
    expect(parseNumber("ff", 16)).toBe(255n);
    expect(parseNumber("1010", 2)).toBe(10n);
    expect(parseNumber("zz", 36)).toBe(1295n);
    expect(parseNumber("-0x10")).toBe(-16n);
  });

  it("ignores underscores between digits", () => {
    expect(parseNumber("1_000_000")).toBe(1000000n);
    expect(parseNumber("0xff_ff")).toBe(65535n);
  });

  it("rejects an empty or whitespace-only input", () => {
    expect(() => parseNumber("")).toThrow(NumberBaseError);
    expect(() => parseNumber("   ")).toThrow(NumberBaseError);
    try {
      parseNumber("");
    } catch (error) {
      expect((error as NumberBaseError).reason).toBe("empty");
    }
  });

  it("rejects digits outside the base, and a bare prefix with no digits", () => {
    expect(() => parseNumber("129", 8)).toThrow(NumberBaseError);
    expect(() => parseNumber("0x")).toThrow(NumberBaseError);
    expect(() => parseNumber("0b")).toThrow(NumberBaseError);
    try {
      parseNumber("129", 8);
    } catch (error) {
      expect((error as NumberBaseError).reason).toBe("invalid");
    }
    try {
      parseNumber("0x");
    } catch (error) {
      expect((error as NumberBaseError).reason).toBe("no-digits");
    }
  });

  it("rejects stray characters, including Unicode digits and letters", () => {
    expect(() => parseNumber("12 3", 10)).toThrow(NumberBaseError); // a space inside, not a separator
    expect(() => parseNumber("١٢٣")).toThrow(NumberBaseError); // Arabic-Indic digits
    expect(() => parseNumber("1e3")).toThrow(NumberBaseError); // no scientific notation
    expect(() => parseNumber("hai")).toThrow(NumberBaseError);
    expect(() => parseNumber("_42")).toThrow(NumberBaseError); // separator may not lead
    expect(() => parseNumber("42_")).toThrow(NumberBaseError); // ...nor trail
    expect(() => parseNumber("1__2")).toThrow(NumberBaseError); // ...nor double up
  });
});
