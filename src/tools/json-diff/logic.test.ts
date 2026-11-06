import { describe, expect, it } from "vitest";
import { compareDocuments, MAX_DEPTH, type PatchOperation } from "./logic";

/** RFC 6902, as an independent reader of the patch: add, remove, replace and move, with RFC 6901 pointers. */
function applyPatch(document: unknown, patch: PatchOperation[]): unknown {
  let root = structuredClone(document);
  const tokens = (pointer: string) =>
    pointer === "" ? [] : pointer.slice(1).split("/").map((t) => t.replaceAll("~1", "/").replaceAll("~0", "~"));
  const parentOf = (pointer: string): [Record<string, unknown> | unknown[], string] => {
    const path = tokens(pointer);
    const last = path.pop()!;
    let node = root as Record<string, unknown>;
    for (const token of path) node = node[token] as Record<string, unknown>;
    return [node, last];
  };
  const remove = (pointer: string): unknown => {
    const [parent, key] = parentOf(pointer);
    if (Array.isArray(parent)) return parent.splice(Number(key), 1)[0];
    if (!(key in parent)) throw new Error(`nothing at ${pointer}`);
    const value = parent[key];
    delete parent[key];
    return value;
  };
  const add = (pointer: string, value: unknown) => {
    if (pointer === "") return void (root = value);
    const [parent, key] = parentOf(pointer);
    if (Array.isArray(parent)) {
      const index = key === "-" ? parent.length : Number(key);
      if (index > parent.length) throw new Error(`index out of range at ${pointer}`);
      parent.splice(index, 0, value);
    } else parent[key] = value;
  };
  for (const op of patch) {
    if (op.op === "add") add(op.path, structuredClone(op.value));
    else if (op.op === "remove") remove(op.path);
    else if (op.op === "replace") {
      if (op.path !== "") remove(op.path);
      add(op.path, structuredClone(op.value));
    } else add(op.path, remove(op.from));
  }
  return root;
}

function compared(original: string, modified: string, arrayKey = "") {
  const result = compareDocuments(original, modified, { arrayKey });
  if (!result.ok) throw new Error(`not compared: ${JSON.stringify(result.errors)}`);
  return result;
}

/** The patch turns the original into the modified document. */
function expectPatchToWork(original: unknown, modified: unknown, arrayKey = "") {
  const { patch } = compared(JSON.stringify(original), JSON.stringify(modified), arrayKey);
  expect(applyPatch(original, patch)).toEqual(modified);
}

