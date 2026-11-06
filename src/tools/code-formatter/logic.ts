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

/** Element names of HTML; markup that opens with any other name is taken for XML. */
const HTML_TAGS = new Set(
  (
    "html head body title meta link base style script noscript template slot div span p a b i u s em strong small " +
    "code pre br hr img picture source video audio canvas iframe ul ol li dl dt dd table caption thead tbody tfoot " +
    "tr td th form input button select option optgroup textarea label fieldset legend section article header " +
    "footer nav main aside h1 h2 h3 h4 h5 h6 figure figcaption blockquote details summary dialog abbr cite mark " +
    "sub sup time kbd q"
  ).split(" "),
);

/** A statement's first word, and what must follow it for the text to be SQL rather than prose that starts the same. */
const SQL_STATEMENTS: [RegExp, RegExp][] = [
  [/^select\b/i, /./],
  [/^insert\b/i, /\binto\b/i],
  [/^update\b/i, /\bset\b/i],
  [/^delete\b/i, /\bfrom\b/i],
  [/^with\b/i, /\bas\s*\(/i],
  [/^(create|alter|drop)\b/i, /\b(table|view|index|database|schema|function|procedure|trigger|sequence|type)\b/i],
  [/^truncate\b/i, /\btable\b/i],
];

const JAVASCRIPT = /\b(const|let|var|function|return|import|export|class|async|await|typeof|require)\b|=>|\b(console|document|window)\.|\b(if|for|while|switch)\s*\(/;
const CSS_AT_RULE = /^@(media|import|font-face|keyframes|charset|supports|layer|tailwind|page|container|namespace)\b/i;
/** A selector, then a block of declarations: `a[href="x"]:hover { color: red }`, but not `x = { a: 1 }`. */
const CSS_RULE = /^(?:[^{};=[]|\[[^\]]*\])*\{[^{}]*:[^{}]*\}/;
/** Blocks with a colon in them that are JavaScript, not a CSS rule: `switch (x) { case 1: … }`. */
const JAVASCRIPT_BLOCK = /^(if|else|for|while|do|switch|try|function|class|const|let|var|return)\b/;
const LEADING_COMMENTS = /^(\s|--[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/;

/** The language `text` is written in, from how it starts; null when it does not look like code. */
export function detectLanguage(text: string): Language | null {
  // How the code starts says enough; a long Input is not read to its end.
  const head = text.slice(0, 20_000).trimStart();
  if (head.startsWith("<")) {
    if (/^<\?xml\b/i.test(head)) return "xml";
    const withoutComments = head.replace(/^(<!--[\s\S]*?-->\s*)*/, "");
    if (/^<!doctype\s+html\b/i.test(withoutComments)) return "html";
    const name = /^<([A-Za-z][\w:.-]*)/.exec(withoutComments)?.[1];
    if (!name) return null;
    return HTML_TAGS.has(name.toLowerCase()) ? "html" : "xml";
  }
  const code = head.replace(LEADING_COMMENTS, "");
  if (!code) return null;
  if (SQL_STATEMENTS.some(([start, then]) => start.test(code) && then.test(code))) return "sql";
  // CSS first: its values may hold words JavaScript also has (`var(--gap)`).
  if (CSS_AT_RULE.test(code) || (CSS_RULE.test(code) && !JAVASCRIPT_BLOCK.test(code))) return "css";
  if (JAVASCRIPT.test(code)) return "javascript";
  return null;
}

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
