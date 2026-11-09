import { describe, expect, it } from "vitest";
import { contrastChecks, contrastRatio, formatRatio, suggestText } from "./contrast";
import { formatColor, parseColor } from "./logic";

const ratio = (fg: string, bg: string) => contrastRatio(parseColor(fg), parseColor(bg));

describe("contrastRatio", () => {
  // Known pairs, worked by hand from the WCAG 2.x formula and cut (never rounded) to two decimals.
  it.each([
    ["#000000", "#ffffff", "21:1"],
    ["#ffffff", "#ffffff", "1:1"],
    ["#767676", "#ffffff", "4.54:1"],
    ["#777777", "#ffffff", "4.47:1"],
    ["#0000ff", "#ffffff", "8.59:1"],
    ["#ff0000", "#ffffff", "3.99:1"],
    ["#3b82f6", "#ffffff", "3.67:1"],
    ["#ffff00", "#000000", "19.55:1"],
  ])("%s on %s is %s", (fg, bg, expected) => {
    expect(formatRatio(ratio(fg, bg))).toBe(expected);
  });

  it("is the same whichever color is the text", () => {
    expect(ratio("#3b82f6", "#111827")).toBeCloseTo(ratio("#111827", "#3b82f6"), 10);
  });

  it("never rounds a ratio up past a threshold", () => {
    // 4.4999… must not read as 4.5, which would pass AA.
    expect(formatRatio(4.4999)).toBe("4.49:1");
  });

  it("lays a translucent text color over the background, and a translucent background over white", () => {
    expect(ratio("rgb(0 0 0 / 0)", "#ffffff")).toBeCloseTo(1, 10);
    expect(ratio("rgb(0 0 0 / 0.5)", "#ffffff")).toBeCloseTo(ratio("#808080", "#ffffff"), 1);
    expect(ratio("#000000", "transparent")).toBeCloseTo(21, 10);
  });

  it("clips a color outside sRGB before measuring it", () => {
    expect(ratio("oklch(100% 0.4 140)", "#000000")).toBeLessThanOrEqual(21);
  });
});

describe("contrastChecks", () => {
  const passed = (fg: string, bg: string) =>
    contrastChecks(ratio(fg, bg))
      .filter((check) => check.pass)
      .map((check) => check.id);

  it("passes every level from 7:1", () => {
    expect(passed("#000000", "#ffffff")).toEqual(["aa-normal", "aa-large", "aaa-normal", "aaa-large", "non-text"]);
  });

  it("passes AA but not AAA for normal text between 4.5:1 and 7:1", () => {
    expect(passed("#767676", "#ffffff")).toEqual(["aa-normal", "aa-large", "aaa-large", "non-text"]);
  });

  it("passes only large text and UI components between 3:1 and 4.5:1", () => {
    expect(passed("#777777", "#ffffff")).toEqual(["aa-large", "non-text"]);
  });

  it("passes nothing under 3:1", () => {
    expect(passed("#aaaaaa", "#ffffff")).toEqual([]);
  });

  it("passes a level at exactly its threshold", () => {
    expect(contrastChecks(4.5).find((check) => check.id === "aa-normal")?.pass).toBe(true);
  });
});

describe("suggestText", () => {
  const suggest = (fg: string, bg: string, min: number) => {
    const color = suggestText(parseColor(fg), parseColor(bg), min);
    return color && formatColor(color, "hex");
  };

  it("darkens a text color on a light background just enough to reach the level, as a hex that still reaches it", () => {
    const hex = suggest("#3b82f6", "#ffffff", 4.5)!;
    expect(ratio(hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex, "#ffffff")).toBeLessThan(4.6);
    // Still a blue: darker, not grey.
    const { r, g, b } = parseColor(hex);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it("lightens a text color on a dark background", () => {
    const hex = suggest("#888888", "#000000", 7)!;
    expect(ratio(hex, "#000000")).toBeGreaterThanOrEqual(7);
    expect(parseColor(hex).r).toBeGreaterThan(parseColor("#888888").r);
  });

  it("goes the nearer way when both ways reach the level", () => {
    // On #777777 both black and white reach 3:1; light grey is nearer white, dark grey nearer black.
    expect(parseColor(suggest("#aaaaaa", "#777777", 3)!).r).toBeGreaterThan(parseColor("#aaaaaa").r);
    expect(parseColor(suggest("#444444", "#777777", 3)!).r).toBeLessThan(parseColor("#444444").r);
  });

  it("keeps a text color that already reaches the level", () => {
    expect(suggest("#000000", "#ffffff", 7)).toBe("#000000");
  });

  it("keeps the text color's alpha", () => {
    const hex = suggest("rgb(59 130 246 / 0.8)", "#ffffff", 4.5)!;
    expect(hex).toMatch(/^#[0-9a-f]{6}cc$/);
    expect(ratio(hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("finds nothing when neither black nor white reaches the level", () => {
    expect(suggest("#777777", "#777777", 7)).toBeNull();
    expect(suggest("rgb(0 0 0 / 0)", "#ffffff", 4.5)).toBeNull();
  });
});
