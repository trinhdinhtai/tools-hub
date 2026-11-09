/** What each Mode escapes: HTML entities, backslash string escapes, Unicode `\u` escapes, `\x` hex bytes, Punycode domains. */
export const MODES = ["html", "backslash", "unicode", "hex", "punycode"] as const;
export type Mode = (typeof MODES)[number];
