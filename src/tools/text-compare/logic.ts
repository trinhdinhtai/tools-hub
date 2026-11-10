export type Granularity = "line" | "word" | "char";

export interface CompareOptions {
  /** Lines that differ only in the amount of whitespace count as equal. */
  ignoreWhitespace: boolean;
  /** Lines that differ only in letter case count as equal. */
  ignoreCase: boolean;
  /** How finely a changed line pair is marked: the whole line, its words, or its characters. */
  granularity: Granularity;
}

/** A piece of a changed line, and whether it differs from the other side. */
export interface Part {
  text: string;
  changed: boolean;
}

/** A line of one side, numbered from 1. */
export interface Cell {
  line: number;
  text: string;
  /** The line in pieces, on a changed row compared by word or character; the pieces join up to `text`. */
  parts?: Part[];
}

/**
 * A row of the side-by-side view. Equal and changed rows have both sides; a removed row only the left; an added row
 * only the right. Within a block of changes, removed and added lines are paired up as changed rows, in order.
 */
export interface Row {
  kind: "equal" | "changed" | "removed" | "added";
  left?: Cell;
  right?: Cell;
}

/** A run of rows that are not equal, as row indexes `[start, end)`. */
export interface Hunk {
  start: number;
  end: number;
}

export interface CompareStats {
  added: number;
  removed: number;
  changed: number;
}

export type Side = "original" | "modified";

export type CompareResult =
  | { ok: true; rows: Row[]; hunks: Hunk[]; stats: CompareStats }
  | { ok: false; reason: "too-large"; side: Side };

/** Most lines on a side. */
export const MAX_LINES = 100_000;

/** Longest side, in UTF-16 units. */
export const MAX_LENGTH = 5_000_000;

/**
 * Steps the search for a shortest edit script may take in all. Texts that share little make it quadratic; past the
 * budget, what is left of them is shown as removed and added as a whole, which is correct, only less precise.
 */
const SEARCH_BUDGET = 20_000_000;

/** The lines of a text; a final line break does not start another line, and CRLF, CR and LF all break a line. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Marks the items of `a` that are removed and of `b` that are added in a shortest edit script between them (Myers'
 * O(ND) algorithm in linear space: each range is split where the forward and backward searches meet). Past the
 * search budget the script is still correct but may be longer than the shortest.
 */
export function diffSequences(a: ArrayLike<number>, b: ArrayLike<number>): { removed: Uint8Array; added: Uint8Array } {
  let budget = SEARCH_BUDGET;
  const removed = new Uint8Array(a.length);
  const added = new Uint8Array(b.length);

  const compare = (aLo: number, aHi: number, bLo: number, bHi: number) => {
    while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
      aLo++;
      bLo++;
    }
    while (aLo < aHi && bLo < bHi && a[aHi - 1] === b[bHi - 1]) {
      aHi--;
      bHi--;
    }
    if (aLo === aHi) return added.fill(1, bLo, bHi);
    if (bLo === bHi) return removed.fill(1, aLo, aHi);
    const split = bisect(aLo, aHi, bLo, bHi);
    if (!split) {
      removed.fill(1, aLo, aHi);
      added.fill(1, bLo, bHi);
      return;
    }
    compare(aLo, split[0], bLo, split[1]);
    compare(split[0], aHi, split[1], bHi);
  };

  /** A point on a shortest edit path through the range, other than its corners; none when nothing is shared. */
  const bisect = (aLo: number, aHi: number, bLo: number, bHi: number): [number, number] | null => {
    const n = aHi - aLo;
    const m = bHi - bLo;
    const maxD = Math.ceil((n + m) / 2);
    const offset = maxD;
    const size = 2 * maxD + 2;
    const forward = new Int32Array(size).fill(-1);
    const backward = new Int32Array(size).fill(-1);
    forward[offset + 1] = 0;
    backward[offset + 1] = 0;
    const delta = n - m;
    const front = delta % 2 !== 0;
    let k1Start = 0;
    let k1End = 0;
    let k2Start = 0;
    let k2End = 0;
    for (let d = 0; d < maxD; d++) {
      if ((budget -= 2 * d + 1) < 0) return null;
      for (let k1 = -d + k1Start; k1 <= d - k1End; k1 += 2) {
        const k1Offset = offset + k1;
        let x1 =
          k1 === -d || (k1 !== d && forward[k1Offset - 1]! < forward[k1Offset + 1]!)
            ? forward[k1Offset + 1]!
            : forward[k1Offset - 1]! + 1;
        let y1 = x1 - k1;
        while (x1 < n && y1 < m && a[aLo + x1] === b[bLo + y1]) {
          x1++;
          y1++;
        }
        forward[k1Offset] = x1;
        if (x1 > n) k1End += 2;
        else if (y1 > m) k1Start += 2;
        else if (front) {
          const k2Offset = offset + delta - k1;
          if (k2Offset >= 0 && k2Offset < size && backward[k2Offset] !== -1 && x1 >= n - backward[k2Offset]!) {
            return [aLo + x1, bLo + y1];
          }
        }
      }
      for (let k2 = -d + k2Start; k2 <= d - k2End; k2 += 2) {
        const k2Offset = offset + k2;
        let x2 =
          k2 === -d || (k2 !== d && backward[k2Offset - 1]! < backward[k2Offset + 1]!)
            ? backward[k2Offset + 1]!
            : backward[k2Offset - 1]! + 1;
        let y2 = x2 - k2;
        while (x2 < n && y2 < m && a[aHi - x2 - 1] === b[bHi - y2 - 1]) {
          x2++;
          y2++;
        }
        backward[k2Offset] = x2;
        if (x2 > n) k2End += 2;
        else if (y2 > m) k2Start += 2;
        else if (!front) {
          const k1Offset = offset + delta - k2;
          if (k1Offset >= 0 && k1Offset < size && forward[k1Offset] !== -1) {
            const x1 = forward[k1Offset]!;
            const y1 = offset + x1 - k1Offset;
            if (x1 >= n - x2) return [aLo + x1, bLo + y1];
          }
        }
      }
    }
    return null;
  };

  compare(0, a.length, 0, b.length);
  return { removed, added };
}

