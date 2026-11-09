/**
 * Pure color logic for the Color Palette Tool: reading a CSS color, writing it in every format, shades, harmonies and
 * their export as CSS variables or JSON. No DOM, no store (ADR-0003).
 *
 * A color is held as gamma-encoded sRGB channels that may fall outside 0–1, so a color outside sRGB (from `oklch()` or
 * `lab()`) keeps its exact value in OKLCH; the formats that cannot reach it clip it.
 */
import { NAMED_COLORS } from "./named-colors";

/** sRGB channels, 0–1 inside the gamut, and alpha 0–1. */
export interface Color {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export const COLOR_FORMATS = ["hex", "rgb", "hsl", "hwb", "oklch", "hsv"] as const;
export type ColorFormat = (typeof COLOR_FORMATS)[number];

/** `unsupported`: a color CSS has but this Tool does not read, such as `color()`, `color-mix()` or a relative color. */
export type ColorErrorReason = "empty" | "unknown" | "syntax" | "unsupported";

export class ColorError extends Error {
  constructor(readonly reason: ColorErrorReason) {
    super(`Invalid color: ${reason}`);
    this.name = "ColorError";
  }
}

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const mod360 = (h: number) => ((h % 360) + 360) % 360;

/** `n` rounded to `digits` decimals, trailing zeros dropped, never `-0`. */
function num(n: number, digits: number): string {
  const rounded = Number(n.toFixed(digits));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

const pct = (n: number, digits = 1) => `${num(n * 100, digits)}%`;

/** A hue in degrees; one that rounds to 360 is written 0. */
function deg(h: number, digits: number): string {
  const text = num(h, digits);
  return text === "360" ? "0" : text;
}

// ---------------------------------------------------------------------------------------------------------------------
// Color spaces

const toLinear = (c: number) => {
  const abs = Math.abs(c);
  return abs <= 0.04045 ? c / 12.92 : Math.sign(c) * ((abs + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => {
  const abs = Math.abs(c);
  return abs <= 0.0031308 ? c * 12.92 : Math.sign(c) * (1.055 * abs ** (1 / 2.4) - 0.055);
};

interface Oklab {
  L: number;
  a: number;
  b: number;
}

/** OKLab of a color, after Björn Ottosson's matrices. */
function toOklab({ r, g, b }: Color): Oklab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function fromOklab({ L, a, b }: Oklab, alpha: number): Color {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha,
  };
}

function toOklch(color: Color): { L: number; C: number; H: number } {
  const { L, a, b } = toOklab(color);
  const C = Math.hypot(a, b);
  return { L, C, H: C < 1e-4 ? 0 : mod360((Math.atan2(b, a) * 180) / Math.PI) };
}

function fromOklch(L: number, C: number, H: number, alpha: number): Color {
  const rad = (H * Math.PI) / 180;
  return fromOklab({ L, a: C * Math.cos(rad), b: C * Math.sin(rad) }, alpha);
}

/** CIE Lab (D50, as CSS has it) to sRGB, through XYZ and the Bradford adaptation to D65 (CSS Color 4 matrices). */
function fromLab(L: number, a: number, b: number, alpha: number): Color {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const x = (fx ** 3 > epsilon ? fx ** 3 : (116 * fx - 16) / kappa) * 0.9642956764295677;
  const y = L > kappa * epsilon ? fy ** 3 : L / kappa;
  const z = (fz ** 3 > epsilon ? fz ** 3 : (116 * fz - 16) / kappa) * 0.8251046025104602;
  const X = 0.955473421488075 * x - 0.02309845494876471 * y + 0.06325924320057072 * z;
  const Y = -0.0283697093338637 * x + 1.0099953980813041 * y + 0.021041441191917323 * z;
  const Z = 0.012314014864481998 * x - 0.020507649298898964 * y + 1.330365926242124 * z;
  return {
    r: fromLinear(3.2409699419045226 * X - 1.537383177570094 * Y - 0.4986107602930034 * Z),
    g: fromLinear(-0.9692436362808796 * X + 1.8759675015077202 * Y + 0.04155505740717559 * Z),
    b: fromLinear(0.05563007969699366 * X - 0.20397695888897652 * Y + 1.0569715142428786 * Z),
    alpha,
  };
}

function fromHsl(h: number, s: number, l: number, alpha: number): Color {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0), g: f(8), b: f(4), alpha };
}

function fromHsv(h: number, s: number, v: number, alpha: number): Color {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5), g: f(3), b: f(1), alpha };
}

