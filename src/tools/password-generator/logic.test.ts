import { describe, expect, it } from "vitest";
import {
  generatePassphrase,
  generatePassword,
  GenerateError,
  MAX_LENGTH,
  MAX_WORDS,
  MIN_LENGTH,
  MIN_WORDS,
  passphraseEntropyBits,
  passwordEntropyBits,
  strengthOf,
  type PassphraseOptions,
  type PasswordOptions,
} from "./logic";
import { WORDLIST } from "./wordlist";

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

const random = () => ({ randomBytes: seededRandomBytes(42) });

const ALL_GROUPS: PasswordOptions = { length: 20, lowercase: true, uppercase: true, digits: true, symbols: true, excludeAmbiguous: false };
const DEFAULT_PASSPHRASE: PassphraseOptions = { wordCount: 5, separator: "-", capitalize: false, includeNumber: false };

describe("generatePassword", () => {
  it("makes a password of the asked length, drawing only from the selected groups", () => {
    const password = generatePassword(ALL_GROUPS, random());
    expect(password).toHaveLength(20);
    expect([...password].every((char) => /[a-zA-Z0-9!@#$%^&*()\-_=+[\]{};:,.?/]/.test(char))).toBe(true);
  });

  it("uses only the groups that are on", () => {
    const password = generatePassword({ ...ALL_GROUPS, length: 40, lowercase: true, uppercase: false, digits: false, symbols: false }, random());
    expect(/^[a-z]{40}$/.test(password)).toBe(true);
  });

  it("puts at least one character of every selected group in the result", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const password = generatePassword(ALL_GROUPS, { randomBytes: seededRandomBytes(seed) });
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%^&*()\-_=+[\]{};:,.?/]/.test(password)).toBe(true);
    }
  });

  it("leaves out ambiguous characters when asked, keeping every group reachable", () => {
    for (const seed of [1, 2, 3]) {
      const password = generatePassword({ ...ALL_GROUPS, length: 60, excludeAmbiguous: true }, { randomBytes: seededRandomBytes(seed) });
      expect([...password].some((char) => "Il1O0o".includes(char))).toBe(false);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%^&*()\-_=+[\]{};:,.?/]/.test(password)).toBe(true);
    }
  });

  it("is reproducible for the same seed and different across seeds", () => {
    const first = generatePassword(ALL_GROUPS, { randomBytes: seededRandomBytes(7) });
    const again = generatePassword(ALL_GROUPS, { randomBytes: seededRandomBytes(7) });
    const other = generatePassword(ALL_GROUPS, { randomBytes: seededRandomBytes(8) });
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  it("makes the maximum length and rejects anything beyond it", () => {
    const password = generatePassword({ ...ALL_GROUPS, length: MAX_LENGTH }, random());
    expect(password).toHaveLength(MAX_LENGTH);
    for (const length of [MAX_LENGTH + 1, 1000]) {
      expect(() => generatePassword({ ...ALL_GROUPS, length }, random())).toThrow(GenerateError);
      expect(() => generatePassword({ ...ALL_GROUPS, length }, random())).toThrow("invalid-length");
    }
  });

  it("rejects wrong lengths with a clear error", () => {
    for (const length of [0, 1, MIN_LENGTH - 1, -5, NaN, Infinity, 20.5]) {
      expect(() => generatePassword({ ...ALL_GROUPS, length }, random())).toThrow("invalid-length");
    }
  });

  it("rejects a password with no character groups", () => {
    const none: PasswordOptions = { length: 20, lowercase: false, uppercase: false, digits: false, symbols: false, excludeAmbiguous: false };
    expect(() => generatePassword(none, random())).toThrow("no-groups");
  });

  it("still works at the minimum length with every group on", () => {
    const password = generatePassword({ ...ALL_GROUPS, length: MIN_LENGTH }, random());
    expect(password).toHaveLength(MIN_LENGTH);
    expect(/[a-z]/.test(password)).toBe(true);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(/[!@#$%^&*()\-_=+[\]{};:,.?/]/.test(password)).toBe(true);
  });
});

describe("generatePassphrase", () => {
  it("joins the asked number of words from the wordlist with the separator", () => {
    const passphrase = generatePassphrase(DEFAULT_PASSPHRASE, random());
    const words = passphrase.split("-");
    expect(words).toHaveLength(5);
    expect(words.every((word) => WORDLIST.includes(word))).toBe(true);
  });

  it("capitalizes the words when asked", () => {
    const passphrase = generatePassphrase({ ...DEFAULT_PASSPHRASE, capitalize: true }, random());
    expect(passphrase.split("-").every((word) => /^[A-Z]/.test(word))).toBe(true);
  });

  it("appends a two-digit number when asked", () => {
    const passphrase = generatePassphrase({ ...DEFAULT_PASSPHRASE, includeNumber: true }, random());
    expect(/^[a-z]+(?:-[a-z]+){4}-\d{2}$/.test(passphrase)).toBe(true);
  });

  it("runs the words together with the empty separator", () => {
    const passphrase = generatePassphrase({ ...DEFAULT_PASSPHRASE, separator: "" }, random());
    expect(passphrase).not.toMatch(/[-._ ]/);
    const words = passphrase.split("");
    expect(words.length).toBeGreaterThanOrEqual(5);
  });

  it("accepts a wordlist of its own, with Unicode words and capitals", () => {
    const vietnamese = ["mây", "biển", "cà phê", "đẹp", "trăng"];
    const passphrase = generatePassphrase({ ...DEFAULT_PASSPHRASE, capitalize: true }, random(), vietnamese);
    const words = passphrase.split("-");
    expect(words).toHaveLength(5);
    expect(words.every((word) => vietnamese.some((candidate) => word === candidate[0]!.toUpperCase() + candidate.slice(1)))).toBe(true);
  });

  it("makes the maximum word count and rejects anything beyond it", () => {
    const passphrase = generatePassphrase({ ...DEFAULT_PASSPHRASE, wordCount: MAX_WORDS }, random());
    expect(passphrase.split("-")).toHaveLength(MAX_WORDS);
    expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE, wordCount: MAX_WORDS + 1 }, random())).toThrow("invalid-word-count");
  });

  it("rejects wrong word counts with a clear error", () => {
    for (const wordCount of [0, 1, MIN_WORDS - 1, -3, NaN, Infinity, 5.5]) {
      expect(() => generatePassphrase({ ...DEFAULT_PASSPHRASE, wordCount }, random())).toThrow("invalid-word-count");
    }
  });

  it("rejects a wordlist too small to draw from", () => {
    expect(() => generatePassphrase(DEFAULT_PASSPHRASE, random(), [])).toThrow("invalid-word-count");
    expect(() => generatePassphrase(DEFAULT_PASSPHRASE, random(), ["single"])).toThrow("invalid-word-count");
  });

  it("is reproducible for the same seed", () => {
    const first = generatePassphrase({ ...DEFAULT_PASSPHRASE, includeNumber: true }, { randomBytes: seededRandomBytes(9) });
    const again = generatePassphrase({ ...DEFAULT_PASSPHRASE, includeNumber: true }, { randomBytes: seededRandomBytes(9) });
    expect(again).toBe(first);
  });
});