/** What a line is compared by: runs of whitespace count as one space and the ends are trimmed, case is folded. */
function keyOf(text: string, { ignoreWhitespace, ignoreCase }: CompareOptions): string {
  let key = ignoreWhitespace ? text.replace(/\s+/g, " ").trim() : text;
  if (ignoreCase) key = key.toLowerCase();
  return key;
}

/** Numbers each distinct key, so sequences compare by number rather than by string. */
function intern(left: string[], right: string[]): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const number = (key: string) => {
    let id = ids.get(key);
    if (id === undefined) ids.set(key, (id = ids.size));
    return id;
  };
  return [Int32Array.from(left, number), Int32Array.from(right, number)];
}

/** Longest line, in UTF-16 units, marked by word or character; a longer changed line is marked as a whole. */
export const INLINE_LIMIT = 10_000;

const WORD = /\s+|[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu;
const SPACE = /^\s+$/;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The pieces a line is compared in: words, whitespace runs and punctuation, or the characters the user sees. */
function tokenize(text: string, granularity: "word" | "char", ignoreWhitespace: boolean): string[] {
  if (granularity === "word") return text.match(WORD) ?? [];
  const tokens: string[] = [];
  for (const { segment } of graphemes.segment(text)) {
    // When the amount of whitespace does not count, a run of it is one piece, compared as one space.
    const last = tokens.length - 1;
    if (ignoreWhitespace && last >= 0 && SPACE.test(segment) && SPACE.test(tokens[last]!)) tokens[last] += segment;
    else tokens.push(segment);
  }
  return tokens;
}

function tokenKey(token: string, { ignoreWhitespace, ignoreCase }: CompareOptions): string {
  if (ignoreWhitespace && SPACE.test(token)) return " ";
  return ignoreCase ? token.toLowerCase() : token;
}

function joinParts(tokens: string[], marks: Uint8Array): Part[] {
  const parts: Part[] = [];
  tokens.forEach((text, i) => {
    const changed = marks[i] === 1;
    const last = parts[parts.length - 1];
    if (last && last.changed === changed) last.text += text;
    else parts.push({ text, changed });
  });
  return parts;
}

/** Splits both sides of a changed row into the parts that differ and the parts they share. */
function markParts(left: Cell, right: Cell, options: CompareOptions) {
  const { granularity } = options;
  if (granularity === "line" || left.text.length > INLINE_LIMIT || right.text.length > INLINE_LIMIT) return;
  const leftTokens = tokenize(left.text, granularity, options.ignoreWhitespace);
  const rightTokens = tokenize(right.text, granularity, options.ignoreWhitespace);
  const key = (token: string) => tokenKey(token, options);
  const { removed, added } = diffSequences(...intern(leftTokens.map(key), rightTokens.map(key)));
  left.parts = joinParts(leftTokens, removed);
  right.parts = joinParts(rightTokens, added);
}

export function compareTexts(original: string, modified: string, options: CompareOptions): CompareResult {
  const left = splitLines(original);
  const right = splitLines(modified);
  if (left.length > MAX_LINES || original.length > MAX_LENGTH) return { ok: false, reason: "too-large", side: "original" };
  if (right.length > MAX_LINES || modified.length > MAX_LENGTH) return { ok: false, reason: "too-large", side: "modified" };
  const key = (line: string) => keyOf(line, options);
  const { removed, added } = diffSequences(...intern(left.map(key), right.map(key)));

  const rows: Row[] = [];
  const hunks: Hunk[] = [];
  const stats: CompareStats = { added: 0, removed: 0, changed: 0 };
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if ((i < left.length && removed[i]) || (j < right.length && added[j])) {
      const start = rows.length;
      const leftStart = i;
      const rightStart = j;
      while (i < left.length && removed[i]) i++;
      while (j < right.length && added[j]) j++;
      for (let k = 0; k < Math.max(i - leftStart, j - rightStart); k++) {
        const leftCell: Cell | undefined = leftStart + k < i ? { line: leftStart + k + 1, text: left[leftStart + k]! } : undefined;
        const rightCell: Cell | undefined = rightStart + k < j ? { line: rightStart + k + 1, text: right[rightStart + k]! } : undefined;
        const kind = leftCell && rightCell ? "changed" : leftCell ? "removed" : "added";
        if (leftCell && rightCell) markParts(leftCell, rightCell, options);
        rows.push({ kind, left: leftCell, right: rightCell });
        stats[kind]++;
      }
      hunks.push({ start, end: rows.length });
      continue;
    }
    rows.push({ kind: "equal", left: { line: i + 1, text: left[i]! }, right: { line: j + 1, text: right[j]! } });
    i++;
    j++;
  }
  return { ok: true, rows, hunks, stats };
}

