// .env and .properties hold one string per key. A nested config goes in as one key per leaf, its path joined in the
// format's own way, and comes back out nested again.

/** Where a leaf is: object keys are strings, array indices are numbers. */
export type Path = (string | number)[];

export interface FlatEntry {
  /** The key as written in the file. */
  key: string;
  /** The key split into its path, e.g. `db.hosts[0]` → `["db", "hosts", "0"]`. */
  path: string[];
  value: string;
}

/** Every leaf, depth first, as a string: null becomes "". Empty objects and arrays have no leaf, so they are left out. */
export function flatten(value: unknown, path: Path = []): [Path, string][] {
  if (Array.isArray(value)) return value.flatMap((item, i) => flatten(item, [...path, i]));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => flatten(item, [...path, key]));
  }
  return [[path, value === null || value === undefined ? "" : String(value)]];
}

type Tree = Map<string, Tree | string>;

/** Arrays come back for objects whose keys are exactly 0, 1, 2…; objects are built with own keys, `__proto__` too. */
function toValue(node: Tree | string): unknown {
  if (typeof node === "string") return node;
  const keys = [...node.keys()];
  if (keys.length > 0 && keys.every((key, i) => key === String(i))) return [...node.values()].map(toValue);
  return Object.fromEntries([...node].map(([key, child]) => [key, toValue(child)]));
}

/**
 * Nests the entries by their paths, a later entry winning over an earlier one with the same key. If they cannot
 * nest (`db=x` next to `db.host=y`, or an empty part in a path), every key stays as written instead.
 */
export function unflatten(entries: FlatEntry[]): Record<string, unknown> {
  const root: Tree = new Map();
  const flat = () => Object.fromEntries(entries.map(({ key, value }) => [key, value]));
  for (const { path, value } of entries) {
    if (path.some((part) => part === "")) return flat();
    let node = root;
    for (const part of path.slice(0, -1)) {
      const child = node.get(part) ?? new Map();
      if (typeof child === "string") return flat();
      node.set(part, child);
      node = child;
    }
    const last = path.at(-1)!;
    if (node.get(last) instanceof Map) return flat();
    node.set(last, value);
  }
  // The top stays a table, even for keys 0, 1, 2…
  return Object.fromEntries([...root].map(([key, child]) => [key, toValue(child)]));
}
