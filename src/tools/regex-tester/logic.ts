/** Why a pattern does not compile; each is translated under `errors.<reason>` in the Tool namespace. */
export type PatternErrorReason =
  | "unterminated-group"
  | "unmatched-paren"
  | "nothing-to-repeat"
  | "unterminated-class"
  | "range-out-of-order"
  | "trailing-backslash"
  | "quantifier-out-of-order"
  | "duplicate-group-name"
  | "invalid-group-name"
  | "invalid-named-reference"
  | "invalid-group"
  | "invalid-escape"
  | "invalid-property"
  | "invalid-pattern";

export interface PatternError {
  reason: PatternErrorReason;
  /** The engine's own message, shown as a detail when no reason fits it (`invalid-pattern`). */
  detail: string;
}

export type Compiled = { ok: true; regex: RegExp } | { ok: false; error: PatternError };

// The engine's messages, as V8 (WebView2) and JavaScriptCore (WebKit on macOS and Linux) word them, in the order
// they are tried: the more specific first.
const REASONS: [RegExp, PatternErrorReason][] = [
  [/unterminated group|missing \)/i, "unterminated-group"],
  [/unmatched '\)'|unmatched paren/i, "unmatched-paren"],
  [/nothing to repeat/i, "nothing-to-repeat"],
  [/unterminated character class|missing terminating \]/i, "unterminated-class"],
  [/range out of order/i, "range-out-of-order"],
  [/\\ at end of pattern/i, "trailing-backslash"],
  [/numbers out of order/i, "quantifier-out-of-order"],
  [/duplicate (capture group|group specifier) name/i, "duplicate-group-name"],
  [/invalid (capture group|group specifier) name/i, "invalid-group-name"],
  [/named capture referenced|named backreference/i, "invalid-named-reference"],
  [/invalid group/i, "invalid-group"],
  [/invalid (unicode )?escape|invalid escaped character/i, "invalid-escape"],
  [/property name|property expression/i, "invalid-property"],
];

/** The part of the engine's message after "Invalid regular expression: /…/flags: ". */
function detailOf(message: string): string {
  const at = message.lastIndexOf(": ");
  return at === -1 ? message : message.slice(at + 2);
}

/** A part of the text, in UTF-16 units as JavaScript counts them. */
export interface Span {
  start: number;
  end: number;
  text: string;
}

/** A capture group of a match: `span` is null when the group took no part in it, e.g. `(x)?` with no x. */
export interface Group {
  number: number;
  name?: string;
  span: Span | null;
}

export interface Match extends Span {
  groups: Group[];
}

export interface Matches {
  matches: Match[];
  /** More matches were left out after `limit`. */
  truncated: boolean;
}

/** How many matches are kept by default: enough to list, few enough to highlight and keep in memory. */
export const MATCH_LIMIT = 10_000;

/**
 * The name of each capturing group of `source`, by group number (index 0 is the whole match): a group is named by
 * `(?<name>`, unnamed by a bare `(`; `(?:`, `(?=`, `(?<=` and the like capture nothing.
 */
function groupNames(source: string): (string | undefined)[] {
  const names: (string | undefined)[] = [undefined];
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") i++;
    else if (inClass) inClass = c !== "]";
    else if (c === "[") inClass = true;
    else if (c === "(") {
      if (source[i + 1] !== "?") names.push(undefined);
      else if (source[i + 2] === "<" && source[i + 3] !== "=" && source[i + 3] !== "!") {
        names.push(source.slice(i + 3, source.indexOf(">", i + 3)));
      }
    }
  }
  return names;
}

/** Where the next search starts after an empty match at `index`: the next code point with the u flag, else unit. */
function stepPast(text: string, index: number, unicode: boolean): number {
  if (!unicode || index + 1 >= text.length) return index + 1;
  const c = text.charCodeAt(index);
  const next = text.charCodeAt(index + 1);
  return c >= 0xd800 && c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? index + 2 : index + 1;
}

/**
 * The matches of `regex` in `text`, as `String.prototype.matchAll` finds them with the g flag, and only the first
 * without it. The y flag keeps each match where the last one ended. At most `limit` matches are kept.
 */
export function findMatches(regex: RegExp, text: string, limit = MATCH_LIMIT): Matches {
  // The d flag gives the position of each group; it changes nothing about what matches.
  const search = new RegExp(regex.source, regex.flags.includes("d") ? regex.flags : regex.flags + "d");
  const names = groupNames(regex.source);
  const matches: Match[] = [];
  search.lastIndex = 0;
  for (;;) {
    const found = search.exec(text);
    if (!found) return { matches, truncated: false };
    if (matches.length === limit) return { matches, truncated: true };
    const [start, end] = found.indices![0]!;
    const groups = found.slice(1).map((value, i): Group => {
      const number = i + 1;
      const at = found.indices![number];
      const span = value === undefined || !at ? null : { start: at[0], end: at[1], text: value };
      return names[number] === undefined ? { number, span } : { number, name: names[number], span };
    });
    matches.push({ start, end, text: found[0], groups });
    if (!search.global) return { matches, truncated: false };
    if (start === end) search.lastIndex = stepPast(text, end, regex.unicode);
  }
}

/**
 * `text` with the matches of `regex` replaced, as `String.prototype.replace` does: every match with the g flag, the
 * first without it, reading `$1`, `$<name>`, `$&` and `$$` in `replacement`.
 */
export function replaceMatches(regex: RegExp, text: string, replacement: string): string {
  // A sticky pattern without g starts where its last run ended; every run starts at the beginning.
  regex.lastIndex = 0;
  return text.replace(regex, replacement);
}

/** Compiles `pattern` with `flags`, or says why it is not a valid pattern. Compiling never runs the pattern. */
export function compileRegex(pattern: string, flags: string): Compiled {
  try {
    return { ok: true, regex: new RegExp(pattern, flags) };
  } catch (error) {
    const detail = detailOf(error instanceof Error ? error.message : String(error));
    const reason = REASONS.find(([test]) => test.test(detail))?.[1] ?? "invalid-pattern";
    return { ok: false, error: { reason, detail } };
  }
}
