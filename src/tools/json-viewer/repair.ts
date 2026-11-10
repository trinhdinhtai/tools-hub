// Turns text that is almost JSON into JSON: JSON5, NDJSON, and object literals as Python, Ruby and JavaScript print
// them. It reads the Input leniently into the same tree the strict parser builds, then prints it as JSON. What JSON
// cannot hold becomes the nearest JSON value: Infinity and NaN become null, as JSON.stringify does. Valid JSON strings
// and numbers keep the text they were written with. Like the strict parser, it uses an explicit stack.

import { attemptError } from "@/lib/attempt";
import { printJson, type JsonNode, type TransformOptions } from "./logic";

type Punct = "{" | "}" | "[" | "]" | "(" | ")" | "," | ":";

type Token =
  | { type: "punct"; value: Punct }
  /** A string or number, already written as JSON. */
  | { type: "string" | "number"; raw: string }
  /** A bare name: a key, or a literal such as true, None or nil. */
  | { type: "word"; value: string }
  | { type: "end" };

type Container = Extract<JsonNode, { kind: "object" | "array" }>;

class RepairError extends Error {}

const fail = (): never => {
  throw new RepairError();
};

const LITERALS = new Map<string, string>([
  ...["true", "True", "TRUE"].map((w) => [w, "true"] as const),
  ...["false", "False", "FALSE"].map((w) => [w, "false"] as const),
  ...["null", "NULL", "None", "nil", "undefined", "NaN", "Infinity"].map((w) => [w, "null"] as const),
]);

/** Python string prefixes: unicode, bytes and raw. */
const STRING_PREFIX = /^(?:[uUbB]|[rR]|[uUbB][rR]|[rR][bB])$/;
const DECIMAL = /^(\d*)(?:\.(\d*))?([eE][+-]?\d+)?$/;
const HEX_DIGITS = /^[\da-fA-F]+$/;
const OTHER_SPACE = /\s/;
const OTHER_WORD_START = /[\p{L}\p{Nl}]/u;
const OTHER_WORD_CHAR = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}‌‍]/u;

const isDigit = (c: number) => c >= 48 && c <= 57;

function isWordStart(c: number, char: string): boolean {
  if (c < 128) return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36;
  return OTHER_WORD_START.test(char);
}

function isWordChar(c: number, char: string): boolean {
  if (c < 128) return isWordStart(c, char) || isDigit(c);
  return OTHER_WORD_CHAR.test(char);
}

