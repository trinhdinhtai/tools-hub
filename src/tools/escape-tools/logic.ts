import { decodeHTMLStrict } from "entities";
import type { Mode } from "./modes";

export type Direction = "escape" | "unescape";

export type EscapeErrorReason = "unknown-entity" | "invalid-code-point";

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

/** Escapes or unescapes `input` the way `mode` says. Throws an `EscapeError` for Input that does not unescape. */
export function convert(input: string, mode: Mode, direction: Direction): string {
  switch (mode) {
    case "html":
      return direction === "escape" ? escapeHtml(input) : unescapeHtml(input);
    default:
      throw new Error(`Mode ${mode} is not implemented`);
  }
}
