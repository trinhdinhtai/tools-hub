// .env as dotenv reads it: `KEY=value` per line, `#` comments, an optional `export`, and values bare, in single quotes
// (as written) or in double quotes (with \n, \r, \t, \" and \\ escapes). Quoted values may span lines. Nested keys
// are joined with `__`, as ASP.NET and many twelve-factor apps do.

import { flatten, unflatten, type FlatEntry } from "./flat";
import { position } from "@/lib/position";
import { InvalidConfig } from "./invalid";

const SEPARATOR = "__";
/** A key a .env file can hold. */
export const ENV_KEY = /^[A-Za-z_][\w.-]*$/;
const ASSIGNMENT = /[ \t]*(?:export[ \t]+)?([A-Za-z_][\w.-]*)[ \t]*=[ \t]*/y;
const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
const BARE = /^[^\s"'#\\]*$/;

export function parseEnv(text: string): FlatEntry[] {
  const entries: FlatEntry[] = [];
  const n = text.length;
  let p = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const lineEnd = (from: number) => {
    let end = from;
    while (end < n && text[end] !== "\n" && text[end] !== "\r") end++;
    return end;
  };
  const skipLineBreak = () => {
    if (text[p] === "\r") p++;
    if (text[p] === "\n") p++;
  };

  while (p < n) {
    const end = lineEnd(p);
    const line = text.slice(p, end);
    if (!line.trim() || line.trimStart().startsWith("#")) {
      p = end;
      skipLineBreak();
      continue;
    }
    ASSIGNMENT.lastIndex = p;
    const match = ASSIGNMENT.exec(text);
    if (!match || match.index + match[0].length > end) throw new InvalidConfig(position(text, p));
    const key = match[1]!;
    p += match[0].length;

    let value: string;
    const quote = text[p];
    if (quote === '"' || quote === "'") {
      const open = p++;
      value = "";
      for (;;) {
        if (p >= n) throw new InvalidConfig(position(text, open));
        const c = text[p]!;
        if (c === quote) break;
        if (c === "\\" && quote === '"' && p + 1 < n) {
          const next = text[p + 1]!;
          value += ESCAPES[next] ?? c + next;
          p += 2;
        } else {
          value += c;
          p++;
        }
      }
      p++;
      // After the closing quote, only a comment may follow on the line.
      const restEnd = lineEnd(p);
      const rest = text.slice(p, restEnd).trim();
      if (rest && !rest.startsWith("#")) throw new InvalidConfig(position(text, p));
      p = restEnd;
    } else {
      // A `#` after whitespace starts a comment.
      value = text.slice(p, end).replace(/(^|[ \t]+)#.*$/, "").trim();
      p = end;
    }
    skipLineBreak();
    entries.push({ key, path: key.split(SEPARATOR), value });
  }
  return entries;
}

export const readEnv = (text: string) => unflatten(parseEnv(text));

/** Bare when that reads back the same; otherwise in double quotes, escaped. */
function envValue(value: string): string {
  if (BARE.test(value)) return value;
  return `"${value.replace(/[\\"\n\r\t]/g, (c) => "\\" + ({ "\n": "n", "\r": "r", "\t": "t" }[c] ?? c))}"`;
}

/** One line per leaf. Keys that a .env file cannot hold are returned instead, so the caller can refuse. */
export function writeEnv(table: Record<string, unknown>): { text: string } | { badKey: string } {
  const lines: string[] = [];
  for (const [path, value] of flatten(table)) {
    const key = path.join(SEPARATOR);
    if (!ENV_KEY.test(key)) return { badKey: key };
    lines.push(`${key}=${envValue(value)}`);
  }
  return { text: lines.map((line) => line + "\n").join("") };
}
