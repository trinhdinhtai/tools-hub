/** Convert: one number in every base at once, with its two's complement. Expression: an integer expression evaluated. Bits: a bit grid to switch on and off. */
export const MODES = ["convert", "expression", "bits"] as const;
export type Mode = (typeof MODES)[number];
