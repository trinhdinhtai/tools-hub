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
    expect(marked("a b", "a c", { granularity: "line" })).toEqual([undefined, undefined]);
    const long = "x".repeat(20_000);
    expect(marked(long, long + "y", { granularity: "char" })).toEqual([undefined, undefined]);
  });
});

describe("compareTexts on large Input", () => {
  const lines = (count: number, make: (i: number) => string) => Array.from({ length: count }, (_, i) => make(i)).join("\n");

  it("compares thousands of lines with scattered changes quickly", () => {
    const original = lines(5000, (i) => `line ${i}`);
    const modified = lines(5000, (i) => (i % 100 === 0 ? `edited ${i}` : `line ${i}`));
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
