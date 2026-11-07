/** Text: text to hash. File: a file to hash, however large. */
export const MODES = ["text", "file"] as const;
export type Mode = (typeof MODES)[number];
