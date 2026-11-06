// Java .properties as `Properties.load` reads it: `#` and `!` comments; a key ends at an unescaped `=`, `:` or
// whitespace; a line ending in `\` goes on in the next one; escapes are \t, \n, \r, \f, \uXXXX, and `\` before any other
// character keeps that character. Nested keys are written the Spring Boot way: `server.port`, `servers[0].name`.
// Characters outside ASCII are kept as they are, not written as \u escapes: files are UTF-8 nowadays.

import { flatten, unflatten, type FlatEntry, type Path } from "./flat";
import { position } from "@/lib/position";
import { InvalidConfig } from "./invalid";

const WHITESPACE = new Set([" ", "\t", "\f"]);
const ESCAPES: Record<string, string> = { t: "\t", n: "\n", r: "\r", f: "\f" };
const HEX4 = /^[\da-fA-F]{4}$/;

/** `a.b[0].c` → `["a", "b", "0", "c"]`. */
const keyPath = (key: string): string[] => key.replace(/\[(\d+)\]/g, ".$1").split(".");

export function parseProperties(text: string): FlatEntry[] {
  const entries: FlatEntry[] = [];
  const n = text.length;
  let p = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const atLineBreak = () => p >= n || text[p] === "\n" || text[p] === "\r";
  const skipLineBreak = () => {
    if (text[p] === "\r") p++;
    if (text[p] === "\n") p++;
  };
  const skipWhitespace = () => {
    while (p < n && WHITESPACE.has(text[p]!)) p++;
  };

  /**
   * The next character of the logical line, escapes decoded, or null at its end. A `\` before a line break joins the
   * next line, without its leading whitespace.
   */
  const next = (): { char: string; escaped: boolean } | null => {
    for (;;) {
      if (atLineBreak()) return null;
      const c = text[p]!;
      if (c !== "\\") {
        p++;
        return { char: c, escaped: false };
      }
      const start = p++;
      if (p >= n) return null; // a `\` at the very end is dropped
      if (atLineBreak()) {
        skipLineBreak();
        skipWhitespace();
        continue;
      }
      const e = text[p]!;
      if (e === "u") {
        const hex = text.slice(p + 1, p + 5);
        if (!HEX4.test(hex)) throw new InvalidConfig(position(text, start));
        p += 5;
        return { char: String.fromCharCode(parseInt(hex, 16)), escaped: true };
      }
      p++;
      return { char: ESCAPES[e] ?? e, escaped: true };
    }
  };

  while (p < n) {
    skipWhitespace();
    if (atLineBreak()) {
      skipLineBreak();
      continue;
    }
    if (text[p] === "#" || text[p] === "!") {
      while (!atLineBreak()) p++;
      skipLineBreak();
      continue;
    }

    let key = "";
    let value = "";
    let c = next();
    while (c && (c.escaped || !(c.char === "=" || c.char === ":" || WHITESPACE.has(c.char)))) {
      key += c.char;
      c = next();
    }
    if (c) {
      // After the key: whitespace, at most one `=` or `:`, then whitespace again.
      const separated = c.char === "=" || c.char === ":";
      c = next();
      while (c && !c.escaped && WHITESPACE.has(c.char)) c = next();
      if (c && !separated && !c.escaped && (c.char === "=" || c.char === ":")) {
        c = next();
        while (c && !c.escaped && WHITESPACE.has(c.char)) c = next();
      }
      while (c) {
        value += c.char;
        c = next();
      }
    }
    skipLineBreak();
    entries.push({ key, path: keyPath(key), value });
  }
  return entries;
}

export const readProperties = (text: string) => unflatten(parseProperties(text));

const escapeKey = (key: string) => escape(key).replace(/[=: #!]/g, (c) => "\\" + c);

function escape(text: string): string {
  return text.replace(/[\\\t\n\r\f]/g, (c) => "\\" + ({ "\t": "t", "\n": "n", "\r": "r", "\f": "f" }[c] ?? c));
}

/** Leading whitespace would be skipped on reading, so it is escaped. */
const escapeValue = (value: string) => escape(value).replace(/^ +/, (spaces) => "\\ ".repeat(spaces.length));

const pathKey = (path: Path) =>
  path.map((part, i) => (typeof part === "number" ? `[${part}]` : i > 0 ? `.${part}` : part)).join("");

/** One line per leaf. */
export function writeProperties(table: Record<string, unknown>): string {
  return flatten(table)
    .map(([path, value]) => `${escapeKey(pathKey(path))}=${escapeValue(value)}\n`)
    .join("");
}
