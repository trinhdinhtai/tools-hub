/**
 * Color vision deficiency simulation for the Color Palette Tool: a color as someone with protanopia, deuteranopia,
 * tritanopia or achromatopsia sees it. Pure, no DOM (ADR-0003).
 */
import { clamp, fromLinear, toLinear, type Color } from "./logic";

type Matrix = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

/**
 * Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model for Simulation of Color Vision Deficiency", at
 * full severity. Each row sums to 1, so greys stay grey. Applied to linear sRGB.
 */
const MACHADO: Record<Exclude<VisionKind, "achromatopsia">, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export const VISION_KINDS = ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"] as const;
export type VisionKind = (typeof VISION_KINDS)[number];

/** The color as someone with `kind` sees it, clipped to sRGB, alpha kept. Achromatopsia keeps only the luminance. */
export function simulateVision(color: Color, kind: VisionKind): Color {
  const [r, g, b] = [toLinear(clamp(color.r)), toLinear(clamp(color.g)), toLinear(clamp(color.b))];
  if (kind === "achromatopsia") {
    const y = fromLinear(0.2126 * r + 0.7152 * g + 0.0722 * b);
    return { r: y, g: y, b: y, alpha: color.alpha };
  }
  const [mr, mg, mb] = MACHADO[kind].map(([x, y, z]) => clamp(fromLinear(clamp(x * r + y * g + z * b))));
  return { r: mr!, g: mg!, b: mb!, alpha: color.alpha };
}