function lexer(text: string) {
  const n = text.length;
  let p = 0;

  /** One character as a string, a whole code point if it is a surrogate pair. */
  const charAt = (at: number) => String.fromCodePoint(text.codePointAt(at)!);

  const skipSpaceAndComments = () => {
    while (p < n) {
      const c = text.charCodeAt(p);
      if (c <= 32 || (c >= 128 && OTHER_SPACE.test(text[p]!)) || c === 0xfeff) p++;
      else if (c === 35 || (c === 47 && text[p + 1] === "/")) {
        // # (Python, Ruby) and // comments run to the end of the line.
        while (p < n && text[p] !== "\n" && text[p] !== "\r") p++;
      } else if (c === 47 && text[p + 1] === "*") {
        const end = text.indexOf("*/", p + 2);
        if (end < 0) fail();
        p = end + 2;
      } else break;
    }
  };

  const string = (quote: string, raw: boolean): Token => {
    const start = p++;
    let value = "";
    let runStart = p;
    // A double-quoted string that is already valid JSON keeps its text, escapes included.
    let changed = quote !== '"' || raw;
    for (;;) {
      if (p >= n) fail();
      const c = text.charCodeAt(p);
      const char = text[p]!;
      if (char === quote) {
        value += text.slice(runStart, p++);
        break;
      }
      if (c === 92) {
        if (raw) {
          // A raw string keeps its backslashes; one still stops the next quote from closing it.
          p += 2;
          continue;
        }
        value += text.slice(runStart, p);
        const [decoded, length, valid] = escape(text, p + 1);
        value += decoded;
        if (!valid) changed = true;
        p += 1 + length;
        runStart = p;
      } else {
        if (c < 0x20) changed = true;
        p++;
      }
    }
    return { type: "string", raw: changed ? JSON.stringify(value) : text.slice(start, p) };
  };

  const number = (): Token => {
    let sign = "";
    if (text[p] === "+" || text[p] === "-") sign = text[p++] === "-" ? "-" : "";
    for (const name of ["Infinity", "NaN"]) {
      if (text.startsWith(name, p)) {
        p += name.length;
        return { type: "number", raw: "null" };
      }
    }
    const start = p;
    if (text[p] === "0" && /[xXoObB]/.test(text[p + 1] ?? "")) {
      p += 2;
      while (p < n && isWordChar(text.charCodeAt(p), text[p]!)) p++;
      const digits = text.slice(start, p).replaceAll("_", "");
      let value: bigint;
      try {
        value = BigInt(digits.endsWith("n") ? digits.slice(0, -1) : digits);
      } catch {
        return fail();
      }
      return { type: "number", raw: (sign && value !== 0n ? "-" : "") + value.toString() };
    }
    while (p < n) {
      const char = text[p]!;
      if (isDigit(text.charCodeAt(p)) || char === "_" || char === ".") p++;
      else if (char === "e" || char === "E") {
        p++;
        if (text[p] === "+" || text[p] === "-") p++;
      } else break;
    }
    const match = DECIMAL.exec(text.slice(start, p).replaceAll("_", ""));
    if (!match || (!match[1] && !match[2])) fail();
    // BigInt (10n) and Python 2 long (10L) suffixes.
    if (/[nlL]/.test(text[p] ?? "")) p++;
    // 1-1 is arithmetic, not two numbers with a comma missing.
    if (p < n && (isWordChar(text.charCodeAt(p), text[p]!) || text[p] === "+" || text[p] === "-")) fail();
    const [, int, fraction, exponent] = match!;
    return { type: "number", raw: sign + (int!.replace(/^0+(?=\d)/, "") || "0") + (fraction ? "." + fraction : "") + (exponent ?? "") };
  };

  return (): Token => {
    skipSpaceAndComments();
    if (p >= n) return { type: "end" };
    const c = text.charCodeAt(p);
    const char = text[p]!;
    if ("{}[](),:".includes(char)) {
      p++;
      return { type: "punct", value: char as Punct };
    }
    if (char === "=" && text[p + 1] === ">") {
      p += 2;
      return { type: "punct", value: ":" };
    }
    if (char === '"' || char === "'" || char === "`") return string(char, false);
    const next = text.charCodeAt(p + 1);
    if (isDigit(c) || (char === "." && isDigit(next)) || ((char === "+" || char === "-") && (isDigit(next) || next === 46 || next === 73 || next === 78))) {
      return number();
    }
    const first = charAt(p);
    if (isWordStart(c, first)) {
      const start = p;
      p += first.length;
      while (p < n) {
        const ch = charAt(p);
        if (!isWordChar(ch.codePointAt(0)!, ch)) break;
        p += ch.length;
      }
      const word = text.slice(start, p);
      if ((text[p] === "'" || text[p] === '"') && STRING_PREFIX.test(word)) return string(text[p]!, /r/i.test(word));
      return { type: "word", value: word };
    }
    return fail();
  };
}

/**
 * Decodes the escape after a backslash at `at`: its text, how many characters it takes, and whether JSON allows it.
 * Escapes JSON lacks (\x41, \v, \0, \u{1F600}, a line continuation, \') are the JavaScript, JSON5 and Python ones.
 */
