import { describe, expect, it } from "vitest";
import { generate, GenerateError, MAX_COUNT, MAX_LENGTH, MIN_COUNT, MIN_LENGTH, type RandomStringOptions } from "./logic";

/** Mulberry32: a seeded PRNG so every generation is reproducible. */
function seededRandomBytes(seed: number) {
  let state = seed >>> 0;
  return (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      bytes[i] = (t ^ (t >>> 14)) & 0xff;
    }
    return bytes;
  };
}

const random = (seed = 42) => ({ randomBytes: seededRandomBytes(seed) });

const NANO: RandomStringOptions = { mode: "nano", length: 21, count: 1, alphabet: "" };
const nanoString = (length: number) => new RegExp(`^[A-Za-z0-9_-]{${length}}$`);

describe("generate nano", () => {
  it("makes one Nano ID of the asked length from the Nano ID alphabet", () => {
    const strings = generate(NANO, random());
    expect(strings).toHaveLength(1);
    expect(nanoString(21).test(strings[0]!)).toBe(true);
  });

  it("makes exactly `count` distinct strings of the asked length", () => {
    const strings = generate({ ...NANO, count: 5 }, random());
    expect(strings).toHaveLength(5);
    expect(new Set(strings).size).toBe(5);
    for (const string of strings) expect(nanoString(21).test(string)).toBe(true);
  });

  it("is reproducible for the same seed and different across seeds", () => {
    const first = generate(NANO, random(7));
    const again = generate(NANO, random(7));
    const other = generate(NANO, random(8));
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("rejects wrong lengths with a clear error", () => {
    for (const length of [0, MIN_LENGTH - 1, -5, NaN, Infinity, 20.5, MAX_LENGTH + 1]) {
      expect(() => generate({ ...NANO, length }, random())).toThrow(GenerateError);
      expect(() => generate({ ...NANO, length }, random())).toThrow("invalid-length");
    }
  });

  it("makes the minimum and the maximum length", () => {
    expect(generate({ ...NANO, length: MIN_LENGTH }, random())[0]).toHaveLength(1);
    const longest = generate({ ...NANO, length: MAX_LENGTH }, random())[0]!;
    expect(longest).toHaveLength(MAX_LENGTH);
    expect(nanoString(MAX_LENGTH).test(longest)).toBe(true);
  });

  it("rejects wrong counts with a clear error", () => {
    for (const count of [0, MIN_COUNT - 1, -3, NaN, Infinity, 2.5, MAX_COUNT + 1]) {
      expect(() => generate({ ...NANO, count }, random())).toThrow(GenerateError);
      expect(() => generate({ ...NANO, count }, random())).toThrow("invalid-count");
    }
  });

  it("makes the minimum and the maximum count", () => {
    expect(generate({ ...NANO, count: MIN_COUNT }, random())).toHaveLength(1);
    expect(generate({ ...NANO, count: MAX_COUNT }, random())).toHaveLength(MAX_COUNT);
  });
});

describe("generate hex", () => {
  const HEX: RandomStringOptions = { mode: "hex", length: 32, count: 1, alphabet: "" };

  it("makes a token of only lowercase hex digits, of odd lengths too", () => {
    for (const length of [32, 64, 33]) {
      const token = generate({ ...HEX, length }, random())[0]!;
      expect(token).toMatch(new RegExp(`^[0-9a-f]{${length}}$`));
    }
  });
});

describe("generate base64url", () => {
  const BASE64URL: RandomStringOptions = { mode: "base64url", length: 43, count: 1, alphabet: "" };

  it("makes a token of only URL-safe Base64 characters, with no padding", () => {
    for (const length of [43, 22, 7]) {
      const token = generate({ ...BASE64URL, length }, random())[0]!;
      expect(token).toMatch(new RegExp(`^[A-Za-z0-9_-]{${length}}$`));
      expect(token).not.toContain("=");
    }
  });
});

describe("generate custom", () => {
  const CUSTOM: RandomStringOptions = { mode: "custom", length: 16, count: 1, alphabet: "abcXYZ019" };

  it("draws only from the given alphabet", () => {
    const string = generate(CUSTOM, random())[0]!;
    expect(string).toHaveLength(16);
    expect([...string].every((char) => "abcXYZ019".includes(char))).toBe(true);
  });

  it("accepts an alphabet of one character", () => {
    const string = generate({ ...CUSTOM, alphabet: "a", length: 8 }, random())[0]!;
    expect(string).toBe("aaaaaaaa");
  });

  it("treats astral characters as one character each", () => {
    const string = generate({ ...CUSTOM, alphabet: "😀😄😂", length: 10 }, random())[0]!;
    expect([...string]).toHaveLength(10);
    expect([...string].every((char) => "😀😄😂".includes(char))).toBe(true);
  });

  it("draws from a Vietnamese alphabet of precomposed letters", () => {
    const string = generate({ ...CUSTOM, alphabet: "ếươđăâô", length: 20 }, random())[0]!;
    expect([...string]).toHaveLength(20);
    expect([...string].every((char) => "ếươđăâô".includes(char))).toBe(true);
  });

  it("rejects an empty alphabet", () => {
    expect(() => generate({ ...CUSTOM, alphabet: "" }, random())).toThrow("empty-alphabet");
  });

  it("rejects an alphabet with duplicate characters", () => {
    expect(() => generate({ ...CUSTOM, alphabet: "aab" }, random())).toThrow("duplicate-characters");
    expect(() => generate({ ...CUSTOM, alphabet: "ab😀a" }, random())).toThrow("duplicate-characters");
  });

  it("draws every alphabet character without visible bias", () => {
    const counts = new Array(10).fill(0);
    for (let seed = 1; seed <= 400; seed++) {
      const string = generate({ ...CUSTOM, alphabet: "0123456789", length: MAX_LENGTH }, { randomBytes: seededRandomBytes(seed * 7919) })[0]!;
      for (const char of string) counts[Number(char)]!++;
    }
    const total = 400 * MAX_LENGTH;
    for (const count of counts) {
      expect(count).toBeGreaterThan(total / 10 - total / 50);
      expect(count).toBeLessThan(total / 10 + total / 50);
    }
  });
});

describe("large sizes", () => {
  it("makes the largest batch quickly and completely", () => {
    const strings = generate({ mode: "nano", length: MAX_LENGTH, count: MAX_COUNT, alphabet: "" }, random());
    expect(strings).toHaveLength(MAX_COUNT);
    for (const string of strings) expect(string).toHaveLength(MAX_LENGTH);
  });
});
