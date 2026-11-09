import { describe, expect, it } from "vitest";
import { VISION_KINDS, simulateVision, type VisionKind } from "./color-vision";
import { formatColor, parseColor } from "./logic";

const seen = (text: string, kind: VisionKind) => formatColor(simulateVision(parseColor(text), kind), "hex");

describe("simulateVision", () => {
  // Worked by hand: Machado, Oliveira & Fernandes (2009) at full severity, in linear sRGB.
  it.each([
    ["#ff0000", "protanopia", "#6d5f00"],
    ["#ff0000", "deuteranopia", "#a39000"],
    ["#0000ff", "tritanopia", "#006b96"],
    ["#ff0000", "achromatopsia", "#7f7f7f"],
  ] as const)("shows %s as %s sees it", (color, kind, expected) => {
    expect(seen(color, kind)).toBe(expected);
  });

  it.each(VISION_KINDS)("leaves greys as they are for %s", (kind) => {
    for (const grey of ["#000000", "#808080", "#ffffff"]) expect(seen(grey, kind)).toBe(grey);
  });

  it("keeps the alpha", () => {
    expect(seen("rgb(255 0 0 / 0.5)", "protanopia")).toBe("#6d5f0080");
  });

  it("makes red and green alike for red–green color blindness, but not for blue–yellow", () => {
    const gap = (kind: VisionKind) => {
      const [a, b] = [simulateVision(parseColor("#e53935"), kind), simulateVision(parseColor("#43a047"), kind)];
      return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    };
    expect(gap("deuteranopia")).toBeLessThan(gap("tritanopia") / 2);
    expect(gap("protanopia")).toBeLessThan(gap("tritanopia") / 2);
  });
});