/** Hue (degrees), the largest and the smallest channel of a color clipped to sRGB. */
function hueParts(color: Color) {
  const [r, g, b] = [clamp(color.r), clamp(color.g), clamp(color.b)];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: mod360(h * 60), max, min };
}

function toHsl(color: Color) {
  const { h, max, min } = hueParts(color);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function toHsv(color: Color) {
  const { h, max, min } = hueParts(color);
  return { h, s: max === 0 ? 0 : (max - min) / max, v: max };
}

/** Whether the color lies inside sRGB, so every format writes it exactly. */
export function isInGamut({ r, g, b }: Color): boolean {
  const tolerance = 1e-4;
  return [r, g, b].every((c) => c >= -tolerance && c <= 1 + tolerance);
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const FUNCTION = /^([a-z-]+)\((.*)\)$/s;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/;
const ANGLE_UNITS: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
/** Color functions CSS has that this Tool does not read. */
const UNSUPPORTED = new Set(["color", "color-mix", "device-cmyk", "light-dark", "contrast-color"]);

function parseHex(digits: string): Color {
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join("") : digits;
  const byte = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
  return { r: byte(0), g: byte(1), b: byte(2), alpha: full.length === 8 ? byte(3) : 1 };
}

type ArgKind = "number" | "percent" | "angle";

/** One argument: a number, a percentage or an angle in degrees, and which it was. `none` reads as 0. */
function parseArg(token: string): { value: number; kind: ArgKind } {
  if (token === "none") return { value: 0, kind: "number" };
  const match = NUMBER.exec(token);
  if (!match) throw new ColorError("syntax");
  const value = Number(match[0]);
  const unit = token.slice(match[0].length);
  if (unit === "") return { value, kind: "number" };
  if (unit === "%") return { value, kind: "percent" };
  const degrees = ANGLE_UNITS[unit];
  if (degrees !== undefined) return { value: value * degrees, kind: "angle" };
  throw new ColorError("syntax");
}

/** The three channel arguments and the alpha, in comma syntax (`1, 2, 3, 0.5`) or space syntax (`1 2 3 / 0.5`). */
function splitArgs(body: string): { channels: string[]; alpha: string | null } {
  const trimmed = body.trim();
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map((part) => part.trim());
    if (parts.length < 3 || parts.length > 4 || parts.some((part) => part === "" || /\s/.test(part))) {
      throw new ColorError("syntax");
    }
    return { channels: parts.slice(0, 3), alpha: parts[3] ?? null };
  }
  const slash = trimmed.split("/");
  if (slash.length > 2) throw new ColorError("syntax");
  const channels = slash[0]!.trim().split(/\s+/);
  const alpha = slash.length === 2 ? slash[1]!.trim() : null;
  if (channels.length !== 3 || alpha === "") throw new ColorError("syntax");
  return { channels, alpha };
}

/** A plain number as it is, or a percentage of `hundredPercent` (255 for an RGB channel, 0.4 for OKLCH chroma). */
function amount(token: string, hundredPercent: number): number {
  const { value, kind } = parseArg(token);
  if (kind === "angle") throw new ColorError("syntax");
  return kind === "percent" ? (value / 100) * hundredPercent : value;
}

/** A hue in degrees: a number or an angle, never a percentage. */
function hue(token: string): number {
  const { value, kind } = parseArg(token);
  if (kind === "percent") throw new ColorError("syntax");
  return mod360(value);
}

/** A color function's arguments read as a color, clamped where CSS clamps them. */
function parseFunction(name: string, body: string): Color {
  if (UNSUPPORTED.has(name)) throw new ColorError("unsupported");
  if (/^\s*from\s/.test(body)) throw new ColorError("unsupported");
  const { channels, alpha: alphaToken } = splitArgs(body);
  const [c1, c2, c3] = channels as [string, string, string];
  const alpha = alphaToken === null ? 1 : clamp(amount(alphaToken, 1));
  switch (name) {
    case "rgb":
    case "rgba":
      return { r: clamp(amount(c1, 255) / 255), g: clamp(amount(c2, 255) / 255), b: clamp(amount(c3, 255) / 255), alpha };
    case "hsl":
    case "hsla":
      return fromHsl(hue(c1), clamp(amount(c2, 100) / 100), clamp(amount(c3, 100) / 100), alpha);
    case "hsv":
      return fromHsv(hue(c1), clamp(amount(c2, 100) / 100), clamp(amount(c3, 100) / 100), alpha);
    case "hwb": {
      let [w, bk] = [clamp(amount(c2, 100) / 100), clamp(amount(c3, 100) / 100)];
      if (w + bk >= 1) [w, bk] = [w / (w + bk), bk / (w + bk)];
      // HWB is HSV with V = 1 − B and S = 1 − W / V.
      const v = 1 - bk;
      return fromHsv(hue(c1), v === 0 ? 0 : 1 - w / v, v, alpha);
    }
    case "oklab":
      return fromOklab({ L: clamp(amount(c1, 1)), a: amount(c2, 0.4), b: amount(c3, 0.4) }, alpha);
    case "oklch":
      return fromOklch(clamp(amount(c1, 1)), Math.max(0, amount(c2, 0.4)), hue(c3), alpha);
    case "lab":
      return fromLab(clamp(amount(c1, 100), 0, 100), amount(c2, 125), amount(c3, 125), alpha);
    case "lch": {
      const C = Math.max(0, amount(c2, 150));
      const rad = (hue(c3) * Math.PI) / 180;
      return fromLab(clamp(amount(c1, 100), 0, 100), C * Math.cos(rad), C * Math.sin(rad), alpha);
    }
    default:
      throw new ColorError("unknown");
  }
}

/**
 * Reads a CSS color: hex, a named color, `transparent`, or `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`,
 * `oklch()` in comma or space syntax, plus `hsv()`. Anything else throws a `ColorError` whose `reason` the UI
 * translates.
 */
export function parseColor(text: string): Color {
  const source = text.trim().toLowerCase();
  if (source === "") throw new ColorError("empty");
  const hex = HEX.exec(source);
  if (hex) return parseHex(hex[1]!);
  if (source === "transparent") return { r: 0, g: 0, b: 0, alpha: 0 };
  const named = NAMED_COLORS.get(source);
  if (named) return parseHex(named);
  const fn = FUNCTION.exec(source);
  if (fn) return parseFunction(fn[1]!, fn[2]!);
  throw new ColorError("unknown");
}

// ---------------------------------------------------------------------------------------------------------------------
// Writing

const byte = (c: number) => Math.round(clamp(c) * 255);
const hex2 = (c: number) => byte(c).toString(16).padStart(2, "0");

/** ` / 0.5` when the color is not opaque, nothing when its alpha rounds to 1. */
function alphaPart(alpha: number): string {
  const text = num(alpha, 3);
  return text === "1" ? "" : ` / ${text}`;
}

/**
 * Writes a color in one format: HEX (`#rrggbb`, `#rrggbbaa` with alpha), RGB, HSL, HWB and OKLCH in modern CSS syntax,
 * and HSV, which CSS has no function for, in the same shape. Every format but OKLCH clips a color outside sRGB.
 */
export function formatColor(color: Color, format: ColorFormat): string {
  const a = alphaPart(color.alpha);
  switch (format) {
    case "hex":
      return `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}${byte(color.alpha) < 255 ? hex2(color.alpha) : ""}`;
    case "rgb":
      return `rgb(${byte(color.r)} ${byte(color.g)} ${byte(color.b)}${a})`;
    case "hsl": {
      const { h, s, l } = toHsl(color);
      return `hsl(${deg(h, 1)} ${pct(s)} ${pct(l)}${a})`;
    }
    case "hwb": {
      const { h, s, v } = toHsv(color);
      return `hwb(${deg(h, 1)} ${pct((1 - s) * v)} ${pct(1 - v)}${a})`;
    }
    case "oklch": {
      const { L, C, H } = toOklch(color);
      return `oklch(${pct(L, 2)} ${num(C, 4)} ${deg(H, 2)}${a})`;
    }
    case "hsv": {
      const { h, s, v } = toHsv(color);
      return `hsv(${deg(h, 1)} ${pct(s)} ${pct(v)}${a})`;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Palettes

/** A color clipped into sRGB, so every format writes it the same. */
const clip = (color: Color): Color => ({ r: clamp(color.r), g: clamp(color.g), b: clamp(color.b), alpha: color.alpha });

/** `color` moved `t` (0–1) of the way to `target` in OKLab, where equal steps look equal. Alpha stays the color's. */
function mix(color: Color, target: Color, t: number): Color {
  const [from, to] = [toOklab(color), toOklab(target)];
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return clip(fromOklab({ L: lerp(from.L, to.L), a: lerp(from.a, to.a), b: lerp(from.b, to.b) }, color.alpha));
}

const WHITE: Color = { r: 1, g: 1, b: 1, alpha: 1 };
const BLACK: Color = { r: 0, g: 0, b: 0, alpha: 1 };

/** How far each step moves toward white (below 500) or black (above 500). */
const SHADE_STEPS: readonly [step: number, toward: Color, t: number][] = [
  [50, WHITE, 0.95],
  [100, WHITE, 0.88],
  [200, WHITE, 0.74],
  [300, WHITE, 0.56],
  [400, WHITE, 0.3],
  [500, WHITE, 0],
  [600, BLACK, 0.14],
  [700, BLACK, 0.28],
  [800, BLACK, 0.42],
  [900, BLACK, 0.54],
  [950, BLACK, 0.68],
];

export interface Shade {
  step: number;
  color: Color;
}

/** A scale of eleven shades named like Tailwind's, 50 (lightest) to 950 (darkest), with the color itself at 500. */
export function shades(color: Color): Shade[] {
  return SHADE_STEPS.map(([step, toward, t]) => ({ step, color: t === 0 ? color : mix(color, toward, t) }));
}

/** Hue turns of each harmony, in degrees around the color wheel; 0 is the color itself. */
const HARMONY_TURNS = {
  complementary: [0, 180],
  analogous: [-30, 0, 30],
  triadic: [0, 120, 240],
  "split-complementary": [0, 150, 210],
  tetradic: [0, 90, 180, 270],
} as const satisfies Record<string, readonly number[]>;

export type Harmony = keyof typeof HARMONY_TURNS;
export const HARMONIES = Object.keys(HARMONY_TURNS) as Harmony[];

/** The colors of a harmony: the color's hue turned on the HSL wheel, saturation, lightness and alpha kept. */
export function harmony(color: Color, kind: Harmony): Color[] {
  const { h, s, l } = toHsl(color);
  return HARMONY_TURNS[kind].map((turn) => (turn === 0 ? color : fromHsl(mod360(h + turn), s, l, color.alpha)));
}

/** A color with the name it is exported under, such as a shade's step. */
export interface NamedColor {
  name: string;
  color: Color;
}

export const EXPORT_KINDS = ["css", "json"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportOptions {
  format: ColorFormat;
  as: ExportKind;
  /** The variable name before each color's name; anything that is not a letter, digit, `-` or `_` becomes `-`. */
  prefix: string;
}

/** `prefix` as a CSS name: lowercase, letters, digits, `-` and `_` only, `color` when nothing is left. */
function cssName(prefix: string): string {
  const name = prefix
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return name || "color";
}

/**
 * A palette as text to paste into a project: CSS custom properties under `:root` (`--prefix-name: value;`), or a JSON
 * object `{ prefix: { name: value } }`, every color written in one format.
 */
export function exportPalette(entries: readonly NamedColor[], options: ExportOptions): string {
  const prefix = cssName(options.prefix);
  const values = entries.map(({ name, color }) => [name, formatColor(color, options.format)] as const);
  if (options.as === "json") return JSON.stringify({ [prefix]: Object.fromEntries(values) }, null, 2) + "\n";
  return `:root {\n${values.map(([name, value]) => `  --${prefix}-${name}: ${value};\n`).join("")}}\n`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Paste Detection

/** Longer than any color anyone pastes; longer text is never one. */
const PASTE_MAX = 100;

/**
 * Paste Detection score for a pasted text: high for hex and color functions, low for a bare color name (`tan`,
 * `orange` are words too), 0 for anything this Tool cannot read.
 */
export function detectPaste(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length > PASTE_MAX || trimmed.includes("\n")) return 0;
  try {
    parseColor(trimmed);
  } catch {
    return 0;
  }
  return /^[a-z]+$/i.test(trimmed) ? 0.3 : 0.9;
}
