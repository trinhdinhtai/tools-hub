import { describe, expect, it } from "vitest";
import { parseJson, type JsonNode } from "./logic";
import { treeChildren, valueType } from "./tree";

function node(text: string): JsonNode {
  const result = parseJson(text);
  if (!result.ok) throw new Error("bad fixture");
  return result.node;
}

describe("valueType", () => {
  it.each([
    ["{}", "object"],
    ["[1]", "array"],
    ['"x"', "string"],
    ["-1.5e3", "number"],
    ["true", "boolean"],
    ["false", "boolean"],
    ["null", "null"],
  ])("%s is %s", (text, type) => {
    expect(valueType(node(text))).toBe(type);
  });
});

describe("treeChildren", () => {
  it("lists an object's members with decoded keys, in the order written, duplicates included", () => {
    const children = treeChildren(node('{"b":1,"\\u0061":"x","b":[]}'));
    expect(children.map((c) => c.key)).toEqual(["b", "a", "b"]);
    expect(children.map((c) => c.label)).toEqual(["1", '"x"', "[]"]);
  });

  it("sorts keys as Sort keys does: decoded, in code-unit order, equal keys in order", () => {
    const children = treeChildren(node('{"b":1,"B":2,"\\u0061":3,"a":4}'), { sortKeys: true });
    expect(children.map((c) => [c.key, c.label])).toEqual([["B", "2"], ["a", "3"], ["a", "4"], ["b", "1"]]);
  });

  it("lists an array's items by index", () => {
    const children = treeChildren(node('[true,{"a":1},"tên 😀"]'));
    expect(children.map((c) => c.key)).toEqual([0, 1, 2]);
    expect(children.map((c) => c.label)).toEqual(["true", "{1}", '"tên 😀"']);
  });

  it("has no children for a scalar or an empty container", () => {
    expect(treeChildren(node("42"))).toEqual([]);
    expect(treeChildren(node("{}"))).toEqual([]);
  });

  it("labels a container by its size, so a collapsed row still says what is inside", () => {
    const [object, array] = treeChildren(node('[{"a":1,"b":2},[1,2,3]]'));
    expect(object!.label).toBe("{2}");
    expect(array!.label).toBe("[3]");
  });

  it("is quick on a large array", () => {
    const big = node(JSON.stringify(Array.from({ length: 200_000 }, (_, i) => i)));
    const started = performance.now();
    expect(treeChildren(big)).toHaveLength(200_000);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
