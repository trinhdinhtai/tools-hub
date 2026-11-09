/**
 * WCAG 2.x contrast for the Color Palette Tool: the ratio between a text color and its background, the levels it
 * passes, and the nearest text color that reaches a level. Pure, no DOM (ADR-0003).
 */
import { BLACK, WHITE, clamp, mix, toLinear, toOklab, type Color } from "./logic";

/** `top` laid over `bottom` by its alpha; the result is as opaque as `bottom`. */
function over(top: Color, bottom: Color): Color {
  const a = top.alpha;
  return {
    r: clamp(top.r) * a + clamp(bottom.r) * (1 - a),
    g: clamp(top.g) * a + clamp(bottom.g) * (1 - a),
    b: clamp(top.b) * a + clamp(bottom.b) * (1 - a),
    alpha: bottom.alpha,
  };
}

/** WCAG relative luminance of an opaque color, clipped to sRGB. */
function luminance({ r, g, b }: Color): number {
  return 0.2126 * toLinear(clamp(r)) + 0.7152 * toLinear(clamp(g)) + 0.0722 * toLinear(clamp(b));
}

/**
 * The WCAG 2.x contrast ratio, 1 to 21, of `text` on `background`. A translucent background is laid over white first
 * (as a page would show it), then a translucent text color over that background.
 */
export function contrastRatio(text: Color, background: Color): number {
  const bg = over(background, WHITE);
  const [a, b] = [luminance(over(text, bg)), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A ratio as WCAG writes it, `4.54:1`, cut to two decimals so a ratio just under a threshold never reads as on it. */
export function formatRatio(ratio: number): string {
  return `${Math.floor(ratio * 100 + 1e-9) / 100}:1`;
}

/**
 * The WCAG 2.x success criteria a contrast ratio is measured against: 1.4.3 (AA) and 1.4.6 (AAA) for normal and large
 * text (18pt, or 14pt bold), and 1.4.11 for UI components and graphics.
 */
export const CONTRAST_LEVELS = [
  { id: "aa-normal", min: 4.5 },
  { id: "aa-large", min: 3 },
  { id: "aaa-normal", min: 7 },
  { id: "aaa-large", min: 4.5 },
  { id: "non-text", min: 3 },
] as const;

export type ContrastLevel = (typeof CONTRAST_LEVELS)[number]["id"];

export interface ContrastCheck {
  id: ContrastLevel;
  min: number;
  pass: boolean;
}

/** Each level and whether the ratio reaches it; a ratio exactly on a threshold passes. */
export function contrastChecks(ratio: number): ContrastCheck[] {
  return CONTRAST_LEVELS.map(({ id, min }) => ({ id, min, pass: ratio >= min }));
}

/** A color as its hex code holds it: every channel and the alpha on a step of 1/255. */
const toBytes = (color: Color): Color => {
  const byte = (c: number) => Math.round(clamp(c) * 255) / 255;
  return { r: byte(color.r), g: byte(color.g), b: byte(color.b), alpha: byte(color.alpha) };
};

/** The color least far from `text` toward `end` whose hex reaches `min` on `background`, or null when even `end` does not. */
function reachToward(text: Color, end: Color, background: Color, min: number): Color | null {
  const at = (t: number) => toBytes(mix(text, end, t));
  const reaches = (t: number) => contrastRatio(at(t), background) >= min;
  if (!reaches(1)) return null;
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (reaches(t)) hi = t;
    else lo = t;
  }
  return at(hi);
}

/**
 * The text color nearest `text` (in OKLab) that reaches `min` on `background`: `text` moved toward black or white,
 * hue kept as far as it can be, alpha kept. `text` itself when it already reaches `min`; null when neither way can.
 */
export function suggestText(text: Color, background: Color, min: number): Color | null {
  if (contrastRatio(text, background) >= min) return text;
  const from = toOklab(text);
  const distance = (color: Color) => {
    const to = toOklab(color);
    return Math.hypot(to.L - from.L, to.a - from.a, to.b - from.b);
  };
  const found = [reachToward(text, BLACK, background, min), reachToward(text, WHITE, background, min)].filter(
    (color): color is Color => color !== null,
  );
  return found.sort((x, y) => distance(x) - distance(y))[0] ?? null;
}
