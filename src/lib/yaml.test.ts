import { describe, expect, it } from "vitest";
import { readYaml } from "./yaml";

describe("readYaml", () => {
  it("reads one value per document", () => {
    expect(readYaml("a: 1\n---\n- x\n")).toEqual({ ok: true, docs: [{ a: 1 }, ["x"]] });
  });

  it("leaves out the empty document a trailing --- makes", () => {
    expect(readYaml("a: 1\n---\n")).toEqual({ ok: true, docs: [{ a: 1 }] });
  });

  it("says where YAML is not valid", () => {
    expect(readYaml("a: 1\nb: [1, 2\n")).toMatchObject({ ok: false, at: { line: 3 } });
  });

  it("refuses a key twice in one map, at the second one", () => {
    expect(readYaml("k: 1\nk: 2\n")).toEqual({ ok: false, at: { line: 2, column: 1 } });
  });

  it("refuses aliases that refer to themselves", () => {
    expect(readYaml("a: &a\n  b: *a\n")).toEqual({ ok: false });
  });

  it("expands a merge key, the keys written in the map winning over the merged ones", () => {
    expect(readYaml("base: &base\n  host: a\n  port: 1\nprod:\n  <<: *base\n  host: b\n")).toEqual({
      ok: true,
      docs: [{ base: { host: "a", port: 1 }, prod: { host: "b", port: 1 } }],
    });
  });

  it("lets a key written before the merge key win too", () => {
    expect(readYaml("c:\n  k: 1\n  <<: {k: 2, j: 2}\n")).toEqual({ ok: true, docs: [{ c: { k: 1, j: 2 } }] });
  });

  it("merges a list of maps, the first one winning", () => {
    const anchors = "a: &a {x: 1}\nb: &b {x: 2, y: 2}\n";
    expect(readYaml(anchors + "c:\n  <<: [*a, *b]\n")).toMatchObject({ ok: true, docs: [{ c: { x: 1, y: 2 } }] });
  });

  it("takes several merge keys in one map", () => {
    const anchors = "a: &a {x: 1}\nb: &b {x: 2, y: 2}\n";
    expect(readYaml(anchors + "c:\n  <<: *a\n  <<: *b\n")).toMatchObject({ ok: true, docs: [{ c: { x: 1, y: 2 } }] });
  });

  it("still refuses a key written twice next to a merge key", () => {
    expect(readYaml("a: &a {x: 1}\nc:\n  <<: *a\n  k: 1\n  k: 2\n")).toEqual({ ok: false, at: { line: 5, column: 3 } });
  });

  it("keeps a quoted '<<' as a key", () => {
    expect(readYaml("c:\n  '<<': 1\n")).toEqual({ ok: true, docs: [{ c: { "<<": 1 } }] });
  });

  it("refuses a merge key whose value is not a map", () => {
    expect(readYaml("c:\n  <<: [1]\n")).toEqual({ ok: false });
  });
});
