/** Nano: Nano IDs. Hex: lowercase hex tokens. Base64url: URL-safe Base64 tokens. Custom: a user-given alphabet. */
export const MODES = ["nano", "hex", "base64url", "custom"] as const;
export type Mode = (typeof MODES)[number];
