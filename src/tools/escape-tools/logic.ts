import { decodeHTMLStrict } from "entities";
import type { Mode } from "./modes";
import { punycodeDecode, punycodeEncode } from "./punycode";

export type Direction = "escape" | "unescape";

export type EscapeErrorReason =
  | "unknown-entity"
  | "invalid-code-point"
  | "unknown-escape"
  | "incomplete-escape"
  | "not-utf8"
  | "invalid-punycode"
  | "label-too-long";

/** Input that cannot be unescaped; `sequence` is the part of it that is wrong, as written. */
export class EscapeError extends Error {
  constructor(
    readonly reason: EscapeErrorReason,
    readonly sequence: string,
  ) {
    super(`Cannot convert: ${reason} at ${sequence}`);
    this.name = "EscapeError";
  }
}

/** Code points a character reference may name: not NUL, not a surrogate, not past U+10FFFF. */
function isScalar(codePoint: number): boolean {
  return codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);
}

const HTML_SPECIAL: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_SPECIAL[ch]!);
}

// Only references closed by ";": a bare "&" or "&copy" without one stays text.
const HTML_ENTITY = /&(?:#([0-9]+)|#[xX]([0-9a-fA-F]+)|[A-Za-z][A-Za-z0-9]*);/g;

function unescapeHtml(text: string): string {
  return text.replace(HTML_ENTITY, (entity, decimal?: string, hex?: string) => {
    if (decimal !== undefined || hex !== undefined) {
      const codePoint = decimal !== undefined ? Number(decimal) : parseInt(hex!, 16);
      if (!isScalar(codePoint)) throw new EscapeError("invalid-code-point", entity);
      return String.fromCodePoint(codePoint);
    }
    const decoded = decodeHTMLStrict(entity);
    if (decoded === entity) throw new EscapeError("unknown-entity", entity);
    return decoded;
  });
}

const hex4 = (code: number) => `\\u${code.toString(16).padStart(4, "0")}`;

const BACKSLASH_SHORT: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
};
// Control characters and lone surrogates; the rest, non-ASCII too, reads fine as it is.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const BACKSLASH_SPECIAL = /[\\"\u0000-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** A double-quoted string body that JSON, JavaScript, Java and C# all read back: only escapes they share. */
function escapeBackslash(text: string): string {
  return text.replace(BACKSLASH_SPECIAL, (ch) => BACKSLASH_SHORT[ch] ?? hex4(ch.charCodeAt(0)));
}

const isHex = (ch: string | undefined) => ch !== undefined && /^[0-9a-fA-F]$/.test(ch);

/** Index past the run of hex digits starting at `from`, at most `max` of them. */
function hexRun(text: string, from: number, max = Infinity): number {
  let end = from;
  while (end - from < max && isHex(text[end])) end++;
  return end;
}

/**
 * Reads the `\xHH`, `\uHHHH` or `\u{H…}` escape at `start` as a code point; `end` is the index past it. The offending
 * sequence of a broken one runs to its first wrong character.
 */
function readHexEscape(text: string, start: number): { codePoint: number; end: number } {
  const incomplete = (upTo: number) => new EscapeError("incomplete-escape", text.slice(start, upTo + 1));
  const letter = text[start + 1];
  if (letter === "u" && text[start + 2] === "{") {
    const end = hexRun(text, start + 3);
    if (end === start + 3 || text[end] !== "}") throw incomplete(end);
    const codePoint = parseInt(text.slice(start + 3, end), 16);
    if (codePoint > 0x10ffff) throw new EscapeError("invalid-code-point", text.slice(start, end + 1));
    return { codePoint, end: end + 1 };
  }
  const digits = letter === "u" ? 4 : 2;
  const end = hexRun(text, start + 2, digits);
  if (end - (start + 2) < digits) throw incomplete(end);
  return { codePoint: parseInt(text.slice(start + 2, end), 16), end };
}

const BACKSLASH_SIMPLE: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
  "\\": "\\",
  '"': '"',
  "'": "'",
  "/": "/",
};

/** Reads the escapes of a JavaScript string literal (JSON's are a subset). */
function unescapeBackslash(text: string): string {
  let out = "";
  let i = 0;
  for (let at = text.indexOf("\\"); at >= 0; at = text.indexOf("\\", i)) {
    out += text.slice(i, at);
    const next = text[at + 1];
    if (next === "u" || next === "x") {
      const { codePoint, end } = readHexEscape(text, at);
      // A lone surrogate is kept: `😀` is two escapes that together make one character.
      out += String.fromCodePoint(codePoint);
      i = end;
      continue;
    }
    if (next === undefined) throw new EscapeError("incomplete-escape", "\\");
    const simple = BACKSLASH_SIMPLE[next];
    if (simple === undefined) throw new EscapeError("unknown-escape", `\\${String.fromCodePoint(text.codePointAt(at + 1)!)}`);
    out += simple;
    i = at + 2;
  }
  return out + text.slice(i);
}

