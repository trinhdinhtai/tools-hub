/** Password: a random password with chosen character groups. Passphrase: words from a wordlist. */
export const MODES = ["password", "passphrase"] as const;
export type Mode = (typeof MODES)[number];
