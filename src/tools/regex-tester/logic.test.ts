import { describe, expect, it } from "vitest";
import { compileRegex, findMatches, replaceMatches } from "./logic";

function regex(pattern: string, flags = "") {
  const compiled = compileRegex(pattern, flags);
  if (!compiled.ok) throw new Error(compiled.error.detail);
  return compiled.regex;
}

/** Each match as [start, end, text]. */
const spans = (pattern: string, flags: string, text: string) =>
  findMatches(regex(pattern, flags), text).matches.map((m) => [m.start, m.end, m.text]);

describe("findMatches", () => {
  it("finds every match with the g flag, and only the first without it", () => {
    expect(spans("o+", "g", "foo boo")).toEqual([
      [1, 3, "oo"],
      [5, 7, "oo"],
    ]);
    expect(spans("o+", "", "foo boo")).toEqual([[1, 3, "oo"]]);
  });

  it("finds nothing when nothing matches", () => {
    expect(findMatches(regex("z", "g"), "abc")).toEqual({ matches: [], truncated: false });
  });

  it("gives each group its number, name and position, or null when it took no part", () => {
    const [match] = findMatches(regex("(?<year>\\d{4})-(\\d{2})(x)?"), "on 2026-11").matches;
    expect(match!.groups).toEqual([
      { number: 1, name: "year", span: { start: 3, end: 7, text: "2026" } },
      { number: 2, span: { start: 8, end: 10, text: "11" } },
      { number: 3, span: null },
    ]);
  });

  it("numbers groups as the engine does, skipping parens that capture nothing", () => {
    const [match] = findMatches(regex("[(\\]](?<=\\])\\((?:x)(?<n>a)(?!z)(b)"), "](xab").matches;
    expect(match!.groups).toEqual([
      { number: 1, name: "n", span: { start: 3, end: 4, text: "a" } },
      { number: 2, span: { start: 4, end: 5, text: "b" } },
    ]);
  });

  it("steps past empty matches instead of looping", () => {
    expect(spans("a*", "g", "baa")).toEqual([
      [0, 0, ""],
      [1, 3, "aa"],
      [3, 3, ""],
    ]);
    expect(spans("a*", "g", "")).toEqual([[0, 0, ""]]);
  });

  it("counts in UTF-16 units and steps over whole code points with the u flag", () => {
    expect(spans(".", "gu", "😀é")).toEqual([
      [0, 2, "😀"],
      [2, 3, "é"],
    ]);
    expect(spans("", "gu", "😀")).toEqual([
      [0, 0, ""],
      [2, 2, ""],
    ]);
    expect(spans("tiếng", "gi", "TIẾNG Việt")).toEqual([[0, 5, "TIẾNG"]]);
  });

  it("matches only where the last match ended with the y flag", () => {
    expect(spans("a", "y", "ba")).toEqual([]);
    expect(spans("a", "gy", "aaba")).toEqual([
      [0, 1, "a"],
      [1, 2, "a"],
    ]);
  });

  it("stops at the limit on large text and says it did", () => {
    const text = "ab".repeat(200_000);
    const found = findMatches(regex("b", "g"), text, 1000);
    expect(found.matches).toHaveLength(1000);
    expect(found.matches.at(-1)).toMatchObject({ start: 1999, end: 2000 });
    expect(found.truncated).toBe(true);
    expect(findMatches(regex("b", "g"), "ab".repeat(1000), 1000).truncated).toBe(false);
  });
});

describe("compileRegex", () => {
  it("compiles a valid pattern with its flags", () => {
    const compiled = compileRegex("a+b", "gi");
    expect(compiled.ok && compiled.regex.test("xAAB")).toBe(true);
  });

  it.each([
    ["(abc", "unterminated-group"],
    ["abc)", "unmatched-paren"],
    ["*a", "nothing-to-repeat"],
    ["[abc", "unterminated-class"],
    ["[z-a]", "range-out-of-order"],
    ["a\\", "trailing-backslash"],
    ["a{2,1}", "quantifier-out-of-order"],
    ["(?<n>a)(?<n>b)", "duplicate-group-name"],
    ["(?<1>a)", "invalid-group-name"],
    ["(?z:a)", "invalid-group"],
  ])("explains why %j is not a valid pattern", (pattern, reason) => {
    expect(compileRegex(pattern, "")).toMatchObject({ ok: false, error: { reason } });
  });

  it.each([
    ["\\k<x>", "invalid-named-reference"],
    ["\\q", "invalid-escape"],
    ["\\p{Foo}", "invalid-property"],
  ])("explains why %j is not a valid pattern with the u flag", (pattern, reason) => {
    expect(compileRegex(pattern, "u")).toMatchObject({ ok: false, error: { reason } });
  });

  it("falls back to the engine's own words when no reason fits", () => {
    expect(compileRegex("(?=a)*", "u")).toEqual({ ok: false, error: { reason: "invalid-pattern", detail: "Invalid quantifier" } });
  });
});

describe("replaceMatches", () => {
  it("replaces every match with the g flag, and only the first without it", () => {
    expect(replaceMatches(regex("o", "g"), "foo", "0")).toBe("f00");
    expect(replaceMatches(regex("o"), "foo", "0")).toBe("f0o");
  });

  it("reads $1, $<name>, $& and $$ in the replacement", () => {
    expect(replaceMatches(regex("(?<y>\\d{4})-(\\d{2})", "g"), "2026-11", "$2/$<y> [$&] $$")).toBe("11/2026 [2026-11] $");
  });

  it("keeps Unicode and replaces empty matches between code points", () => {
    expect(replaceMatches(regex("", "gu"), "😀é", "|")).toBe("|😀|é|");
    expect(replaceMatches(regex("việt", "gi"), "Tiếng VIỆT", "Nam")).toBe("Tiếng Nam");
  });

  it("gives the text back unchanged when nothing matches, and handles empty text", () => {
    expect(replaceMatches(regex("z", "g"), "abc", "x")).toBe("abc");
    expect(replaceMatches(regex("^", "g"), "", "x")).toBe("x");
  });

  it("gives the same result for a sticky pattern however often it runs", () => {
    const sticky = regex("a", "y");
    expect(replaceMatches(sticky, "aa", "b")).toBe("ba");
    expect(replaceMatches(sticky, "aa", "b")).toBe("ba");
  });
});