/** A hunk range of a unified diff: the first line and the count, or the line before when the count is 0. */
function range(before: number, count: number): string {
  if (count === 1) return String(before + 1);
  return `${count === 0 ? before : before + 1},${count}`;
}

/** The rows as a unified diff (as `diff -u` writes it), with `context` equal lines around each change; empty if none. */
export function unifiedDiff(rows: Row[], names: Record<Side, string>, context = 3): string {
  const windows: [number, number][] = [];
  rows.forEach((row, i) => {
    if (row.kind === "equal") return;
    const [from, to] = [Math.max(0, i - context), Math.min(rows.length, i + 1 + context)];
    const last = windows[windows.length - 1];
    if (last && from <= last[1]) last[1] = to;
    else windows.push([from, to]);
  });
  if (windows.length === 0) return "";

  const out = [`--- ${names.original}`, `+++ ${names.modified}`];
  const lines = (slice: Row[], side: "left" | "right") => slice.filter((row) => row[side]).length;
  let done = 0;
  let leftBefore = 0;
  let rightBefore = 0;
  for (const [from, to] of windows) {
    const skipped = rows.slice(done, from);
    leftBefore += lines(skipped, "left");
    rightBefore += lines(skipped, "right");
    const slice = rows.slice(from, to);
    out.push(`@@ -${range(leftBefore, lines(slice, "left"))} +${range(rightBefore, lines(slice, "right"))} @@`);
    leftBefore += lines(slice, "left");
    rightBefore += lines(slice, "right");
    done = to;
    // Within a run of changes, the removed lines come first, then the added ones.
    let removed: string[] = [];
    let added: string[] = [];
    const flush = () => {
      out.push(...removed, ...added);
      removed = [];
      added = [];
    };
    for (const row of slice) {
      if (row.kind === "equal") {
        flush();
        out.push(` ${row.left!.text}`);
        continue;
      }
      if (row.left) removed.push(`-${row.left.text}`);
      if (row.right) added.push(`+${row.right.text}`);
    }
    flush();
  }
  return out.join("\n") + "\n";
}
