/** Text: type or paste the expression. Builder: pick each field, with the expression kept in step both ways. */
export const MODES = ["text", "builder"] as const;
export type Mode = (typeof MODES)[number];
