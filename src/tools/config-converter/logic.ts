import { parse as parseTomlText, stringify as stringifyTomlValue, TomlError } from "smol-toml";
import { Document, isNode, isScalar, parseAllDocuments, visit } from "yaml";
import { readEnv, writeEnv } from "./env";
import { InvalidConfig, position } from "./invalid";
import { readProperties, writeProperties } from "./properties";

export const FORMATS = ["json", "yaml", "toml", "env", "properties"] as const;
export type Format = (typeof FORMATS)[number];

/** What a config holds once read: one value per document. Only YAML can hold more than one. */
export type Documents = unknown[];

export type ConfigError =
  | { reason: "empty" }
  /** The Input is not valid in its format; where, if the parser could tell. Both are 1-based. */
  | { reason: "invalid"; line?: number; column?: number }
  /** TOML has no null; `path` is where the first one is, e.g. `servers[0].name`. */
  | { reason: "toml-null"; path: string }
  /** The output format holds only a table of keys at the top, not an array or a single value. */
  | { reason: "not-a-table" }
  /** A key the output format cannot hold, e.g. one with a space in a .env file. */
  | { reason: "bad-key"; key: string };

export type ParseResult = { ok: true; docs: Documents } | { ok: false; error: ConfigError };
export type ConvertResult = { ok: true; text: string } | { ok: false; error: ConfigError };

function parseJson(text: string): Documents {
  try {
    return [JSON.parse(text)];
  } catch (error) {
    // V8 (WebView2, Node) says where; other engines may not, and then the error has no position.
    const offset = /at position (\d+)/.exec((error as Error).message)?.[1];
    throw new InvalidConfig(offset === undefined ? undefined : position(text, Number(offset)));
  }
}

/** A key twice in one map is not YAML. The library checks it too, but in quadratic time: large maps took seconds. */
function checkUniqueKeys(doc: Document.Parsed, text: string) {
  visit(doc, {
    Map(_, map) {
      const seen = new Set<unknown>();
      for (const { key } of map.items) {
        const id = isScalar(key) ? key.value : String(key);
        if (seen.has(id)) throw new InvalidConfig(position(text, (isNode(key) && key.range?.[0]) || 0));
        seen.add(id);
      }
    },
  });
}

/** Whether a value holds itself, as an alias inside its own anchor makes it do. No other format can hold that. */
function isCircular(value: unknown, ancestors = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (ancestors.has(value)) return true;
  ancestors.add(value);
  const circular = Object.values(value).some((child) => isCircular(child, ancestors));
  ancestors.delete(value);
  return circular;
}

function parseYaml(text: string): Documents {
  const docs = parseAllDocuments(text, { uniqueKeys: false });
  // A `---` at the end, or two in a row, leaves an empty document that is not part of the config.
  const isEmpty = (doc: Document.Parsed) => doc.contents === null || (isScalar(doc.contents) && doc.contents.source === "");
  const kept = docs.length > 1 ? docs.filter((doc) => !isEmpty(doc)) : docs;
  return kept.map((doc) => {
    const [error] = doc.errors;
    if (error) {
      const at = error.linePos?.[0];
      throw new InvalidConfig(at && { line: at.line, column: at.col });
    }
    checkUniqueKeys(doc, text);
    let value: unknown;
    try {
      value = doc.toJS(); // throws when aliases would expand past the library's limit (a "billion laughs")
    } catch {
      throw new InvalidConfig();
    }
    if (isCircular(value)) throw new InvalidConfig();
    return value;
  });
}

function parseToml(text: string): Documents {
  try {
    // Through JSON, so that dates become the ISO strings every other format can hold.
    return [JSON.parse(JSON.stringify(parseTomlText(text)))];
  } catch (error) {
    if (!(error instanceof TomlError)) throw error;
    throw new InvalidConfig({ line: error.line, column: error.column });
  }
}

const PARSERS: Record<Format, (text: string) => Documents> = {
  json: parseJson,
  yaml: parseYaml,
  toml: parseToml,
  env: (text) => [readEnv(text)],
  properties: (text) => [readProperties(text)],
};

/** Reads a config, or says why it cannot. */
export function parseConfig(text: string, format: Format): ParseResult {
  if (!text.trim()) return { ok: false, error: { reason: "empty" } };
  try {
    return { ok: true, docs: PARSERS[format](text) };
  } catch (error) {
    if (!(error instanceof InvalidConfig)) throw error;
    return { ok: false, error: { reason: "invalid", ...error.at } };
  }
}

/** One value: several documents become an array of them. */
const asOne = (docs: Documents): unknown => (docs.length === 1 ? docs[0] : docs);

