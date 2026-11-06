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
});
