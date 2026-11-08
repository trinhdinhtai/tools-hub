import { describe, expect, it } from "vitest";
import { cryptoRandomBytes, randomInt } from "./random";

/** Mulberry32: a seeded PRNG so every draw is reproducible. */
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

describe("randomInt", () => {
  it("returns 0 without drawing when the range is 0 or 1", () => {
    let draws = 0;
    const spy: typeof cryptoRandomBytes = (length) => {
      draws++;
      return cryptoRandomBytes(length);
    };
    expect(randomInt(1, spy)).toBe(0);
    expect(randomInt(0, spy)).toBe(0);
    expect(draws).toBe(0);
  });

  it("stays within [0, max) over many draws", () => {
    const randomBytes = seededRandomBytes(11);
    for (const max of [2, 3, 16, 26, 64, 100, 255, 256, 257, 65536]) {
      for (let i = 0; i < 200; i++) {
        const value = randomInt(max, randomBytes);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(max);
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("draws every value of a small range without visible bias", () => {
    const counts = new Array(10).fill(0);
    for (let seed = 1; seed <= 500; seed++) {
      const randomBytes = seededRandomBytes(seed * 7919);
      for (let i = 0; i < 100; i++) counts[randomInt(10, randomBytes)]!++;
    }
    const total = 500 * 100;
    for (const count of counts) {
      expect(count).toBeGreaterThan(total / 10 - total / 50);
      expect(count).toBeLessThan(total / 10 + total / 50);
    }
  });

  it("is reproducible for the same seed", () => {
    const draw = () => randomInt(64, seededRandomBytes(7));
    expect(draw()).toBe(draw());
  });
});

describe("cryptoRandomBytes", () => {
  it("gives as many bytes as asked, and two draws differ", () => {
    const bytes = cryptoRandomBytes(32);
    expect(bytes).toHaveLength(32);
    expect([...bytes].some((byte) => byte !== 0)).toBe(true);
    expect([...cryptoRandomBytes(32)]).not.toEqual([...bytes]);
  });
});
