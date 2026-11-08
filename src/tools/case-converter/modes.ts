/** Convert: one name per line, shown in every case style at once. Slug: a URL slug per line, diacritics removed. */
export const MODES = ["convert", "slug"] as const;
export type Mode = (typeof MODES)[number];
