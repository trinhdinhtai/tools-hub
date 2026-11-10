import { describe, expect, it } from "vitest";
import { compareTexts, diffSequences, MAX_LENGTH, MAX_LINES, unifiedDiff, type CompareOptions, type Row } from "./logic";

const LINE: CompareOptions = { ignoreWhitespace: false, ignoreCase: false, granularity: "line" };

/** A row as `-left | +right`, with `=` for an equal line and `.` for an empty side. */
function show(row: Row): string {
  const side = (cell: Row["left"], sign: string) => (cell ? `${sign}${cell.text}` : ".");
  if (row.kind === "equal") return `=${row.left!.text}`;
  return `${side(row.left, "-")} | ${side(row.right, "+")}`;
}

function compare(original: string, modified: string, options: Partial<CompareOptions> = {}) {
  const result = compareTexts(original, modified, { ...LINE, ...options });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const rows = (original: string, modified: string, options: Partial<CompareOptions> = {}) =>
  compare(original, modified, options).rows.map(show);

/** A text of `count` lines, line `i` (from 0) made by `make`. */
const lines = (count: number, make: (i: number) => string) => Array.from({ length: count }, (_, i) => make(i)).join("\n");

/** The line numbers 1 to `count`. */
const numbers = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

describe("compareTexts by line", () => {
  it("finds no change between equal texts", () => {
    expect(compare("a\nb\nc", "a\nb\nc")).toMatchObject({ hunks: [], stats: { added: 0, removed: 0, changed: 0 } });
    expect(rows("a\nb\nc", "a\nb\nc")).toEqual(["=a", "=b", "=c"]);
  });

  it("aligns added and removed lines with an empty side", () => {
    expect(rows("a\nb\nc", "a\nc\nd")).toEqual(["=a", "-b | .", "=c", ". | +d"]);
  });

  it("pairs removed and added lines of one block on the same rows", () => {
    expect(rows("a\nb\nc\nz", "a\nB\nC\nD\nz")).toEqual(["=a", "-b | +B", "-c | +C", ". | +D", "=z"]);
    expect(compare("a\nb\nc\nz", "a\nB\nC\nD\nz")).toMatchObject({
      hunks: [{ start: 1, end: 4 }],
      stats: { added: 1, removed: 0, changed: 2 },
    });
  });

  it("numbers the lines of each side", () => {
    expect(compare("x\na", "a\ny").rows.map((row) => [row.left?.line, row.right?.line])).toEqual([
      [1, undefined],
      [2, 1],
      [undefined, 2],
    ]);
  });
});

describe("compareTexts pairing within a block of changes", () => {
  it("pairs each line with the most alike line of the other side, keeping the order of both", () => {
    const original = [
      "Sửa lỗi:",
      "- Sửa lỗi khi dán   văn bản dài",
      "- Cải thiện tốc độ khởi động",
      "Liên hệ: support@example.com",
      "Cảm ơn bạn đã dùng Tools Hub 👍🏽",
    ].join("\n");
    const modified = [
      "Sửa lỗi:",
      "- Sửa lỗi khi dán văn bản dài",
      "Liên hệ: help@example.com",
      "Cảm ơn bạn đã dùng Tools Hub 👍🏿",
    ].join("\n");
    expect(rows(original, modified)).toEqual([
      "=Sửa lỗi:",
      "-- Sửa lỗi khi dán   văn bản dài | +- Sửa lỗi khi dán văn bản dài",
      "-- Cải thiện tốc độ khởi động | .",
      "-Liên hệ: support@example.com | +Liên hệ: help@example.com",
      "-Cảm ơn bạn đã dùng Tools Hub 👍🏽 | +Cảm ơn bạn đã dùng Tools Hub 👍🏿",
    ]);
    expect(compare(original, modified).stats).toEqual({ added: 0, removed: 1, changed: 3 });
  });

  it("does not pair lines that have little in common", () => {
    expect(rows("keep\nalpha beta\nkeep", "keep\n12345\nkeep")).toEqual(["=keep", "-alpha beta | .", ". | +12345", "=keep"]);
    expect(compare("alpha beta", "12345").stats).toEqual({ added: 1, removed: 1, changed: 0 });
  });

  it("pairs lines that differ only in whitespace or case, even when those differences count", () => {
    expect(rows("x\nHello  World\ny", "x\nhello world\ny")).toEqual(["=x", "-Hello  World | +hello world", "=y"]);
  });

  it("lists an unpaired removed line before an unpaired added one between two pairs", () => {
    expect(rows("one apple\ngone line\ntwo apples", "one apple!\nfresh text\ntwo apples!")).toEqual([
      "-one apple | +one apple!",
      "-gone line | .",
      ". | +fresh text",
      "-two apples | +two apples!",
    ]);
  });

  it("does not pair sentences that only share common letters", () => {
    const original = "The quarterly report shows that revenue increased across all regions this year.";
    const modified = "Please remember to water the plants on the balcony before leaving tonight.";
    expect(compare(original, modified).stats).toEqual({ added: 1, removed: 1, changed: 0 });
  });

  it("pairs lines in other scripts by likeness too", () => {
    expect(rows("x\n日本語のテキストです\ny", "x\n日本語の文章です\ny")).toEqual([
      "=x",
      "-日本語のテキストです | +日本語の文章です",
      "=y",
    ]);
  });

  it("shows a block of only removed, or only added, lines one per row", () => {
    expect(rows("a\nb\nc\nd", "a\nd")).toEqual(["=a", "-b | .", "-c | .", "=d"]);
    expect(rows("a\nd", "a\nb\nc\nd")).toEqual(["=a", ". | +b", ". | +c", "=d"]);
  });

  it("pairs a block of hundreds of lines by likeness quickly", () => {
    const started = performance.now();
    const result = compare(lines(900, (i) => `old entry number ${i}`), lines(900, (i) => `new entry number ${i}`));
    expect(performance.now() - started).toBeLessThan(3000);
    expect(result.stats).toEqual({ added: 0, removed: 0, changed: 900 });
    expect(result.rows.every((row) => row.left!.line === row.right!.line)).toBe(true);
  });

  it("stays quick on a block of long lines", () => {
    // Varied lines of 800 letters, from a fixed seed so the test is repeatable.
    let seed = 42;
    const letter = () => String.fromCharCode(97 + ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % 26));
    const long = () => Array.from({ length: 800 }, letter).join("");
    const started = performance.now();
    const result = compare(lines(1000, long), lines(1000, long));
    expect(performance.now() - started).toBeLessThan(3000);
    expect(result.rows.filter((row) => row.left).length).toBe(1000);
  });

  it("still leaves unalike lines unpaired in a block too big to score, showing every line once", () => {
    const original = lines(3000, (i) => `alpha ${i}`);
    const modified = lines(3000, (i) => (i % 2 ? `alpha ${i} edited` : `${i * 7} zzz`));
    const started = performance.now();
    const result = compare(original, modified);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(result.stats).toEqual({ added: 1500, removed: 1500, changed: 1500 });
    expect(result.rows.filter((row) => row.left).map((row) => row.left!.line)).toEqual(numbers(3000));
    expect(result.rows.filter((row) => row.right).map((row) => row.right!.line)).toEqual(numbers(3000));
  });
});

