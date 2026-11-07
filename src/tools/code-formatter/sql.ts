/**
 * No space is needed before these, nor after them but ")" (kept, as in "IN(1,2) AND", for reading); never "-", since
 * "- -1" must not become "--1".
 */
const TIGHT = new Set([",", "(", ")", ";", "="]);
const TIGHT_AFTER = new Set([",", "(", ";", "="]);

/** Index just past a quoted part starting at `from` ('…', "…", `…` or […]); a doubled quote stays inside. */
function quotedEnd(text: string, from: number): number {
  const close = text[from] === "[" ? "]" : text[from]!;
  let i = from + 1;
  while (i < text.length) {
    if (text[i] === close) {
      if (text[i + 1] !== close || close === "]") return i + 1;
      i += 2;
    } else i++;
  }
  return text.length;
}

/** Index just past a PostgreSQL dollar-quoted string ($$…$$ or $tag$…$tag$) at `from`, or `from` when there is none. */
function dollarEnd(text: string, from: number): number {
  const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(from, from + 64))?.[0];
  if (!tag) return from;
  const close = text.indexOf(tag, from + tag.length);
  return close === -1 ? text.length : close + tag.length;
}

/**
 * SQL on one line, as short as it can be without changing what it says: comments go, every run of whitespace
 * becomes one space or none, and strings, quoted names and keyword case stay as they are. Comments that are read
 * stay: optimizer hints (`/*+ … *\/`) and MySQL's versioned code (`/*! … *\/`).
 */
export function minifySql(text: string): string {
  let out = "";
  let space = false;
  let newline = false;
  const emit = (part: string) => {
    // PostgreSQL joins two strings only across a line break: 'a'\n'b' is 'ab', but 'a' 'b' is an error.
    if (space && newline && out.endsWith("'") && part.startsWith("'")) out += "\n";
    else if (space && out && !TIGHT_AFTER.has(out.at(-1)!) && !TIGHT.has(part[0]!)) out += " ";
    space = false;
    newline = false;
    out += part;
  };
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (/\s/.test(char)) {
      space = true;
      newline ||= char === "\n" || char === "\r";
      i++;
    } else if (text.startsWith("--", i)) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end;
      space = true;
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      const end = close === -1 ? text.length : close + 2;
      if (text[i + 2] === "+" || text[i + 2] === "!") emit(text.slice(i, end));
      i = end;
      space = true;
    } else if (char === "'" || char === '"' || char === "`" || char === "[") {
      const end = quotedEnd(text, i);
      emit(text.slice(i, end));
      i = end;
    } else if (char === "$" && dollarEnd(text, i) > i) {
      const end = dollarEnd(text, i);
      emit(text.slice(i, end));
      i = end;
    } else {
      emit(char);
      i++;
    }
  }
  return out;
}