describe("compareDocuments", () => {
  it("lists what was added, removed and changed in an object, by path", () => {
    const { changes, patch } = compared('{"name":"app","port":80,"debug":true}', '{"name":"app","port":8080,"tls":{}}');
    expect(changes).toEqual([
      { kind: "changed", path: "$.port", before: 80, after: 8080 },
      { kind: "removed", path: "$.debug", before: true },
      { kind: "added", path: "$.tls", after: {} },
    ]);
    expect(patch).toEqual([
      { op: "replace", path: "/port", value: 8080 },
      { op: "remove", path: "/debug" },
      { op: "add", path: "/tls", value: {} },
    ]);
  });

  it("compares arrays item by item when no key is given", () => {
    expect(compared("[1, 2, 3]", "[1, 9]").changes).toEqual([
      { kind: "changed", path: "$[1]", before: 2, after: 9 },
      { kind: "removed", path: "$[2]", before: 3 },
    ]);
    expect(compared('{"tags":["a"]}', '{"tags":["a","b","c"]}').patch).toEqual([
      { op: "add", path: "/tags/1", value: "b" },
      { op: "add", path: "/tags/2", value: "c" },
    ]);
  });

  it("makes a patch that turns the original into the modified document", () => {
    expectPatchToWork({ a: [1, 2, 3, 4], b: { c: [{ d: 1 }, { d: 2 }] } }, { a: [1], b: { c: [{ d: 2, e: null }] } });
    expectPatchToWork([0, [1, 2]], [0, [1, 2, 3], 4]);
    expectPatchToWork({ a: [1, 2] }, { a: { 0: 1 } });
    expectPatchToWork({ a: 1 }, [1]);
  });

  it("finds no change between documents that hold the same values, in any key order or layout", () => {
    expect(compared('{"a":1,"b":[true,null]}', '{ "b": [true, null],\n  "a": 1.0 }')).toEqual({ ok: true, changes: [], patch: [] });
  });

  describe("with an array key", () => {
    const before = { users: [{ id: 1, name: "An" }, { id: 2, name: "Bình" }, { id: "x", name: "Chi" }] };
    const after = { users: [{ id: "x", name: "Chi" }, { id: 4, name: "Dũng" }, { id: 1, name: "Anh" }] };

    it("matches items by the key, wherever they are", () => {
      expect(compared(JSON.stringify(before), JSON.stringify(after), "id").changes).toEqual([
        { kind: "changed", path: "$.users[id=1].name", before: "An", after: "Anh" },
        { kind: "removed", path: "$.users[id=2]", before: { id: 2, name: "Bình" } },
        { kind: "added", path: "$.users[id=4]", after: { id: 4, name: "Dũng" } },
      ]);
    });

    it("finds no change when only the order differs, yet the patch keeps the new order", () => {
      const reordered = { users: [...before.users].reverse() };
      expect(compared(JSON.stringify(before), JSON.stringify(reordered), "id").changes).toEqual([]);
      expectPatchToWork(before, reordered, "id");
    });

    it("makes a patch that turns the original into the modified document", () => {
      expectPatchToWork(before, after, "id");
      expectPatchToWork({ a: [{ k: 1 }, { k: 2 }, { k: 3 }] }, { a: [{ k: 3, v: [{ k: 9 }] }, { k: 5 }] }, "k");
      expectPatchToWork([{ id: 1 }], [], "id");
      expectPatchToWork([], [{ id: 1 }, { id: 2 }], "id");
    });

    it("compares item by item an array whose items do not all have a key of their own", () => {
      expect(compared('[{"id":1},{"id":1,"v":2}]', '[{"id":1,"v":2}]', "id").changes).toEqual([
        { kind: "added", path: "$[0].v", after: 2 },
        { kind: "removed", path: "$[1]", before: { id: 1, v: 2 } },
      ]);
      expect(compared('[{"id":1},3]', '[3,{"id":1}]', "id").changes).toHaveLength(2);
    });
  });

  it("finds no change between YAML with merge keys and the same YAML written out", () => {
    const merged = "base: &base\n  host: a\n  port: 1\nprod:\n  <<: *base\n  host: b\n";
    const expanded = "base:\n  host: a\n  port: 1\nprod:\n  host: b\n  port: 1\n";
    expect(compared(merged, expanded).changes).toEqual([]);
  });

  it("compares YAML with JSON, by value", () => {
    expect(compared('{"server":{"port":80,"hosts":["a"]}}', "server:\n  port: 81\n  hosts: [a]\n").changes).toEqual([
      { kind: "changed", path: "$.server.port", before: 80, after: 81 },
    ]);
  });

  it("compares a YAML stream of several documents as an array of them", () => {
    expect(compared("a: 1\n---\nb: 2\n", "a: 1\n").patch).toEqual([{ op: "replace", path: "", value: { a: 1 } }]);
    expect(compared("a: 1\n---\nb: 2\n", "a: 1\n---\nb: 3\n").changes).toEqual([
      { kind: "changed", path: "$[1].b", before: 2, after: 3 },
    ]);
  });

  it("writes keys that are not plain names in brackets, and escapes them in the patch", () => {
    const before = { "a/b": 1, "~x": 1, "tên người dùng": 1, "😀": 1, "": 1, 'say "hi"': 1 };
    const after = { "a/b": 2, "~x": 2, "tên người dùng": 2, "😀": 2, "": 2, 'say "hi"': 2 };
    const { changes, patch } = compared(JSON.stringify(before), JSON.stringify(after));
    expect(changes.map((change) => change.path)).toEqual([
      '$["a/b"]',
      '$["~x"]',
      '$["tên người dùng"]',
      '$["😀"]',
      '$[""]',
      '$["say \\"hi\\""]',
    ]);
    expect(patch.map((op) => op.path)).toEqual(["/a~1b", "/~0x", "/tên người dùng", "/😀", "/", '/say "hi"']);
    expectPatchToWork(before, after);
    expect(compared('{"tên":"Bình"}', '{"tên":"Bình 😀"}').changes).toEqual([
      { kind: "changed", path: "$.tên", before: "Bình", after: "Bình 😀" },
    ]);
  });

  it("tells a value from one of another type that looks the same", () => {
    expect(compared('{"a":1,"b":null,"c":[]}', '{"a":"1","b":false,"c":{}}').changes.map((c) => c.kind)).toEqual([
      "changed",
      "changed",
      "changed",
    ]);
  });

  it("says which document is empty, and where one is not valid", () => {
    expect(compareDocuments("  \n", '{"a":1}', { arrayKey: "" })).toEqual({
      ok: false,
      errors: [{ side: "original", reason: "empty" }],
    });
    expect(compareDocuments('{\n  "a": 1,\n}', "a: [1\n", { arrayKey: "" })).toEqual({
      ok: false,
      errors: [
        { side: "original", reason: "invalid", line: 3, column: 1 },
        { side: "modified", reason: "invalid", line: 2, column: 1 },
      ],
    });
    expect(compareDocuments("a: 1\na: 2\n", "", { arrayKey: "" })).toEqual({
      ok: false,
      errors: [
        { side: "original", reason: "invalid", line: 2, column: 1 },
        { side: "modified", reason: "empty" },
      ],
    });
  });

  it("compares large documents", () => {
    const items = Array.from({ length: 20_000 }, (_, i) => ({ id: i, name: `item ${i}`, tags: ["a", "b"] }));
    const before = { items };
    const renamed = items.map((item) => (item.id % 1000 === 0 ? { ...item, name: "renamed" } : item));
    // The last ten items moved to the front, as a sort or an insert would.
    const after = { items: [...renamed.slice(-10), ...renamed.slice(0, -10)] };
    const { changes } = compared(JSON.stringify(before), JSON.stringify(after), "id");
    expect(changes).toHaveLength(20);
    expectPatchToWork(before, after, "id");
    expectPatchToWork(before, after);
  });

  it("refuses documents nested too deep to compare, rather than running out of stack", () => {
    const deep = (levels: number) => "[".repeat(levels) + "1" + "]".repeat(levels);
    expect(compareDocuments(deep(20_000), deep(3), { arrayKey: "" })).toEqual({
      ok: false,
      errors: [{ side: "original", reason: "too-deep" }],
    });
    expect(compared(deep(MAX_DEPTH), deep(MAX_DEPTH)).changes).toEqual([]);
  });

  it("reads JSON saved with a byte order mark", () => {
    expect(compared('\uFEFF{"a":1}', '{"a":2}').changes).toEqual([{ kind: "changed", path: "$.a", before: 1, after: 2 }]);
  });

  it("finds no change between two YAML .nan values", () => {
    expect(compared("a: .nan\n", "a: .nan\n").changes).toEqual([]);
  });
});
