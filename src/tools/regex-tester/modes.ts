/** Match: the matches of a pattern and their groups. Replace: the text with every match replaced. */
export const MODES = ["match", "replace"] as const;
export type Mode = (typeof MODES)[number];
