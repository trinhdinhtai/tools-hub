// JSON is parsed here rather than with JSON.parse, so that formatting changes only whitespace: keys keep their order
// (JSON.parse moves integer-like keys first), numbers keep their digits (12345678901234567890 stays exact), strings
// keep their escapes, and errors carry a reason the UI can translate. Parsing and printing use explicit stacks, so
// deeply nested Input cannot overflow the call stack.

export type Indent = 2 | 4 | "tab";
export const INDENTS: readonly Indent[] = [2, 4, "tab"];

export interface TransformOptions {
  /** Format: one value per line, indented. Minify: no whitespace at all. */
  output: "format" | "minify";
  indent: Indent;
  /** Sort the keys of every object, at every depth. */
  sortKeys: boolean;
}

export type JsonErrorReason =
  | "empty"
  | "unexpected-end"
  | "expected-value"
  | "expected-key"
  | "expected-colon"
  | "expected-comma-or-brace"
  | "expected-comma-or-bracket"
  | "trailing-comma"
  | "trailing-content"
  | "invalid-number"
  | "invalid-escape"
  | "unescaped-control"
  | "unterminated-string";

export interface JsonError {
  reason: JsonErrorReason;
  /** 1-based. */
  line: number;
  /** 1-based, in characters (code points). */
  column: number;
  /** The character found where the error is, if the Input did not end there. */
  found?: string;
}

export type TransformResult = { ok: true; text: string } | { ok: false; error: JsonError };

type JsonNode =
  | { kind: "object"; entries: [key: string, value: JsonNode][] }
  | { kind: "array"; items: JsonNode[] }
  /** A string, number, true, false or null, exactly as written. */
  | { kind: "scalar"; raw: string };

type Container = Extract<JsonNode, { kind: "object" | "array" }>;

class ParseError extends Error {
  constructor(
    readonly reason: JsonErrorReason,
    readonly offset: number,
  ) {
    super(reason);
  }
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const NUMBER_CHAR = /[\d.eE+-]/;
const HEX4 = /^[\da-fA-F]{4}$/;
const SIMPLE_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);

function parse(text: string): JsonNode {
  const n = text.length;
  let p = text.charCodeAt(0) === 0xfeff ? 1 : 0; // a byte order mark is not part of the JSON

  const fail = (reason: JsonErrorReason, at = p): never => {
    throw new ParseError(at >= n && reason !== "empty" && reason !== "unterminated-string" ? "unexpected-end" : reason, at);
  };
  const ws = () => {
    for (; p < n; p++) {
      const c = text.charCodeAt(p);
      if (c !== 32 && c !== 10 && c !== 13 && c !== 9) break;
    }
  };

  const string = (): string => {
    const start = p++;
    for (;;) {
      if (p >= n) fail("unterminated-string", start);
      const c = text.charCodeAt(p);
      if (c === 34) return text.slice(start, ++p);
      if (c === 92) {
        const escape = text[p + 1];
        if (escape === undefined) fail("unterminated-string", start);
        if (SIMPLE_ESCAPES.has(escape!)) p += 2;
        else if (escape === "u" && HEX4.test(text.slice(p + 2, p + 6))) p += 6;
        else fail("invalid-escape");
      } else if (c < 0x20) fail("unescaped-control");
      else p++;
    }
  };

  const scalar = (): JsonNode => {
    const c = text[p];
    if (c === '"') return { kind: "scalar", raw: string() };
    if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) {
      const start = p;
      NUMBER.lastIndex = p;
      const match = NUMBER.exec(text);
      if (!match || NUMBER_CHAR.test(text[start + match[0].length] ?? "")) fail("invalid-number", start);
      p += match![0].length;
      return { kind: "scalar", raw: match![0] };
    }
    for (const literal of ["true", "false", "null"]) {
      if (text.startsWith(literal, p)) {
        p += literal.length;
        return { kind: "scalar", raw: literal };
      }
      if (p + literal.length > n && literal.startsWith(text.slice(p))) fail("unexpected-end", n); // "tru" at the end

    }
    return fail("expected-value");
  };

  const key = (): string => {
    ws();
    if (text[p] !== '"') fail("expected-key");
    const raw = string();
    ws();
    if (text[p] !== ":") fail("expected-colon");
    p++;
    return raw;
  };

  ws();
  if (p >= n) fail("empty");

  const stack: { node: Container; key: string }[] = [];
  for (;;) {
    // A value starts here: a scalar, an empty container, or the first member of a container.
    ws();
    let node: JsonNode;
    const c = text[p];
    if (c === "{" || c === "[") {
      p++;
      ws();
      const container: Container = c === "{" ? { kind: "object", entries: [] } : { kind: "array", items: [] };
      if (text[p] === (c === "{" ? "}" : "]")) {
        p++;
        node = container;
      } else {
        stack.push({ node: container, key: c === "{" ? key() : "" });
        continue;
      }
    } else {
      node = scalar();
    }

    // The value is complete: add it to its container, then close every container that ends after it.
    for (;;) {
      const top = stack.at(-1);
      if (!top) {
        ws();
        if (p < n) fail("trailing-content");
        return node;
      }
      if (top.node.kind === "object") top.node.entries.push([top.key, node]);
      else top.node.items.push(node);
      ws();
      const isObject = top.node.kind === "object";
      if (text[p] === ",") {
        const comma = p++;
        ws();
        if (text[p] === (isObject ? "}" : "]")) fail("trailing-comma", comma);
        if (isObject) top.key = key();
        break;
      }
      if (text[p] === (isObject ? "}" : "]")) {
        p++;
        stack.pop();
        node = top.node;
        continue;
      }
      fail(isObject ? "expected-comma-or-brace" : "expected-comma-or-bracket");
    }
  }
}

