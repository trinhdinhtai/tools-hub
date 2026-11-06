/** Text: JSON as formatted or minified text. Tree: JSON as a tree whose objects and arrays open and close. */
export const MODES = ["text", "tree"] as const;
export type Mode = (typeof MODES)[number];
