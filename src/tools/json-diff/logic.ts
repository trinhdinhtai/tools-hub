import { readJson } from "@/lib/json";
import { readYaml } from "@/lib/yaml";

export interface CompareOptions {
  /** A key whose value names array items, e.g. `id`: items are then matched by it, not by place. Empty for none. */
  arrayKey: string;
}

/** A difference at one path, written as JSONPath, e.g. `$.servers[0].port`. */
export type Change =
  | { kind: "added"; path: string; after: unknown }
  | { kind: "removed"; path: string; before: unknown }
  | { kind: "changed"; path: string; before: unknown; after: unknown };

/** A JSON Patch (RFC 6902) operation; paths are JSON Pointers (RFC 6901). */
export type PatchOperation =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string };

export type Side = "original" | "modified";

export type DocumentError =
  | { side: Side; reason: "empty" }
  /** Not valid JSON or YAML; where, if the parser could tell. Both are 1-based, the column in characters. */
  | { side: Side; reason: "invalid"; line?: number; column?: number }
  /** Nested deeper than `MAX_DEPTH` levels. */
  | { side: Side; reason: "too-deep" };

/** Arrays and objects nested deeper than this are refused: comparing them would run out of stack. */
export const MAX_DEPTH = 1000;

export type CompareResult =
  | { ok: true; changes: Change[]; patch: PatchOperation[] }
  /** One error for each document that cannot be read. */
  | { ok: false; errors: DocumentError[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Where a value is: as JSONPath, to show, and as a JSON Pointer, for the patch. */
interface At {
  path: string;
  pointer: string;
}

const ROOT: At = { path: "$", pointer: "" };
/** A key JSONPath can write after a dot; any other goes in brackets, quoted. */
const NAME = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;
const atKey = (at: At, key: string): At => ({
  path: NAME.test(key) ? `${at.path}.${key}` : `${at.path}[${JSON.stringify(key)}]`,
  pointer: `${at.pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
});
const atIndex = (at: At, index: number): At => ({ path: `${at.path}[${index}]`, pointer: `${at.pointer}/${index}` });

class Differ {
  readonly changes: Change[] = [];
  readonly patch: PatchOperation[] = [];

  constructor(private readonly arrayKey: string) {}

  compare(before: unknown, after: unknown, at: At) {
    if (isObject(before) && isObject(after)) return this.compareObjects(before, after, at);
    if (Array.isArray(before) && Array.isArray(after)) {
      const keys = this.arrayKey ? [this.keysOf(before), this.keysOf(after)] : [];
      if (keys[0] && keys[1]) return this.compareByKey(before, after, keys[0], keys[1], at);
      return this.compareByIndex(before, after, at);
    }
    if (Object.is(before, after)) return; // YAML's .nan equals itself
    this.changes.push({ kind: "changed", path: at.path, before, after });
    this.patch.push({ op: "replace", path: at.pointer, value: after });
  }

  private compareObjects(before: Record<string, unknown>, after: Record<string, unknown>, at: At) {
    for (const key of Object.keys(before)) {
      if (Object.hasOwn(after, key)) this.compare(before[key], after[key], atKey(at, key));
      else this.remove(before[key], atKey(at, key));
    }
    for (const key of Object.keys(after)) {
      if (!Object.hasOwn(before, key)) this.add(after[key], atKey(at, key));
    }
  }

  /** Item by item; items past the end of the shorter array were added or removed. */
  private compareByIndex(before: unknown[], after: unknown[], at: At) {
    const common = Math.min(before.length, after.length);
    for (let i = 0; i < common; i++) this.compare(before[i], after[i], atIndex(at, i));
    for (let i = common; i < before.length; i++) {
      this.changes.push({ kind: "removed", path: atIndex(at, i).path, before: before[i] });
    }
    // From the end, so that each removal leaves the indexes of those still to come in place.
    for (let i = before.length - 1; i >= common; i--) this.patch.push({ op: "remove", path: atIndex(at, i).pointer });
    for (let i = common; i < after.length; i++) this.add(after[i], atIndex(at, i));
  }

  /** The key of every item, as JSON; undefined unless every item is an object with a key of its own. */
  private keysOf(items: unknown[]): string[] | undefined {
    const keys: string[] = [];
    for (const item of items) {
      if (!isObject(item) || !Object.hasOwn(item, this.arrayKey)) return undefined;
      const key = item[this.arrayKey];
      if (typeof key === "object" && key !== null) return undefined;
      keys.push(JSON.stringify(key));
    }
    return new Set(keys).size === keys.length ? keys : undefined;
  }

  /**
   * Items matched by their key, wherever they are. The patch removes the items that went, then puts the rest in their
   * new order with the new ones among them, and only then changes what changed inside them, at their final indexes.
   */
  private compareByKey(before: unknown[], after: unknown[], beforeKeys: string[], afterKeys: string[], at: At) {
    const afterIndex = new Map(afterKeys.map((key, i) => [key, i]));
    const beforeSet = new Set(beforeKeys);
    const itemPath = (key: string) => `${at.path}[${this.arrayKey}=${key}]`;

    const current = beforeKeys.filter((key) => afterIndex.has(key));
    for (let i = before.length - 1; i >= 0; i--) {
      if (!afterIndex.has(beforeKeys[i]!)) this.patch.push({ op: "remove", path: atIndex(at, i).pointer });
    }
    for (const [j, key] of afterKeys.entries()) {
      if (!beforeSet.has(key)) {
        this.patch.push({ op: "add", path: atIndex(at, j).pointer, value: after[j] });
        current.splice(j, 0, key);
      } else if (current[j] !== key) {
        const from = current.indexOf(key, j);
        this.patch.push({ op: "move", from: atIndex(at, from).pointer, path: atIndex(at, j).pointer });
        current.splice(from, 1);
        current.splice(j, 0, key);
      }
    }

    for (const [i, key] of beforeKeys.entries()) {
      const j = afterIndex.get(key);
      if (j === undefined) this.changes.push({ kind: "removed", path: itemPath(key), before: before[i] });
      else this.compare(before[i], after[j], { path: itemPath(key), pointer: atIndex(at, j).pointer });
    }
    for (const [j, key] of afterKeys.entries()) {
      if (!beforeSet.has(key)) this.changes.push({ kind: "added", path: itemPath(key), after: after[j] });
    }
  }

  private add(value: unknown, at: At) {
    this.changes.push({ kind: "added", path: at.path, after: value });
    this.patch.push({ op: "add", path: at.pointer, value });
  }

  private remove(value: unknown, at: At) {
    this.changes.push({ kind: "removed", path: at.path, before: value });
    this.patch.push({ op: "remove", path: at.pointer });
  }
}

type Read = { ok: true; value: unknown } | { ok: false; error: DocumentError };

/** Whether text is read as JSON: it starts with `{` or `[`. */
export const isJsonText = (text: string) => /^\uFEFF?\s*[{[]/.test(text);

/** Whether arrays and objects nest deeper than `MAX_DEPTH`; without recursion, so it cannot run out of stack. */
function isTooDeep(value: unknown): boolean {
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    if (typeof node !== "object" || node === null) continue;
    if (depth >= MAX_DEPTH) return true;
    for (const child of Object.values(node)) stack.push([child, depth + 1]);
  }
  return false;
}

/**
 * Text that starts with `{` or `[` is JSON, and is read as nothing else, so that a mistake in it is told where it is
 * rather than read as YAML flow style. Any other text is YAML; a stream of several documents is an array of them.
 */
function readDocument(text: string, side: Side): Read {
  if (!text.trim()) return { ok: false, error: { side, reason: "empty" } };
  const read = isJsonText(text) ? readJson(text) : readYaml(text);
  if (!read.ok) return { ok: false, error: { side, reason: "invalid", ...read.at } };
  const value = "value" in read ? read.value : read.docs.length === 1 ? read.docs[0] : read.docs;
  return isTooDeep(value) ? { ok: false, error: { side, reason: "too-deep" } } : { ok: true, value };
}

/** Compares two JSON or YAML documents by value: what changed, by path, and a JSON Patch that makes the change. */
export function compareDocuments(original: string, modified: string, options: CompareOptions): CompareResult {
  const before = readDocument(original, "original");
  const after = readDocument(modified, "modified");
  if (!before.ok || !after.ok) {
    return { ok: false, errors: [before, after].flatMap((read) => (read.ok ? [] : [read.error])) };
  }
  const differ = new Differ(options.arrayKey.trim());
  differ.compare(before.value, after.value, ROOT);
  return { ok: true, changes: differ.changes, patch: differ.patch };
}
