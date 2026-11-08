/** Encode / Decode: percent-encoding of text. Split: a URL taken apart into editable parts. */
export const MODES = ["convert", "split"] as const;
export type Mode = (typeof MODES)[number];
