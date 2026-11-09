import { describe, expect, it } from "vitest";
import { COLOR_FORMATS, ColorError, detectPaste, exportPalette, formatColor, isInGamut, parseColor, harmony, shades, type Color, type ColorFormat, type Harmony } from "./logic";

const all = (text: string) => {
  const color = parseColor(text);
  const formats: ColorFormat[] = ["hex", "rgb", "hsl", "hwb", "oklch", "hsv"];
  return Object.fromEntries(formats.map((format) => [format, formatColor(color, format)]));
};

const reason = (text: string) => {
  try {
    parseColor(text);
  } catch (error) {
    if (error instanceof ColorError) return error.reason;
    throw error;
  }
  return null;
};

describe("parseColor and formatColor", () => {
  it("writes one color in every format", () => {
    expect(all("#ff0000")).toEqual({
      hex: "#ff0000",
      rgb: "rgb(255 0 0)",
      hsl: "hsl(0 100% 50%)",
      hwb: "hwb(0 0% 0%)",
      oklch: "oklch(62.8% 0.2577 29.23)",
      hsv: "hsv(0 100% 100%)",
    });
  });
});

describe("parseColor", () => {
  const hex = (text: string) => formatColor(parseColor(text), "hex");

  it.each([
    ["#f00", "#ff0000"],
    ["#F00A", "#ff0000aa"],
    ["#ff000080", "#ff000080"],
    ["rgb(255, 128, 0)", "#ff8000"],
    ["rgba(255,128,0,0.5)", "#ff800080"],
    ["rgb(100% 50% 0% / 50%)", "#ff800080"],
    ["rgb(300 -5 none)", "#ff0000"],
    ["rgb(0 0 0 / 2)", "#000000"],
    ["hsl(120 100% 25%)", "#008000"],
    ["hsla(120deg, 100%, 25%, .5)", "#00800080"],
    ["hsl(0.5turn 100 50)", "#00ffff"],
    ["hsl(-120 100% 50%)", "#0000ff"],
    ["hwb(240 0% 0%)", "#0000ff"],
    ["hwb(0 60% 60%)", "#808080"],
    ["hsv(60 100% 100%)", "#ffff00"],
    ["oklch(62.8% 0.2577 29.23)", "#ff0000"],
    ["oklch(0.628 0.2577 29.23 / 0.5)", "#ff000080"],
    ["oklab(0.628 0.2249 0.1258)", "#ff0000"],
    ["lab(54.29 80.82 69.91)", "#ff0000"],
    ["lch(54.29% 106.84 40.85)", "#ff0000"],
    ["lab(100 0 0)", "#ffffff"],
    ["rebeccapurple", "#663399"],
    ["  RED ", "#ff0000"],
    ["transparent", "#00000000"],
  ])("reads %s", (text, expected) => {
    expect(hex(text)).toBe(expected);
  });

  it("keeps a color outside sRGB exact in OKLCH and clips it elsewhere", () => {
    const color = parseColor("oklch(70% 0.4 150)");
    expect(formatColor(color, "oklch")).toBe("oklch(70% 0.4 150)");
    expect(formatColor(color, "hex")).toMatch(/^#00[0-9a-f]{2}00$/);
    expect(isInGamut(color)).toBe(false);
    expect(isInGamut(parseColor("#123456"))).toBe(true);
  });

  it("writes alpha in every format", () => {
    expect(all("rgb(0 0 255 / 25%)")).toEqual({
      hex: "#0000ff40",
      rgb: "rgb(0 0 255 / 0.25)",
      hsl: "hsl(240 100% 50% / 0.25)",
      hwb: "hwb(240 0% 0% / 0.25)",
      oklch: "oklch(45.2% 0.3132 264.05 / 0.25)",
      hsv: "hsv(240 100% 100% / 0.25)",
    });
  });

  it("drops an alpha that rounds to opaque, and a hue that rounds to a full turn", () => {
    expect(all("rgb(255 0 0 / 0.9999)")).toMatchObject({ hex: "#ff0000", rgb: "rgb(255 0 0)" });
    expect(formatColor(parseColor("hsl(359.99 100% 50%)"), "hsl")).toBe("hsl(0 100% 50%)");
  });

  it.each([
    ["", "empty"],
    ["  \n ", "empty"],
    ["banana", "unknown"],
    ["#ggg", "unknown"],
    ["#12345", "unknown"],
    ["ff0000", "unknown"],
    ["＃fff", "unknown"],
    ["🎨", "unknown"],
    ["rgb(1 2)", "syntax"],
    ["rgb(a b c)", "syntax"],
    ["rgb(1, 2 3)", "syntax"],
    ["hsl(10 20 30 40)", "syntax"],
    ["rgb(２５５ 0 0)", "syntax"],
    ["rgb(1 2 3", "unknown"],
    ["hsl(10px 50% 50%)", "syntax"],
    ["color(srgb 1 0 0)", "unsupported"],
    ["color-mix(in srgb, red, blue)", "unsupported"],
    ["rgb(from red r g b)", "unsupported"],
  ])("refuses %j as %s", (text, expected) => {
    expect(reason(text)).toBe(expected);
  });

  it("refuses very large input quickly", () => {
    const started = performance.now();
    expect(reason("#" + "f".repeat(1_000_000))).toBe("unknown");
    expect(reason("rgb(" + "1 ".repeat(200_000) + ")")).toBe("syntax");
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("round trip", () => {
  it.each(["#3b82f6", "#ff8000", "#000000", "#ffffff", "#7f7f7f", "#12345680", "#663399"])(
    "reads every format of %s back to the same color",
    (text) => {
      const color = parseColor(text);
      for (const format of COLOR_FORMATS) expect(formatColor(parseColor(formatColor(color, format)), "hex")).toBe(text);
    },
  );
});

const lightness = (color: Color) => Number(/^oklch\(([\d.]+)%/.exec(formatColor(color, "oklch"))![1]);

describe("shades", () => {
  it("runs from light to dark in eleven steps with the color itself at 500", () => {
    const steps = shades(parseColor("#3b82f6"));
    expect(steps.map((step) => step.step)).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
    expect(formatColor(steps[5]!.color, "hex")).toBe("#3b82f6");
    const ls = steps.map((step) => lightness(step.color));
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThan(ls[i - 1]!);
    expect(ls[0]).toBeGreaterThan(95);
    expect(ls[10]).toBeLessThan(25);
    for (const { color } of steps) expect(isInGamut(color)).toBe(true);
  });

  it("keeps the alpha and copes with white and black", () => {
    expect(shades(parseColor("#3b82f680")).every(({ color }) => formatColor(color, "hex").endsWith("80"))).toBe(true);
    for (const text of ["white", "black"]) {
      for (const { color } of shades(parseColor(text))) expect(formatColor(color, "hex")).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("harmony", () => {
  const hexes = (kind: Harmony, text = "#ff0000") => harmony(parseColor(text), kind).map((c) => formatColor(c, "hex"));

  it.each([
    ["complementary", ["#ff0000", "#00ffff"]],
    ["analogous", ["#ff0080", "#ff0000", "#ff8000"]],
    ["triadic", ["#ff0000", "#00ff00", "#0000ff"]],
    ["split-complementary", ["#ff0000", "#00ff80", "#0080ff"]],
    ["tetradic", ["#ff0000", "#80ff00", "#00ffff", "#8000ff"]],
  ] as [Harmony, string[]][])("turns the hue for %s", (kind, expected) => {
    expect(hexes(kind)).toEqual(expected);
  });

  it("keeps the alpha, and a gray stays gray", () => {
    expect(hexes("triadic", "#ff000080")).toEqual(["#ff000080", "#00ff0080", "#0000ff80"]);
    expect(hexes("complementary", "#808080")).toEqual(["#808080", "#808080"]);
  });
});

describe("exportPalette", () => {
  const entries = [
    { name: "500", color: parseColor("#ff0000") },
    { name: "600", color: parseColor("rgb(0 0 255 / 50%)") },
  ];

  it("writes CSS custom properties under :root", () => {
    expect(exportPalette(entries, { format: "hex", as: "css", prefix: "brand" })).toBe(
      ":root {\n  --brand-500: #ff0000;\n  --brand-600: #0000ff80;\n}\n",
    );
    expect(exportPalette(entries, { format: "oklch", as: "css", prefix: "brand" })).toBe(
      ":root {\n  --brand-500: oklch(62.8% 0.2577 29.23);\n  --brand-600: oklch(45.2% 0.3132 264.05 / 0.5);\n}\n",
    );
  });

  it("writes a JSON object keyed by name", () => {
    expect(JSON.parse(exportPalette(entries, { format: "rgb", as: "json", prefix: "brand" }))).toEqual({
      brand: { "500": "rgb(255 0 0)", "600": "rgb(0 0 255 / 0.5)" },
    });
  });

  it("makes any prefix a valid CSS name and JSON key", () => {
    const one = [entries[0]!];
    expect(exportPalette(one, { format: "hex", as: "css", prefix: "  Màu chính!" })).toBe(":root {\n  --màu-chính-500: #ff0000;\n}\n");
    expect(exportPalette(one, { format: "hex", as: "css", prefix: "" })).toBe(":root {\n  --color-500: #ff0000;\n}\n");
    expect(JSON.parse(exportPalette(one, { format: "hex", as: "json", prefix: "" }))).toEqual({ color: { "500": "#ff0000" } });
  });
});

describe("detectPaste", () => {
  it.each(["#3b82f6", "#FFF", " rgb(59 130 246) ", "hsl(217 91% 60% / .5)", "oklch(62% 0.19 260)"])("is sure of %j", (text) => {
    expect(detectPaste(text)).toBeGreaterThanOrEqual(0.8);
  });

  it("only half believes a bare color name, which is also a word", () => {
    expect(detectPaste("tomato")).toBeGreaterThan(0);
    expect(detectPaste("tomato")).toBeLessThan(0.5);
  });

  it.each(["", "hello", "#ggg", "ff0000", "#fff\n#000", "color(srgb 1 0 0)", "rgb(1 2)", "#" + "f".repeat(100_000)])(
    "ignores %j",
    (text) => {
      expect(detectPaste(text)).toBe(0);
    },
  );
});