const isTable = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Where the first null is, depth first, e.g. `servers[0].name`; undefined if there is none. */
function findNull(value: unknown, path = ""): string | undefined {
  if (value === null) return path;
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const found = findNull(item, `${path}[${i}]`);
      if (found !== undefined) return found;
    }
  } else if (isTable(value)) {
    for (const [key, item] of Object.entries(value)) {
      const found = findNull(item, path ? `${path}.${key}` : key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function stringifyToml(table: Record<string, unknown>): ConvertResult {
  const nullAt = findNull(table);
  if (nullAt !== undefined) return { ok: false, error: { reason: "toml-null", path: nullAt } };
  return { ok: true, text: stringifyTomlValue(table).trimEnd() + "\n" };
}

function stringifyFlat(written: { text: string } | { badKey: string }): ConvertResult {
  return "badKey" in written ? { ok: false, error: { reason: "bad-key", key: written.badKey } } : { ok: true, ...written };
}

/** Writes what a config holds in a format, or says why that format cannot hold it. */
export function stringifyConfig(docs: Documents, format: Format): ConvertResult {
  if (format === "yaml") {
    return { ok: true, text: docs.map((doc, i) => (i > 0 ? "---\n" : "") + new Document(doc).toString()).join("") };
  }
  const value = asOne(docs);
  if (format === "json") return { ok: true, text: JSON.stringify(value, null, 2) + "\n" };
  if (!isTable(value)) return { ok: false, error: { reason: "not-a-table" } };
  if (format === "toml") return stringifyToml(value);
  if (format === "properties") return { ok: true, text: writeProperties(value) };
  return stringifyFlat(writeEnv(value));
}

/** Converts a config from one format to another, or says why it cannot. */
export function convertConfig(text: string, from: Format, to: Format): ConvertResult {
  const parsed = parseConfig(text, from);
  return parsed.ok ? stringifyConfig(parsed.docs, to) : parsed;
}

/** Lines with content: blank lines and `#` comments left out. */
const contentLines = (text: string) =>
  text.split(/\r\n|\r|\n/).filter((line) => line.trim() && !line.trimStart().startsWith("#"));

const parses = (text: string, format: Format) => parseConfig(text, format).ok;

/** `KEY=value` with an upper-case key and no space before `=`; `==…` is Base64 padding, not a value. */
const ENV_LINE = /^(?:export[ \t]+)?[A-Z_][A-Z0-9_]*=(?!=)/;
/** `key=value` with a dotted key, no space before `=`; Java keys like `server.port`. */
const PROPERTIES_LINE = /^[A-Za-z_][\w-]*(?:\.[\w-]+|\[\d+\])*=(?!=)/;
const TOML_TABLE = /^\[\[?[\w."' -]+\]\]?\s*(?:#.*)?$/;
const TOML_ASSIGNMENT = /^[\w."'-]+ = \S/;

/** A YAML map or sequence whose top-level keys read like config keys: no spaces, so prose with colons is not YAML. */
function looksLikeYaml(text: string, lines: string[]): boolean {
  const parsed = parseConfig(text, "yaml");
  if (!parsed.ok) return false;
  const structured = parsed.docs.filter((doc) => typeof doc === "object" && doc !== null);
  if (structured.length === 0) return false;
  if (lines.length < 2 && !text.trimStart().startsWith("---")) return false;
  return structured.every((doc) => Array.isArray(doc) || Object.keys(doc as object).every((key) => !/\s/.test(key)));
}

/** The format the text is most likely in, or null if it does not look like a config. */
export function detectFormat(text: string): Format | null {
  const lines = contentLines(text);
  if (lines.length === 0) return null;
  const start = text.trimStart()[0];
  if ((start === "{" || start === "[") && parses(text, "json")) return "json";
  if (lines.every((line) => ENV_LINE.test(line.trimStart())) && parses(text, "env")) return "env";
  if (lines.some((line) => TOML_TABLE.test(line.trim()) || TOML_ASSIGNMENT.test(line.trim())) && parses(text, "toml")) {
    return "toml";
  }
  if (lines.every((line) => PROPERTIES_LINE.test(line.trimStart())) && lines.some((line) => /^[^=]*[.[]/.test(line))) {
    return "properties";
  }
  return looksLikeYaml(text, lines) ? "yaml" : null;
}

const SCORES: Record<Format, number> = { json: 0.5, yaml: 0.7, toml: 0.8, env: 0.8, properties: 0.6 };

/**
 * Paste Detection: a config in any of the formats. JSON scores below JSON Viewer, which suits it better; an empty
 * object or array is not worth suggesting.
 */
export function detectPaste(text: string): number {
  const format = detectFormat(text);
  if (format === null) return 0;
  if (format === "json" && /^\s*(?:\{\s*\}|\[\s*\])\s*$/.test(text)) return 0;
  return SCORES[format];
}