describe("randomness quality", () => {
  it("draws small ranges without visible bias", () => {
    // randomInt is private; uniformity is verified through the digits of many maximum-length all-digit passwords.
    const counts = new Array(10).fill(0);
    for (let seed = 1; seed <= 400; seed++) {
      const password = generatePassword(
        { ...ALL_GROUPS, length: MAX_LENGTH, digits: true, lowercase: false, uppercase: false, symbols: false },
        { randomBytes: seededRandomBytes(seed * 7919) },
      );
      for (const char of password) counts[Number(char)]!++;
    }
    const total = 400 * MAX_LENGTH;
    for (const count of counts) {
      expect(count).toBeGreaterThan(total / 10 - total / 50);
      expect(count).toBeLessThan(total / 10 + total / 50);
    }
  });
});

describe("strength", () => {
  it("grows with length and pool size", () => {
    expect(passwordEntropyBits({ ...ALL_GROUPS, length: 8 })).toBeLessThan(passwordEntropyBits({ ...ALL_GROUPS, length: 16 }));
    expect(passwordEntropyBits({ length: 8, lowercase: true, uppercase: false, digits: false, symbols: false, excludeAmbiguous: false })).toBeLessThan(
      passwordEntropyBits({ ...ALL_GROUPS, length: 8 }),
    );
    expect(passphraseEntropyBits(DEFAULT_PASSPHRASE)).toBeLessThan(passphraseEntropyBits({ ...DEFAULT_PASSPHRASE, wordCount: 6 }));
    expect(passphraseEntropyBits(DEFAULT_PASSPHRASE)).toBeLessThan(passphraseEntropyBits({ ...DEFAULT_PASSPHRASE, includeNumber: true }));
  });

  it("computes known entropy values", () => {
    expect(passwordEntropyBits({ length: 8, lowercase: true, uppercase: false, digits: false, symbols: false, excludeAmbiguous: false })).toBeCloseTo(8 * Math.log2(26), 6);
    expect(passphraseEntropyBits(DEFAULT_PASSPHRASE)).toBeCloseTo(5 * Math.log2(WORDLIST.length), 6);
    expect(passphraseEntropyBits({ ...DEFAULT_PASSPHRASE, includeNumber: true })).toBeCloseTo(5 * Math.log2(WORDLIST.length) + Math.log2(100), 6);
    expect(passwordEntropyBits({ ...ALL_GROUPS, length: 20, lowercase: false, uppercase: false, digits: false, symbols: false })).toBe(0);
  });

  it("maps entropy to the five levels at their boundaries", () => {
    expect(strengthOf(0)).toBe("very-weak");
    expect(strengthOf(27.9)).toBe("very-weak");
    expect(strengthOf(28)).toBe("weak");
    expect(strengthOf(35.9)).toBe("weak");
    expect(strengthOf(36)).toBe("fair");
    expect(strengthOf(59.9)).toBe("fair");
    expect(strengthOf(60)).toBe("strong");
    expect(strengthOf(127.9)).toBe("strong");
    expect(strengthOf(128)).toBe("very-strong");
  });
});
