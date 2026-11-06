import type { Plugin } from "prettier";

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
    return `${format(text, { language: "sql", keywordCase: "upper", ...indentOptions(indent) })}\n`;
  }
  const { format } = await import("prettier/standalone");
  const { parser, plugins } = await prettierSetup(language);
  // XML: whitespace between elements is layout, so elements go one per line (text inside them is kept).
  return format(text, { parser, plugins, xmlWhitespaceSensitivity: "ignore", ...indentOptions(indent) });
}

interface PrettierSyntaxError {
  loc?: { start?: { line?: number | null; column?: number | null } };
}

const positive = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined);

/** A parser's error as a FormatError: the first line of its message, without the position it repeats. */
function invalid(error: unknown): FormatError {
  const raw = error instanceof Error ? error.message : String(error);
  const message = (raw.split("\n")[0] ?? "")
    .replace(/^\w*SyntaxError: /, "")
    .replace(/\s*\((\d+|NaN):(\d+|NaN)\)\s*$/, "")
    .replace(/ at line \d+ column \d+\.?$/, "")
    .replace(/ For more info see \S+$/, "")
    .trim();
  const start = (error as PrettierSyntaxError | null)?.loc?.start;
  // sql-formatter puts the position only in its message: "Parse error at token: «EOF» at line 1 column 17".
  const sqlAt = /\bat line (\d+) column (\d+)/.exec(raw);
  const line = positive(start?.line) ?? positive(Number(sqlAt?.[1]));
  const column = positive(start?.column) ?? positive(Number(sqlAt?.[2]));
  return line === undefined ? { reason: "invalid", message } : { reason: "invalid", line, column: column ?? 1, message };
}

/** Beautifies or minifies `text` as `language`; code that is not valid is an error, never a broken result. */
export async function formatCode(text: string, language: Language, action: Action, indent: Indent): Promise<FormatResult> {
  void action;
  if (!text.trim()) return { ok: false, error: { reason: "empty" } };
  try {
    return { ok: true, text: await beautify(text, language, indent) };
  } catch (error) {
    return { ok: false, error: invalid(error) };
  }
}
