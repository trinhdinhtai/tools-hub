/** Calculate: one network in detail. Split: its subnets of a longer prefix. Merge: a list folded into the fewest networks. Compare: whether one network holds another. */
export const MODES = ["calculate", "split", "merge", "compare"] as const;
export type Mode = (typeof MODES)[number];