describe("compareTexts options and edge cases", () => {
  it("ignores the amount of whitespace when asked, showing each side as written", () => {
    expect(rows("a  b\n\tc", "a b\nc ")).toEqual(["-a  b | +a b", "-\tc | +c "]);
    expect(rows("a  b\n\tc", "a b\nc ", { ignoreWhitespace: true })).toEqual(["=a  b", "=\tc"]);
    expect(compare("ab", "a b", { ignoreWhitespace: true }).stats.changed).toBe(1);
  });

  it("ignores letter case when asked, Unicode letters included", () => {
    expect(rows("Hello\nĐÀ NẴNG", "hello\nđà nẵng", { ignoreCase: true })).toEqual(["=Hello", "=ĐÀ NẴNG"]);
    expect(compare("Hello", "hello").stats.changed).toBe(1);
  });

  it("treats CRLF, CR and LF alike, and a final line break as no extra line", () => {
    expect(rows("a\r\nb\r\n", "a\nb")).toEqual(["=a", "=b"]);
    expect(rows("a\rb", "a\nb\n")).toEqual(["=a", "=b"]);
  });

  it("keeps blank lines as lines", () => {
    expect(rows("a\n\nb", "a\nb")).toEqual(["=a", "- | .", "=b"]);
  });

  it("compares against an empty side", () => {
    expect(rows("", "")).toEqual([]);
    expect(rows("", "x\ny")).toEqual([". | +x", ". | +y"]);
    expect(compare("x", "").stats).toEqual({ added: 0, removed: 1, changed: 0 });
  });
});

