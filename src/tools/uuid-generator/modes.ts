/** Generate: make UUIDs or ULIDs. Inspect: details of one pasted UUID or ULID. */
export const MODES = ["generate", "inspect"] as const;
export type Mode = (typeof MODES)[number];
