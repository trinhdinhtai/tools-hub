import type { Plugin } from "prettier";
import { minifyMarkup } from "./markup";
import { minifyCss, minifyJavaScript } from "./minify";
import { minifySql } from "./sql";

export const LANGUAGES = ["html", "css", "javascript", "xml", "sql"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Beautify: indented, one statement or element per line. Minify: as short as it can be and still mean the same. */
export const ACTIONS = ["beautify", "minify"] as const;
export type Action = (typeof ACTIONS)[number];

export const INDENTS = ["2", "4", "tab"] as const;
export type Indent = (typeof INDENTS)[number];

/** Why Input could not be formatted: it is empty, or not valid code (with where, when the parser says). */
export type FormatError = { reason: "empty" } | { reason: "invalid"; line?: number; column?: number; message: string };

export type FormatResult = { ok: true; text: string } | { ok: false; error: FormatError };

const SQL_DIALECTS = ["sql", "postgresql", "mysql", "transactsql", "plsql"] as const;

const indentOptions = (indent: Indent) => ({ useTabs: indent === "tab", tabWidth: indent === "4" ? 4 : 2 });

/** The parser and plugins Prettier needs for a language, loaded only when that language is formatted. */
async function prettierSetup(language: Exclude<Language, "sql">): Promise<{ parser: string; plugins: Plugin[] }> {
  switch (language) {
    case "javascript": {
      const [babel, estree] = await Promise.all([import("prettier/plugins/babel"), import("prettier/plugins/estree")]);
      return { parser: "babel", plugins: [babel, estree as Plugin] };
    }
    case "css":
      return { parser: "css", plugins: [await import("prettier/plugins/postcss")] };
    case "html": {
      // Prettier formats the <script> and <style> inside HTML with the JavaScript and CSS plugins.
      const plugins = await Promise.all([
        import("prettier/plugins/html"),
        import("prettier/plugins/postcss"),
        import("prettier/plugins/babel"),
        import("prettier/plugins/estree"),
      ]);
      return { parser: "html", plugins: plugins as Plugin[] };
    }
    case "xml":
      return { parser: "xml", plugins: [(await import("@prettier/plugin-xml")).default] };
  }
}

async function beautify(text: string, language: Language, indent: Indent): Promise<string> {
  if (language === "sql") {
    const { format } = await import("sql-formatter");
    // Standard SQL first, then the dialects whose syntax it lacks ($1, [name], `name`); an error is standard SQL's.
    let firstError: unknown;
    for (const dialect of SQL_DIALECTS) {
      try {
        return `${format(text, { language: dialect, keywordCase: "upper", ...indentOptions(indent) })}\n`;
      } catch (error) {
        firstError ??= error;
      }
    }
    throw firstError;
  }
  const { format } = await import("prettier/standalone");
  const { parser, plugins } = await prettierSetup(language);
  // XML: whitespace between elements is layout, so elements go one per line (text inside them is kept).
  return format(text, { parser, plugins, xmlWhitespaceSensitivity: "ignore", ...indentOptions(indent) });
}

/** Where a parser says the error is: Prettier puts it in `loc`, terser in `line` and a 0-based `col`. */
interface ParserError {
  loc?: { start?: { line?: number | null; column?: number | null } };
  line?: number;
  col?: number;
}

const positive = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined);

/**
 * Minifiers forgive what a parser refuses (csso closes an unclosed block), so all but JavaScript are first parsed
 * by their beautifier: code that does not parse is an error when minified too.
 */
async function minify(text: string, language: Language): Promise<string> {
  if (language === "javascript") return minifyJavaScript(text);
  await beautify(text, language, "2");
  switch (language) {
    case "css":
      return minifyCss(text);
    case "html":
    case "xml":
      return minifyMarkup(text, language, { javascript: minifyJavaScript, css: minifyCss });
    case "sql":
      return minifySql(text);
  }
}

/** A parser's error as a FormatError: the first line of its message, without the position it repeats. */
function invalid(error: unknown): FormatError {
  const raw = error instanceof Error ? error.message : String(error);
  const message = (raw.split("\n")[0] ?? "")
    .replace(/^\w*SyntaxError: /, "")
    .replace(/\s*\((\d+|NaN):(\d+|NaN)\)\s*$/, "")
    .replace(/ at line \d+ column \d+\.?$/, "")
    .replace(/ For more info see \S+$/, "")
    .trim();
  const parser = error as ParserError | null;
  const start = parser?.loc?.start;
  // sql-formatter puts the position only in its message: "Parse error at token: «EOF» at line 1 column 17".
  const sqlAt = /\bat line (\d+) column (\d+)/.exec(raw);
  const line = positive(start?.line) ?? positive(parser?.line) ?? positive(Number(sqlAt?.[1]));
  const column = positive(start?.column) ?? positive((parser?.col ?? -1) + 1) ?? positive(Number(sqlAt?.[2]));
  return line === undefined ? { reason: "invalid", message } : { reason: "invalid", line, column: column ?? 1, message };
}

/** Beautifies or minifies `text` as `language`; code that is not valid is an error, never a broken result. */
export async function formatCode(text: string, language: Language, action: Action, indent: Indent): Promise<FormatResult> {
  if (!text.trim()) return { ok: false, error: { reason: "empty" } };
  try {
    return { ok: true, text: action === "beautify" ? await beautify(text, language, indent) : await minify(text, language) };
  } catch (error) {
    return { ok: false, error: invalid(error) };
  }
}