/** Every UTF-16 code unit past ASCII as `\uHHHH`, the escape JSON, JavaScript, Java and C# share. */
function escapeUnicode(text: string): string {
  return text.replace(/[\u0080-￿]/g, (ch) => hex4(ch.charCodeAt(0)));
}

/** Reads `\uHHHH` and `\u{H…}` escapes; every other character, backslashes too, stays as it is. */
function unescapeUnicode(text: string): string {
  let out = "";
  let i = 0;
  for (let at = text.indexOf("\\u"); at >= 0; at = text.indexOf("\\u", i)) {
    const { codePoint, end } = readHexEscape(text, at);
    out += text.slice(i, at) + String.fromCodePoint(codePoint);
    i = end;
  }
  return out + text.slice(i);
}

const utf8 = new TextEncoder();
const HEX_BYTES = Array.from({ length: 256 }, (_, byte) => `\\x${byte.toString(16).padStart(2, "0")}`);

/** Every UTF-8 byte of the text as `\xHH`. */
function escapeHex(text: string): string {
  return Array.from(utf8.encode(text), (byte) => HEX_BYTES[byte]).join("");
}

/** Reads `\xHH` escapes as bytes, the characters between them as their UTF-8 bytes, and all of it as UTF-8. */
function unescapeHex(text: string): string {
  // A UTF-16 code unit is at most 3 bytes of UTF-8, and an escape is shorter than its byte.
  const bytes = new Uint8Array(text.length * 3);
  let length = 0;
  let i = 0;
  for (let at = text.indexOf("\\x"); at >= 0; at = text.indexOf("\\x", i)) {
    const { codePoint, end } = readHexEscape(text, at);
    length += utf8.encodeInto(text.slice(i, at), bytes.subarray(length)).written;
    bytes[length++] = codePoint;
    i = end;
  }
  length += utf8.encodeInto(text.slice(i), bytes.subarray(length)).written;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
  } catch {
    throw new EscapeError("not-utf8", "");
  }
}

/** Full stops that separate domain labels (IDNA): ASCII, ideographic, fullwidth and halfwidth. */
const LABEL_SEPARATOR = /[.。．｡]/;
const MAX_LABEL_LENGTH = 63;

/** Lowercases each label and gives the ones that are not ASCII as `xn--` Punycode. */
function domainToAscii(domain: string): string {
  return domain
    .split(LABEL_SEPARATOR)
    .map((label) => {
      const lower = label.normalize("NFC").toLowerCase();
      // Punycode is never shorter than its code points: a label past the limit fails before it is encoded.
      if ([...lower].length > MAX_LABEL_LENGTH) throw new EscapeError("label-too-long", label);
      const ascii = /[\u0080-￿]/.test(lower) ? `xn--${punycodeEncode(lower)}` : lower;
      if (ascii.length > MAX_LABEL_LENGTH) throw new EscapeError("label-too-long", label);
      return ascii;
    })
    .join(".");
}

/** Decodes each `xn--` label; the others stay as they are. */
function domainToUnicode(domain: string): string {
  return domain
    .split(LABEL_SEPARATOR)
    .map((label) => {
      if (!/^xn--/i.test(label)) return label;
      try {
        return punycodeDecode(label.slice(4).toLowerCase());
      } catch {
        throw new EscapeError("invalid-punycode", label);
      }
    })
    .join(".");
}

/** One domain per line, without the spaces around it. */
const eachLine = (text: string, convertLine: (line: string) => string) =>
  text
    .split("\n")
    .map((line) => convertLine(line.trim()))
    .join("\n");

/** Escapes or unescapes `input` the way `mode` says. Throws an `EscapeError` for Input that does not unescape. */
export function convert(input: string, mode: Mode, direction: Direction): string {
  switch (mode) {
    case "html":
      return direction === "escape" ? escapeHtml(input) : unescapeHtml(input);
    case "backslash":
      return direction === "escape" ? escapeBackslash(input) : unescapeBackslash(input);
    case "unicode":
      return direction === "escape" ? escapeUnicode(input) : unescapeUnicode(input);
    case "hex":
      return direction === "escape" ? escapeHex(input) : unescapeHex(input);
    case "punycode":
      return eachLine(input, direction === "escape" ? domainToAscii : domainToUnicode);
  }
}
