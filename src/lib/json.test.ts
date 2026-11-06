import { describe, expect, it } from "vitest";
import { readJson } from "./json";

describe("readJson", () => {
  it("reads JSON, with or without a byte order mark", () => {
    expect(readJson('{"a":[1,"é"]}')).toEqual({ ok: true, value: { a: [1, "é"] } });
    expect(readJson('\uFEFF{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("says where JSON is not valid", () => {
    expect(readJson('{\n  "a": 1,\n}')).toEqual({ ok: false, at: { line: 3, column: 1 } });
  });
});