describe("compareTexts within a changed line", () => {
  /** The parts of each side of the first changed row, changed ones in brackets. */
  function marked(original: string, modified: string, options: Partial<CompareOptions>) {
    const row = compare(original, modified, options).rows.find((r) => r.kind === "changed")!;
    const show = (cell: Row["left"]) => cell!.parts?.map((p) => (p.changed ? `[${p.text}]` : p.text)).join("");
    return [show(row.left), show(row.right)];
  }

  it("marks the words that changed", () => {
    expect(marked("the quick brown fox", "the slow brown fox", { granularity: "word" })).toEqual([
      "the [quick] brown fox",
      "the [slow] brown fox",
    ]);
    expect(marked("Xin chào thế giới", "Xin chào thế gian", { granularity: "word" })).toEqual([
      "Xin chào thế [giới]",
      "Xin chào thế [gian]",
    ]);
  });

  it("marks the characters that changed, never splitting a character the user sees", () => {
    expect(marked("color", "colour", { granularity: "char" })).toEqual(["color", "colo[u]r"]);
    expect(marked("ok 👍🏽", "ok 👍🏿", { granularity: "char" })).toEqual(["ok [👍🏽]", "ok [👍🏿]"]);
    expect(marked("Việt", "Viet", { granularity: "char" })).toEqual(["Vi[ệ]t", "Vi[e]t"]);
  });

  it("follows the ignore options inside the line", () => {
    expect(marked("A  b x", "a b y", { granularity: "word", ignoreWhitespace: true, ignoreCase: true })).toEqual([
      "A  b [x]",
      "a b [y]",
    ]);
  });

  it("marks nothing inside the line by line, or on a line too long to mark", () => {
    expect(marked("alpha beta", "alpha gamma", { granularity: "line" })).toEqual([undefined, undefined]);
    const long = "x".repeat(20_000);
    expect(marked(long, long + "y", { granularity: "char" })).toEqual([undefined, undefined]);
  });
});

describe("compareTexts on large Input", () => {
  it("compares thousands of lines with scattered changes quickly", () => {
    const original = lines(5000, (i) => `line ${i}`);
    const modified = lines(5000, (i) => (i % 100 === 0 ? `line ${i} edited` : `line ${i}`));
    const started = performance.now();
    const result = compare(original, modified, { granularity: "word" });
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.stats).toEqual({ added: 0, removed: 0, changed: 50 });
    expect(result.hunks).toHaveLength(50);
  });

  it("gives up looking for the shortest script when two big texts share little, and still shows every line", () => {
    const original = lines(20_000, (i) => `a${i}`);
    const modified = lines(20_000, (i) => `a${19_999 - i}`);
    const started = performance.now();
    const result = compare(original, modified);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(result.rows.filter((row) => row.left).length).toBe(20_000);
    expect(result.rows.filter((row) => row.right).length).toBe(20_000);
  });

  it("refuses a side with more lines than it can compare", () => {
    const result = compareTexts("a", "x\n".repeat(MAX_LINES + 1), LINE);
    expect(result).toEqual({ ok: false, reason: "too-large", side: "modified" });
  });

  it("refuses a side longer than it can compare, even on one line", () => {
    const result = compareTexts("x".repeat(MAX_LENGTH + 1), "a", LINE);
    expect(result).toEqual({ ok: false, reason: "too-large", side: "original" });
    expect(compareTexts("x".repeat(MAX_LENGTH), "a", LINE).ok).toBe(true);
  });
});

describe("unifiedDiff", () => {
  const names = { original: "a.txt", modified: "b.txt" };
  const diff = (original: string, modified: string) => unifiedDiff(compare(original, modified).rows, names);

  it("writes the changes with three lines of context, removed lines before added ones", () => {
    const numbers = (count: number) => Array.from({ length: count }, (_, i) => String(i + 1));
    const original = numbers(15).join("\n");
    const modified = numbers(16).map((line) => (line === "4" ? "four" : line)).join("\n");
    expect(diff(original, modified)).toBe(
      [
        "--- a.txt",
        "+++ b.txt",
        "@@ -1,7 +1,7 @@",
        " 1",
        " 2",
        " 3",
        "-4",
        "+four",
        " 5",
        " 6",
        " 7",
        "@@ -13,3 +13,4 @@",
        " 13",
        " 14",
        " 15",
        "+16",
        "",
      ].join("\n"),
    );
  });

  it("joins changes that are close together into one hunk, and numbers an empty side from the line before", () => {
    expect(diff("a\nb\nc", "a\nB\nc\nd")).toBe("--- a.txt\n+++ b.txt\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n c\n+d\n");
    expect(diff("", "x")).toBe("--- a.txt\n+++ b.txt\n@@ -0,0 +1 @@\n+x\n");
  });

  it("is empty when nothing changed", () => {
    expect(diff("same", "same")).toBe("");
  });
});

describe("diffSequences", () => {
  const edits = (a: string, b: string) => {
    const codes = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
    const { removed, added } = diffSequences(codes(a), codes(b));
    const kept = (marks: Uint8Array, text: string) => [...text].filter((_, i) => !marks[i]).join("");
    const count = (marks: Uint8Array) => marks.reduce((n, mark) => n + mark, 0);
    return { distance: count(removed) + count(added), left: kept(removed, a), right: kept(added, b) };
  };

  it("finds a shortest edit script (the example of Myers' paper)", () => {
    const { distance, left, right } = edits("ABCABBA", "CBABAC");
    expect(distance).toBe(5);
    expect(left).toBe(right);
  });

  it("handles sequences with nothing in common, or nothing at all", () => {
    expect(edits("abc", "xyz").distance).toBe(6);
    expect(edits("", "xyz").distance).toBe(3);
    expect(edits("", "").distance).toBe(0);
  });
});
