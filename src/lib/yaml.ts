import { Document, isNode, isScalar, parseAllDocuments, visit } from "yaml";
import { position, type Position } from "./position";

/** One value per document of a YAML stream, or where it is not valid YAML, if that can be told. */
export type YamlResult = { ok: true; docs: unknown[] } | { ok: false; at?: Position };

class InvalidYaml extends Error {
  constructor(readonly at?: Position) {
    super("invalid YAML");
  }
}

/** A key twice in one map is not YAML. The library checks it too, but in quadratic time: large maps took seconds. */
function checkUniqueKeys(doc: Document.Parsed, text: string) {
  visit(doc, {
    Map(_, map) {
      const seen = new Set<unknown>();
      for (const { key } of map.items) {
        const id = isScalar(key) ? key.value : String(key);
        if (seen.has(id)) throw new InvalidYaml(position(text, (isNode(key) && key.range?.[0]) || 0));
        seen.add(id);
      }
    },
  });
}

/** Whether a value holds itself, as an alias inside its own anchor makes it do. JSON cannot hold that. */
function isCircular(value: unknown, ancestors = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null) return false;
  if (ancestors.has(value)) return true;
  ancestors.add(value);
  const circular = Object.values(value).some((child) => isCircular(child, ancestors));
  ancestors.delete(value);
  return circular;
}

function readDocument(doc: Document.Parsed, text: string): unknown {
  const [error] = doc.errors;
  if (error) {
    const at = error.linePos?.[0];
    throw new InvalidYaml(at && { line: at.line, column: at.col });
  }
  checkUniqueKeys(doc, text);
  let value: unknown;
  try {
    value = doc.toJS(); // throws when aliases would expand past the library's limit (a "billion laughs")
  } catch {
    throw new InvalidYaml();
  }
  if (isCircular(value)) throw new InvalidYaml();
  return value;
}

/**
 * Reads a YAML stream into plain JSON values, one per document. Refuses a key twice in a map, and aliases that refer
 * to themselves or expand without end.
 */
export function readYaml(text: string): YamlResult {
  const docs = parseAllDocuments(text, { uniqueKeys: false });
  // A `---` at the end, or two in a row, leaves an empty document that is not part of the stream's content.
  const isEmpty = (doc: Document.Parsed) => doc.contents === null || (isScalar(doc.contents) && doc.contents.source === "");
  const kept = docs.length > 1 ? docs.filter((doc) => !isEmpty(doc)) : docs;
  try {
    return { ok: true, docs: kept.map((doc) => readDocument(doc, text)) };
  } catch (error) {
    if (!(error instanceof InvalidYaml)) throw error;
    return error.at ? { ok: false, at: error.at } : { ok: false };
  }
}
