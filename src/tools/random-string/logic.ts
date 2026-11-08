import { type Mode } from "./modes";

/**
 * How a random string is built: its kind, length, and how many strings to make. Everything is generated with
 * cryptographic randomness only (ADR-0001): the sole randomness source is `crypto.getRandomValues`, injectable for
 * tests, and results stay in memory, never in the store (ADR-0004).
 */
export interface RandomStringOptions {
  mode: Mode;
  /** How many characters per string, from MIN_LENGTH to MAX_LENGTH. */
  length: number;
  /** How many strings, from MIN_COUNT to MAX_COUNT. */
  count: number;
  /** The alphabet of the custom mode; ignored by the fixed ones. */
  alphabet: string;
}

export type GenerateErrorReason = "invalid-length" | "invalid-count" | "empty-alphabet" | "duplicate-characters";

export class GenerateError extends Error {
  constructor(readonly reason: GenerateErrorReason) {
    super(`Cannot generate: ${reason}`);
    this.name = "GenerateError";
  }
}

export const MIN_LENGTH = 1;
export const MAX_LENGTH = 1024;
export const MIN_COUNT = 1;
export const MAX_COUNT = 100;

/** The Nano ID alphabet: 64 URL-safe characters (A–Z a–z 0–9 _ -). */
export const NANO_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
/** Lowercase hex digits. */
export const HEX_ALPHABET = "0123456789abcdef";
/** URL-safe Base64: the same 64 characters as Nano ID, in the Base64 order. */
export const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const ALPHABETS: Record<Mode, string> = {
  nano: NANO_ALPHABET,
  hex: HEX_ALPHABET,
  base64url: BASE64URL_ALPHABET,
  custom: "",
};

export type RandomBytes = (length: number) => Uint8Array;

const defaultRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/** A uniform integer in [0, max) out of the random bytes, by rejection sampling: no modulo bias. */
function randomInt(max: number, randomBytes: RandomBytes): number {
  if (max <= 1) return 0;
  const bytesPerDraw = Math.max(Math.ceil(Math.log2(max) / 8), 1);
  const drawSize = 256 ** bytesPerDraw;
  const limit = drawSize - (drawSize % max);
  for (;;) {
    const bytes = randomBytes(bytesPerDraw);
    let value = 0;
    for (const byte of bytes) value = value * 256 + byte;
    if (value < limit) return value % max;
  }
}

function checkCount(count: number): void {
  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) throw new GenerateError("invalid-count");
}

/** The characters of the custom alphabet as code points, so astral ones (emoji, Vietnamese) count as one. */
function customChars(alphabet: string): string[] {
  const chars = [...alphabet];
  if (chars.length === 0) throw new GenerateError("empty-alphabet");
  if (new Set(chars).size !== chars.length) throw new GenerateError("duplicate-characters");
  return chars;
}

/** `count` random strings of `length` characters each, drawn with one entry of `chars` per character. */
function stringsOf(chars: string[], length: number, count: number, randomBytes: RandomBytes): string[] {
  return Array.from({ length: count }, () =>
    Array.from({ length }, () => chars[randomInt(chars.length, randomBytes)]!).join(""),
  );
}

/** The random strings the user asked for, one entry per string. */
export function generate(options: RandomStringOptions, random: { randomBytes?: RandomBytes } = {}): string[] {
  const randomBytes = random.randomBytes ?? defaultRandomBytes;
  if (!Number.isInteger(options.length) || options.length < MIN_LENGTH || options.length > MAX_LENGTH) {
    throw new GenerateError("invalid-length");
  }
  checkCount(options.count);
  const chars = options.mode === "custom" ? customChars(options.alphabet) : [...ALPHABETS[options.mode]];
  return stringsOf(chars, options.length, options.count, randomBytes);
}