function escape(text: string, at: number): [decoded: string, length: number, valid: boolean] {
  const char = text[at];
  switch (char) {
    case undefined:
      return fail();
    case '"':
    case "\\":
    case "/":
      return [char, 1, true];
    case "b":
      return ["\b", 1, true];
    case "f":
      return ["\f", 1, true];
    case "n":
      return ["\n", 1, true];
    case "r":
      return ["\r", 1, true];
    case "\r":
      return ["", text[at + 1] === "\n" ? 2 : 1, false]; // a line continuation
    case "t":
      return ["\t", 1, true];
    case "v":
      return ["\v", 1, false];
    case "a":
      return ["\x07", 1, false];
    case "0":
      return isDigit(text.charCodeAt(at + 1)) ? fail() : ["\0", 1, false];
    case "\n":
    case " ":
    case " ":
      return ["", 1, false];
    case "x": {
      const hex = text.slice(at + 1, at + 3);
      if (hex.length !== 2 || !HEX_DIGITS.test(hex)) fail();
      return [String.fromCharCode(parseInt(hex, 16)), 3, false];
    }
    case "u": {
      if (text[at + 1] === "{") {
        const end = text.indexOf("}", at + 2);
        const hex = end < 0 ? "" : text.slice(at + 2, end);
        if (!HEX_DIGITS.test(hex) || parseInt(hex, 16) > 0x10ffff) fail();
        return [String.fromCodePoint(parseInt(hex, 16)), end - at + 1, false];
      }
      const hex = text.slice(at + 1, at + 5);
      if (hex.length !== 4 || !HEX_DIGITS.test(hex)) fail();
      return [String.fromCharCode(parseInt(hex, 16)), 5, true];
    }
    default: {
      // Any other character stands for itself (JSON5); a surrogate pair is one character.
      const decoded = String.fromCodePoint(text.codePointAt(at)!);
      return [decoded, decoded.length, false];
    }
  }
}

const CLOSERS: Partial<Record<Punct, Punct>> = { "{": "}", "[": "]", "(": ")" };

function parse(text: string): JsonNode {
  const next = lexer(text);
  const roots: JsonNode[] = [];
  const stack: { node: Container; close: Punct; key: string }[] = [];

  const add = (node: JsonNode) => {
    const top = stack.at(-1);
    if (!top) roots.push(node);
    else if (top.node.kind === "object") top.node.entries.push([top.key, node]);
    else top.node.items.push(node);
  };

  /** A Ruby symbol (:name or :"name") read as a string. */
  const symbol = (): string => {
    const token = next();
    if (token.type === "word") return JSON.stringify(token.value);
    if (token.type === "string") return token.raw;
    return fail();
  };

  const key = (token: Token): string => {
    if (token.type === "string") return token.raw;
    if (token.type === "number") return JSON.stringify(token.raw);
    if (token.type === "word") return JSON.stringify(token.value);
    if (token.type === "punct" && token.value === ":") return symbol();
    return fail();
  };

  for (;;) {
    let token = next();
    // Commas only separate, so trailing, missing and doubled ones all read the same.
    if (token.type === "punct" && token.value === ",") continue;
    const top = stack.at(-1);
    if (token.type === "end") {
      if (top) fail();
      break;
    }
    if (token.type === "punct" && (token.value === "}" || token.value === "]" || token.value === ")")) {
      if (token.value !== top?.close) fail();
      stack.pop();
      add(top!.node);
      continue;
    }

    if (top?.node.kind === "object") {
      top.key = key(token);
      const colon = next();
      if (colon.type !== "punct" || colon.value !== ":") fail();
      token = next();
    }

    if (token.type === "punct") {
      const close = CLOSERS[token.value];
      if (close) {
        stack.push({ node: token.value === "{" ? { kind: "object", entries: [] } : { kind: "array", items: [] }, close, key: "" });
      } else if (token.value === ":") {
        add({ kind: "scalar", raw: symbol() });
      } else fail();
    } else if (token.type === "word") {
      const literal = LITERALS.get(token.value);
      if (literal === undefined) fail();
      add({ kind: "scalar", raw: literal! });
    } else if (token.type === "end") {
      fail();
    } else {
      add({ kind: "scalar", raw: token.raw });
    }
  }

  if (roots.length === 0) fail();
  // NDJSON: one value per line becomes an array of them.
  return roots.length === 1 ? roots[0]! : { kind: "array", items: roots };
}

/** Repairs JSON5, NDJSON or a Python, Ruby or JavaScript literal into JSON, or returns null if it cannot. */
export function repairJson(text: string, options: TransformOptions): string | null {
  return attemptError(() => printJson(parse(text), options), RepairError).value;
}
