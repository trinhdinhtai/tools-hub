import { describe, expect, it } from "vitest";
import { parseJson, printJson } from "./logic";
import { queryJson, type QueryError } from "./query";

// Written out rather than built with JSON.stringify, which would round the big number.
const DOC = `{
  "users": [
    { "name": "An", "tags": ["admin"], "first name": "Trần" },
    { "name": "Bình", "tags": [] }
  ],
  "a.b": 1,
  "tên": "Việt 😀",
  "": "empty key",
  "n": 12345678901234567890
}`;

function parsed(text = DOC) {
  const result = parseJson(text);
  if (!result.ok) throw new Error("bad fixture");
  return result.node;
}

function found(path: string, text?: string): string {
  const result = queryJson(parsed(text), path);
  if (!result.ok) throw new Error(`expected a match, got ${JSON.stringify(result.error)}`);
  return printJson(result.node, { output: "minify", indent: 2, sortKeys: false });
}

function notFound(path: string): QueryError {
  const result = queryJson(parsed(), path);
  if (result.ok) throw new Error("expected no match");
  return result.error;
}

describe("queryJson", () => {
  it.each(["", "$", "  $ "])("%j is the whole document", (path) => {
    expect(found(path)).toBe(printJson(parsed(), { output: "minify", indent: 2, sortKeys: false }));
  });

  it.each([
    ["$.users[0].name", '"An"'],
    ["users[0].name", '"An"'],
    [".users[1].name", '"Bình"'],
    ["$.users.1.name", '"Bình"'],
    ["$.users[-1].name", '"Bình"'],
    ['$["a.b"]', "1"],
    ["$['a.b']", "1"],
    ['$.users[0]["first name"]', '"Trần"'],
    ["$.tên", '"Việt 😀"'],
    ['$[""]', '"empty key"'],
    ["  $.users[0].tags[0]  ", '"admin"'],
    ["$.n", "12345678901234567890"],
  ])("%s", (path, expected) => {
    expect(found(path)).toBe(expected);
  });

  it("collects every match of a wildcard into an array", () => {
    expect(found("$.users[*].name")).toBe('["An","Bình"]');
    expect(found("$.users.*.tags[0]")).toBe('["admin"]');
    expect(found("$.users[0].*")).toBe('["An",["admin"],"Trần"]');
    expect(found("$.n[*]")).toBe("[]");
  });

  it("starts at the root with a bare index on an array", () => {
    expect(found("[0]", "[5,6]")).toBe("5");
    expect(found("[-1]", "[5,6]")).toBe("6");
  });

  it("takes the last of duplicate keys, as JSON.parse does", () => {
    expect(found("$.a", '{"a":1,"a":2}')).toBe("2");
  });

  it("matches keys as decoded, escapes and all", () => {
    expect(found("$.é", '{"\\u00e9":1}')).toBe("1");
    expect(found('$["q\\"x"]', '{"q\\"x":1}')).toBe("1");
  });

  it.each<[string, Partial<QueryError>]>([
    ["$.missing", { reason: "not-found", path: "$.missing" }],
    ["$.users[5].name", { reason: "not-found", path: "$.users[5]" }],
    ["$.users[0].name.first", { reason: "not-found", path: "$.users[0].name.first" }],
    ["$.users.name", { reason: "not-found", path: "$.users.name" }],
    ["$.users[0][0]", { reason: "not-found", path: "$.users[0][0]" }],
  ])("%s is not found", (path, expected) => {
    expect(notFound(path)).toMatchObject(expected);
  });

  it.each<[string, number]>([
    ["$.", 3],
    ["$..a", 3],
    ["$[", 3],
    ["$[1", 4],
    ["$[abc]", 3],
    ['$["a]', 3],
    ["$.users[0]x", 11],
    ["a b", 2],
  ])("%s is not a valid path", (path, column) => {
    expect(notFound(path)).toEqual({ reason: "invalid-path", column });
  });
});
