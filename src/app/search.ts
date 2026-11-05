/** What the command palette searches for one Tool: its names and aliases in every language. */
export interface SearchEntry {
  id: string;
  names: readonly string[];
  aliases: readonly string[];
}

/** Lowercase, without Vietnamese (or any other) diacritics: "Mã hoá" and "ma hoa" both become "ma hoa". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().trim();
}

/** How well one text matches every word of the query: 2 if each starts a word of it, 1 if each is inside it, else 0. */
function matchText(text: string, words: readonly string[]): number {
  const normalized = normalize(text);
  if (!words.every((word) => normalized.includes(word))) return 0;
  const starts = normalized.split(/[^\p{L}\p{N}]+/u);
  return words.every((word) => starts.some((start) => start.startsWith(word))) ? 2 : 1;
}

function score(entry: SearchEntry, words: readonly string[]): number {
  const best = (texts: readonly string[]) => Math.max(0, ...texts.map((text) => matchText(text, words)));
  const name = best(entry.names);
  // A name match always ranks above an alias match.
  return name > 0 ? name + 2 : best(entry.aliases);
}

/**
 * Ids of the Tools matching the query, best first: names before aliases, word starts before the inside of words.
 * Matching ignores case and diacritics, and the words of the query may come in any order. An empty query lists
 * every Tool in the given order; so do ties.
 */
export function searchTools(query: string, entries: readonly SearchEntry[]): string[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries.map((entry) => entry.id);
  return entries
    .map((entry, index) => ({ id: entry.id, index, score: score(entry, words) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((match) => match.id);
}
