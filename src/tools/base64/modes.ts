/** Text: text to and from Base64. File: a file to Base64 or a data URI, and back to a file. */
export const MODES = ["text", "file"] as const;
export type Mode = (typeof MODES)[number];
