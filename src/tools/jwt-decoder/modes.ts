/** Decode: read a token and verify its signature. Sign: make a test token with your own key. */
export const MODES = ["decode", "sign"] as const;
export type Mode = (typeof MODES)[number];
