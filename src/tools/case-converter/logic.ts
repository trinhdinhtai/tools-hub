/**
 * Pure case-conversion logic for the Case Converter: splitting a name into words, converting it between case styles,
 * and building a URL slug with the Vietnamese diacritics removed. No DOM, no store (ADR-0003).
 */

/** The case styles the Convert mode offers, in display order. */
export const CASES = ["camel", "pascal", "snake", "kebab", "constant", "title"] as const;
export type CaseStyle = (typeof CASES)[number];

/**
 * Splits a name into words: on the usual delimiters (spaces, `-`, `_`, `.`, punctuation) and on the case boundaries
 * of camelCase and PascalCase acronyms, so `getUserIDList` becomes user, ID, list. Diacritics stay on their letters,
 * so `tiếng Việt` is two words, not four.
 */
export function toWords(text: string): string[] {
  return text
    .normalize("NFC")
    .replace(/([\p{Ll}\p{Lo}\p{N}\p{M}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}[\p{Ll}\p{Lo}])/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/** First letter upper, the rest lower — safe for astral letters, e.g. an emoji that opens a word. */
function capitalize(word: string): string {
  const [first = "", ...rest] = [...word];
  return first.toUpperCase() + rest.join("").toLowerCase();
}

const BUILDERS: Record<CaseStyle, (words: string[]) => string> = {
  camel: (words) => words.map((word, i) => (i === 0 ? word.toLowerCase() : capitalize(word))).join(""),
  pascal: (words) => words.map(capitalize).join(""),
  snake: (words) => words.map((word) => word.toLowerCase()).join("_"),
  kebab: (words) => words.map((word) => word.toLowerCase()).join("-"),
  constant: (words) => words.map((word) => word.toUpperCase()).join("_"),
  title: (words) => words.map(capitalize).join(" "),
};

/**
 * Converts the text to one case style, line by line: every line of names is converted on its own, and a line without
 * a single letter or digit comes back empty rather than as an error.
 */
export function toCase(text: string, style: CaseStyle): string {
  return text
    .split("\n")
    .map((line) => {
      const words = toWords(line);
      return words.length === 0 ? "" : BUILDERS[style](words);
    })
    .join("\n");
}

export type SlugErrorReason = "no-alphanumeric";

export class SlugError extends Error {
  constructor(readonly reason: SlugErrorReason) {
    super(`Cannot slug: ${reason}`);
    this.name = "SlugError";
  }
}

/**
 * The letters as a slug wants them: `đ` and `Đ` become `d` (they have no decomposed form), then every combining mark
 * comes off, so `Tiếng Việt` reads as `Tieng Viet`.
 */
function asciify(text: string): string {
  return text
    .replaceAll(/[đĐ]/gu, (match) => (match === "đ" ? "d" : "D"))
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
}

/**
 * Builds a URL slug per line, like `toCase`: Vietnamese diacritics removed (`đ` → `d`), the remaining letters and
 * digits joined by the separator (default `-`), everything else dropped. A line that still has no letter or digit —
 * only symbols — throws; an empty or whitespace-only line stays empty.
 */
export function slugify(text: string, separator = "-"): string {
  return text
    .split("\n")
    .map((line) => {
      const words = toWords(asciify(line)).map((word) => word.toLowerCase());
      if (words.length === 0 && line.trim() !== "") throw new SlugError("no-alphanumeric");
      return words.join(separator);
    })
    .join("\n");
}
