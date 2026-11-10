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

/**
 * How alike two lines must be, from 0 to 1, to show as one changed line rather than a removed and an added one: half
 * their character pairs in common. Below it, two sentences on unrelated topics would pair on common letters alone.
 */
const PAIR_THRESHOLD = 0.5;

/** Characters at the start of a line that tell how alike it is to another; enough to judge, and bounded. */
const LIKENESS_PREFIX = 1_000;

/** Line pairs scored in one block at most, which bounds the memory of the scoring table. */
const BLOCK_PAIRS = 1_000_000;

/**
 * Work spent scoring line pairs in all, counted in character pairs looked up. Past it, the blocks left pair in order,
 * still only where the two lines are alike, so long lines or big blocks cannot make a comparison slow.
 */
const PAIRING_WORK = 30_000_000;

/** The scoring work left for a comparison, shared by its blocks. */
interface PairingBudget {
  work: number;
}

/**
 * What a line is likened by: its neighbouring character pairs, counted, with its start and end marked so that a short
 * line still has a few. Case and whitespace are left out: they never make two lines less alike.
 */
interface Likeness {
  counts: Map<string, number>;
  size: number;
}

function likeness(text: string): Likeness {
  const folded = Array.from(text.replace(/\s+/g, "").toLowerCase().slice(0, LIKENESS_PREFIX));
  const chars = ["\u0002", ...folded, "\u0003"];
  const pieces = chars.slice(1).map((char, i) => chars[i] + char);
  const counts = new Map<string, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return { counts, size: pieces.length };
}

/** How alike two lines are, from 0 (nothing shared) to 1 (the same but for case and spacing): a Dice coefficient. */
function similarity(a: Likeness, b: Likeness): number {
  const [small, large] = a.counts.size <= b.counts.size ? [a, b] : [b, a];
  let shared = 0;
  for (const [piece, count] of small.counts) shared += Math.min(count, large.counts.get(piece) ?? 0);
  return (2 * shared) / (a.size + b.size);
}

const pairs = (a: Likeness, b: Likeness) => similarity(a, b) >= PAIR_THRESHOLD;

/** A row of a block of changes: the index of its removed line, of its added line, or of both when they pair. */
type Pairing = [removed: number | undefined, added: number | undefined];

/** The rows in order, with each run of lone lines between two pairs put removed first, then added. */
function loneRemovedFirst(rows: Pairing[]): Pairing[] {
  const ordered: Pairing[] = [];
  let lone: Pairing[] = [];
  const flush = () => {
    ordered.push(...lone.filter(([removed]) => removed !== undefined), ...lone.filter(([removed]) => removed === undefined));
    lone = [];
  };
  for (const row of rows) {
    if (row[0] !== undefined && row[1] !== undefined) {
      flush();
      ordered.push(row);
    } else lone.push(row);
  }
  flush();
  return ordered;
}

/** Pairs the k-th removed line with the k-th added one, where the two are alike; the cheap way, for big blocks. */
function pairInOrder(removed: Likeness[], added: Likeness[]): Pairing[] {
  const rows: Pairing[] = [];
  for (let k = 0; k < Math.max(removed.length, added.length); k++) {
    const [r, a] = [removed[k], added[k]];
    if (r && a && pairs(r, a)) rows.push([k, k]);
    else {
      if (r) rows.push([k, undefined]);
      if (a) rows.push([undefined, k]);
    }
  }
  return rows;
}

const SKIP_REMOVED = 0;
const SKIP_ADDED = 1;
const PAIR = 2;

/**
 * Pairs the removed lines of a block with its added lines so that the pairs are as alike as can be, keeping the order
 * of each side; a line alike to none stays alone. Between two pairs, lone removed lines come before lone added ones.
 */
function pairBlock(removedLines: string[], addedLines: string[], budget: PairingBudget): Pairing[] {
  const removed = removedLines.map(likeness);
  const added = addedLines.map(likeness);
  const distinct = (side: Likeness[]) => side.reduce((sum, line) => sum + line.counts.size, 0);
  // Each score looks up the distinct pairs of the smaller line, so this bounds the work of scoring every pair.
  const work = Math.min(distinct(removed) * added.length, distinct(added) * removed.length);
  if (removed.length * added.length > BLOCK_PAIRS || work > budget.work) {
    return loneRemovedFirst(pairInOrder(removed, added));
  }
  budget.work -= work;

  const width = added.length + 1;
  // score[i][j]: the most likeness the first i removed and j added lines can pair up; move: the step that got it.
  const score = new Float64Array((removed.length + 1) * width);
  const move = new Uint8Array((removed.length + 1) * width);
  for (let j = 1; j < width; j++) move[j] = SKIP_ADDED;
  for (let i = 1; i <= removed.length; i++) {
    for (let j = 0; j < width; j++) {
      const at = i * width + j;
      let best = score[at - width]!;
      let step = SKIP_REMOVED;
      if (j > 0) {
        if (score[at - 1]! > best) {
          best = score[at - 1]!;
          step = SKIP_ADDED;
        }
        const alike = similarity(removed[i - 1]!, added[j - 1]!);
        if (alike >= PAIR_THRESHOLD && score[at - width - 1]! + alike >= best) {
          best = score[at - width - 1]! + alike;
          step = PAIR;
        }
      }
      score[at] = best;
      move[at] = step;
    }
  }

  const backwards: Pairing[] = [];
  for (let i = removed.length, j = added.length; i > 0 || j > 0; ) {
    const step = move[i * width + j];
    if (step === PAIR) backwards.push([--i, --j]);
    else if (step === SKIP_ADDED) backwards.push([undefined, --j]);
    else backwards.push([--i, undefined]);
  }
  return loneRemovedFirst(backwards.reverse());
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
  const budget: PairingBudget = { work: PAIRING_WORK };
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if ((i < left.length && removed[i]) || (j < right.length && added[j])) {
      const start = rows.length;
      const leftStart = i;
      const rightStart = j;
      while (i < left.length && removed[i]) i++;
      while (j < right.length && added[j]) j++;
      for (const [removedAt, addedAt] of pairBlock(left.slice(leftStart, i), right.slice(rightStart, j), budget)) {
        const leftCell: Cell | undefined =
          removedAt === undefined ? undefined : { line: leftStart + removedAt + 1, text: left[leftStart + removedAt]! };
        const rightCell: Cell | undefined =
          addedAt === undefined ? undefined : { line: rightStart + addedAt + 1, text: right[rightStart + addedAt]! };
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
