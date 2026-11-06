import { decodedKey, sortedEntries, type JsonNode } from "./logic";

export type ValueType = "object" | "array" | "string" | "number" | "boolean" | "null";

export interface TreeChild {
  /** The decoded key of an object member, or the index of an array item. */
  key: string | number;
  node: JsonNode;
  /** A one-line summary: a scalar as written, or a container's size, as in {2} or [3]. */
  label: string;
}

export function valueType(node: JsonNode): ValueType {
  if (node.kind !== "scalar") return node.kind;
  const c = node.raw[0];
  if (c === '"') return "string";
  if (c === "t" || c === "f") return "boolean";
  if (c === "n") return "null";
  return "number";
}

/** An object or array with at least one member: a row that opens. */
export function hasChildren(node: JsonNode): boolean {
  return node.kind === "object" ? node.entries.length > 0 : node.kind === "array" && node.items.length > 0;
}

export function nodeLabel(node: JsonNode): string {
  if (node.kind === "object") return node.entries.length ? `{${node.entries.length}}` : "{}";
  if (node.kind === "array") return node.items.length ? `[${node.items.length}]` : "[]";
  return node.raw;
}

/** The members of an object or the items of an array, in the order written or by key; none for a scalar. */
export function treeChildren(node: JsonNode, { sortKeys = false } = {}): TreeChild[] {
  if (node.kind === "object") return (sortKeys ? sortedEntries(node.entries) : node.entries).map(([key, value]) => ({ key: decodedKey(key), node: value, label: nodeLabel(value) }));
  if (node.kind === "array") return node.items.map((value, index) => ({ key: index, node: value, label: nodeLabel(value) }));
  return [];
}