/** The 1-based line and column (in code points) of a UTF-16 offset. */
function position(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    const c = text.charCodeAt(i);
    if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) {
      line++;
      lineStart = i + 1;
    }
  }
  let column = 1;
  if (lineStart === 0 && text.charCodeAt(0) === 0xfeff) lineStart = 1; // the byte order mark is invisible
  for (let i = lineStart; i < offset; i++) {
    const c = text.charCodeAt(i);
    if (c < 0xd800 || c > 0xdbff) column++; // a high surrogate and its pair count once
  }
  return { line, column };
}

const decodedKey = (raw: string): string => JSON.parse(raw) as string;

function print(root: JsonNode, { output, indent, sortKeys }: TransformOptions): string {
  const unit = output === "minify" ? "" : indent === "tab" ? "\t" : " ".repeat(indent);
  const colon = unit ? ": " : ":";
  const breaks: string[] = [];
  const newline = (depth: number) => (unit ? (breaks[depth] ??= "\n" + unit.repeat(depth)) : "");

  const out: string[] = [];
  // Pieces still to write, last first: text as is, or a value with its depth.
  const work: (string | { node: JsonNode; depth: number })[] = [{ node: root, depth: 0 }];
  while (work.length > 0) {
    const item = work.pop()!;
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    const { node, depth } = item;
    if (node.kind === "scalar") {
      out.push(node.raw);
    } else if (node.kind === "object") {
      if (node.entries.length === 0) {
        out.push("{}");
        continue;
      }
      const entries = sortKeys ? sortedEntries(node.entries) : node.entries;
      work.push(newline(depth) + "}");
      for (let k = entries.length - 1; k >= 0; k--) {
        const [key, value] = entries[k]!;
        work.push({ node: value, depth: depth + 1 });
        work.push((k > 0 ? "," : "") + newline(depth + 1) + key + colon);
      }
      work.push("{");
    } else {
      if (node.items.length === 0) {
        out.push("[]");
        continue;
      }
      work.push(newline(depth) + "]");
      for (let k = node.items.length - 1; k >= 0; k--) {
        work.push({ node: node.items[k]!, depth: depth + 1 });
        work.push((k > 0 ? "," : "") + newline(depth + 1));
      }
      work.push("[");
    }
  }
  return out.join("");
}

/** By key, comparing UTF-16 code units so the order is the same in every locale; equal keys keep their order. */
function sortedEntries(entries: [string, JsonNode][]): [string, JsonNode][] {
  return entries
    .map((entry) => ({ entry, key: decodedKey(entry[0]) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ entry }) => entry);
}

function tryParse(text: string): JsonNode | JsonError {
  try {
    return parse(text);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    const found = error.offset < text.length ? String.fromCodePoint(text.codePointAt(error.offset)!) : undefined;
    return { reason: error.reason, ...position(text, error.offset), ...(found !== undefined && { found }) };
  }
}

/** Formats or minifies JSON, or says where and why it is not valid JSON. Only whitespace and key order change. */
export function transformJson(text: string, options: TransformOptions): TransformResult {
  const parsed = tryParse(text);
  if ("reason" in parsed) return { ok: false, error: parsed };
  return { ok: true, text: print(parsed, options) };
}

/** Paste Detection: a valid JSON object or array. Scalars on their own ("42", "true") are too common to suggest. */
export function detectPaste(text: string): number {
  const start = text.trimStart()[0];
  if (start !== "{" && start !== "[") return 0;
  const parsed = tryParse(text);
  if ("reason" in parsed) return 0;
  const empty = parsed.kind === "object" ? parsed.entries.length === 0 : parsed.kind === "array" && parsed.items.length === 0;
  return empty ? 0.4 : 0.9;
}
