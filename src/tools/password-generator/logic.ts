import { cryptoRandomBytes, randomInt, type RandomBytes } from "@/lib/random";
import { WORDLIST } from "./wordlist";

/**
 * How a password is built: its length and the character groups it draws from. Everything is generated with
 * cryptographic randomness only (ADR-0001): the sole randomness source is `crypto.getRandomValues`, injectable for
 * tests, and results stay in memory, never in the store.
 */
export interface PasswordOptions {
  /** How many characters, from MIN_LENGTH to MAX_LENGTH. */
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  /** Leave out the characters that look alike on screen or in print, such as I, l, 1 and O, 0. */
  excludeAmbiguous: boolean;
}

export interface PassphraseOptions {
  /** How many words, from MIN_WORDS to MAX_WORDS. */
  wordCount: number;
  /** One of SEPARATORS. */
  separator: string;
  /** Start every word with a capital letter. */
  capitalize: boolean;
  /** Append a random number from 00 to 99 after the words. */
  includeNumber: boolean;
}

export type GenerateErrorReason = "invalid-length" | "no-groups" | "invalid-word-count";

export class GenerateError extends Error {
  constructor(readonly reason: GenerateErrorReason) {
    super(`Cannot generate: ${reason}`);
    this.name = "GenerateError";
  }
}

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 256;
export const MIN_WORDS = 3;
export const MAX_WORDS = 20;

/** The groups a password can draw from, in the order their guaranteed characters are placed. */
export const GROUPS = ["lowercase", "uppercase", "digits", "symbols"] as const;
export type Group = (typeof GROUPS)[number];

const GROUP_CHARS: Record<Group, string> = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
};

/** Characters that look alike on screen or in print: capital i, lower l, one, capital O, zero, lower o. */
const AMBIGUOUS = new Set("Il1O0o");

/** The separators a passphrase can put between its words; the empty string runs them together. */
export const SEPARATORS = ["-", ".", "_", " ", ""] as const;

/** A uniform member of `pool`; the pool must be non-empty. */
function randomChar(pool: string, randomBytes: RandomBytes): string {
  return pool[randomInt(pool.length, randomBytes)]!;
}

/** Fisher–Yates, shuffled with the same unbiased integers. */
function shuffle<T>(items: T[], randomBytes: RandomBytes): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, randomBytes);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** The character set a password draws from: one entry per selected group, with ambiguous characters left out on demand. */
function poolOf(options: PasswordOptions): string[] {
  const pools: string[] = [];
  for (const group of GROUPS) {
    if (!options[group]) continue;
    let pool = GROUP_CHARS[group];
    if (options.excludeAmbiguous) pool = [...pool].filter((char) => !AMBIGUOUS.has(char)).join("");
    pools.push(pool);
  }
  return pools;
}

/** A random password: at least one character per selected group, shuffled so their position gives nothing away. */
export function generatePassword(options: PasswordOptions, random: { randomBytes?: RandomBytes } = {}): string {
  const randomBytes = random.randomBytes ?? cryptoRandomBytes;
  if (!Number.isInteger(options.length) || options.length < MIN_LENGTH || options.length > MAX_LENGTH) {
    throw new GenerateError("invalid-length");
  }
  const pools = poolOf(options);
  if (pools.length === 0) throw new GenerateError("no-groups");

  const chars = pools.map((pool) => randomChar(pool, randomBytes));
  const all = pools.join("");
  for (let i = chars.length; i < options.length; i++) chars.push(randomChar(all, randomBytes));
  return shuffle(chars, randomBytes).join("");
}

/** A random passphrase: WORDLIST words joined by the separator, then the two-digit number if asked. */
export function generatePassphrase(
  options: PassphraseOptions,
  random: { randomBytes?: RandomBytes } = {},
  wordlist: readonly string[] = WORDLIST,
): string {
  const randomBytes = random.randomBytes ?? cryptoRandomBytes;
  if (!Number.isInteger(options.wordCount) || options.wordCount < MIN_WORDS || options.wordCount > MAX_WORDS) {
    throw new GenerateError("invalid-word-count");
  }
  if (wordlist.length < 2) throw new GenerateError("invalid-word-count");

  const words = Array.from({ length: options.wordCount }, () => {
    const word = wordlist[randomInt(wordlist.length, randomBytes)]!;
    return options.capitalize ? word[0]!.toUpperCase() + word.slice(1) : word;
  });
  if (options.includeNumber) words.push(String(randomInt(100, randomBytes)).padStart(2, "0"));
  return words.join(options.separator);
}

export const STRENGTH_LEVELS = ["very-weak", "weak", "fair", "strong", "very-strong"] as const;
export type StrengthLevel = (typeof STRENGTH_LEVELS)[number];

/** How much randomness the password actually carries: its length times the bits of one pool character. */
export function passwordEntropyBits(options: PasswordOptions): number {
  const poolSize = poolOf(options).reduce((sum, pool) => sum + pool.length, 0);
  return poolSize > 0 ? options.length * Math.log2(poolSize) : 0;
}

/** How much randomness the passphrase carries: words from the wordlist, plus the appended number if there is one. */
export function passphraseEntropyBits(options: PassphraseOptions, wordlist: readonly string[] = WORDLIST): number {
  return options.wordCount * Math.log2(wordlist.length) + (options.includeNumber ? Math.log2(100) : 0);
}

/** One password's strength as a level, from how many bits of entropy it carries. */
export function strengthOf(bits: number): StrengthLevel {
  if (bits < 28) return "very-weak";
  if (bits < 36) return "weak";
  if (bits < 60) return "fair";
  if (bits < 128) return "strong";
  return "very-strong";
}
