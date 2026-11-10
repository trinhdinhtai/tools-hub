// Picks values out of parsed JSON with a path such as $.users[0].name. The syntax is the common core of JSONPath:
// an optional $ for the root, .name or ["name"] for a key, [0] for an index (negative counts from the end), and * or
// [*] for every member. A path with a wildcard collects its matches into an array.

import { attemptError } from "@/lib/attempt";
import { decodedKey, type JsonNode } from "./logic";

export type QueryError =
  /** `column` is 1-based, in characters, in the path as typed. */
  | { reason: "invalid-path"; column: number }
  /** `path` is the path up to the step that found nothing. */
  | { reason: "not-found"; path: string };

export type QueryResult = { ok: true; node: JsonNode } | { ok: false; error: QueryError };

type Step = { type: "key"; key: string } | { type: "index"; index: number } | { type: "all" };

class PathError extends Error {
  constructor(readonly offset: number) {
    super("invalid path");
  }
}

const SPACE = /\s/;
const NAME_END = /[.[\]\s]/;

/** The steps of a path, each with the offset in the path just after it. */
function steps(path: string, start: number, end: number): [Step, number][] {
  let p = start;
  const fail = (at = p): never => {
    throw new PathError(at);
  };
  const name = () => {
    const from = p;
    while (p < end && !NAME_END.test(path[p]!)) p++;
    if (p === from) fail();
    return path.slice(from, p);
  };

  const result: [Step, number][] = [];
  if (path[p] === "$" && (p + 1 === end || path[p + 1] === "." || path[p + 1] === "[")) p++;
  else if (p < end && path[p] !== "." && path[p] !== "[") result.push([{ type: "key", key: name() }, p]);

  while (p < end) {
    const c = path[p];
    if (c === ".") {
      p++;
      if (path[p] === "*") {
        p++;
        result.push([{ type: "all" }, p]);
      } else result.push([{ type: "key", key: name() }, p]);
    } else if (c === "[") {
      p++;
      let step: Step;
      const q = path[p];
      if (q === "*") {
        p++;
        step = { type: "all" };
      } else if (q === '"' || q === "'") {
        const from = p++;
        let key = "";
        for (;;) {
          if (p >= end) fail(from);
          const ch = path[p]!;
          if (ch === q) break;
          if (ch === "\\" && p + 1 < end) p++;
          key += path[p++];
        }
        p++;
        step = { type: "key", key };
      } else {
        const match = /^-?\d+/.exec(path.slice(p, end));
        if (!match) fail();
        p += match![0].length;
        step = { type: "index", index: Number(match![0]) };
      }
      if (path[p] !== "]") fail();
      p++;
      result.push([step, p]);
    } else fail();
  }
  return result;
}

function column(path: string, offset: number): number {
  return [...path.slice(0, offset)].length + 1;
}

function children(node: JsonNode, step: Step): JsonNode[] {
  if (step.type === "all") {
    if (node.kind === "object") return node.entries.map(([, value]) => value);
    return node.kind === "array" ? node.items : [];
  }
  if (node.kind === "object") {
    if (step.type !== "key") return [];
    // The last of duplicate keys wins, as with JSON.parse.
    for (let i = node.entries.length - 1; i >= 0; i--) {
      const [key, value] = node.entries[i]!;
      if (decodedKey(key) === step.key) return [value];
    }
    return [];
  }
  if (node.kind === "array") {
    const index = step.type === "index" ? step.index : /^\d+$/.test(step.key) ? Number(step.key) : NaN;
    const item = node.items[index < 0 ? node.items.length + index : index];
    return item ? [item] : [];
  }
  return [];
}

/** The value at a path in parsed JSON; an empty path or $ is the whole document. */
export function queryJson(root: JsonNode, path: string): QueryResult {
  let start = 0;
  let end = path.length;
  while (start < end && SPACE.test(path[start]!)) start++;
  while (end > start && SPACE.test(path[end - 1]!)) end--;

  const { value: parsed, error } = attemptError(() => steps(path, start, end), PathError);
  if (error) return { ok: false, error: { reason: "invalid-path", column: column(path, error.offset) } };

  let nodes = [root];
  let wildcard = false;
  for (const [step, offset] of parsed) {
    wildcard ||= step.type === "all";
    nodes = nodes.flatMap((node) => children(node, step));
    if (!wildcard && nodes.length === 0) return { ok: false, error: { reason: "not-found", path: path.slice(start, offset) } };
  }
  return { ok: true, node: wildcard ? { kind: "array", items: nodes } : nodes[0]! };
}
