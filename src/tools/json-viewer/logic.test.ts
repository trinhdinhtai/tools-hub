import { describe, expect, it } from "vitest";
import { detectPaste, transformJson, type TransformOptions } from "./logic";

const FORMAT: TransformOptions = { output: "format", indent: 2, sortKeys: false };

function ok(text: string, options: Partial<TransformOptions> = {}) {
  const result = transformJson(text, { ...FORMAT, ...options });
  if (!result.ok) throw new Error(`expected valid JSON, got ${JSON.stringify(result.error)}`);
  return result.text;
}

function error(text: string) {
  const result = transformJson(text, FORMAT);
  if (result.ok) throw new Error("expected a syntax error");
  return result.error;
}

describe("transformJson: format", () => {
  it("indents with 2 spaces", () => {
    expect(ok('{"a":1,"b":[true,null]}')).toBe('{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}');
  });
});

describe("transformJson: output", () => {
  it("indents with 4 spaces or a tab", () => {
    expect(ok("[1]", { indent: 4 })).toBe("[\n    1\n]");
    expect(ok('{"a":{"b":1}}', { indent: "tab" })).toBe('{\n\t"a": {\n\t\t"b": 1\n\t}\n}');
  });

  it("minifies, whatever the indent", () => {
    expect(ok(' {\n  "a" : [ 1 , 2 ],\n\t"b" : { } \n} ', { output: "minify", indent: 4 })).toBe('{"a":[1,2],"b":{}}');
  });

  it("keeps empty objects and arrays on one line", () => {
    expect(ok('{"a":{},"b":[]}')).toBe('{\n  "a": {},\n  "b": []\n}');
  });

  it("formats a scalar on its own", () => {
    expect(ok(' "hi" ')).toBe('"hi"');
    expect(ok("-1.5e+3")).toBe("-1.5e+3");
  });

  it("changes only whitespace: key order, number digits and string escapes stay as written", () => {
    const input = '{"b":1,"2":2,"1":3,"big":12345678901234567890,"x":1.0,"s":"\\u00e9\\n\\/"}';
    expect(ok(input, { output: "minify" })).toBe(input);
  });

  it("keeps duplicate keys", () => {
    expect(ok('{"a":1,"a":2}', { output: "minify" })).toBe('{"a":1,"a":2}');
  });
});

describe("transformJson: sort keys", () => {
  it("sorts the keys of every object, at every depth, leaving array order alone", () => {
    expect(ok('{"b":{"z":1,"y":2},"a":[{"d":1,"c":2},3,1]}', { output: "minify", sortKeys: true })).toBe(
      '{"a":[{"c":2,"d":1},3,1],"b":{"y":2,"z":1}}',
    );
  });

  it("compares keys as decoded, in code-unit order (uppercase before lowercase), keeping equal keys in order", () => {
    expect(ok('{"b":1,"\\u0061":2,"B":3,"a":4}', { output: "minify", sortKeys: true })).toBe('{"B":3,"\\u0061":2,"a":4,"b":1}');
  });
});

describe("transformJson: errors", () => {
  it.each<[string, string, Partial<ReturnType<typeof error>>]>([
    ["trailing comma in an object", '{\n  "a": 1,\n}', { reason: "trailing-comma", line: 2, column: 9 }],
    ["trailing comma in an array", "[1,2,]", { reason: "trailing-comma", line: 1, column: 5 }],
    ["single-quoted key", "{'a':1}", { reason: "expected-key", line: 1, column: 2, found: "'" }],
    ["missing colon", '{"a" 1}', { reason: "expected-colon", column: 6, found: "1" }],
    ["missing comma between members", '{"a":1 "b":2}', { reason: "expected-comma-or-brace", column: 8, found: '"' }],
    ["missing comma between items", "[1 2]", { reason: "expected-comma-or-bracket", column: 4, found: "2" }],
    ["unclosed object", '{"a":1', { reason: "unexpected-end", column: 7 }],
    ["missing value", '{"a":}', { reason: "expected-value", column: 6, found: "}" }],
    ["bare word", "[undefined]", { reason: "expected-value", column: 2, found: "u" }],
    ["leading zero", "[01]", { reason: "invalid-number", column: 2 }],
    ["number with a dangling dot", "[1.]", { reason: "invalid-number", column: 2 }],
    ["NaN-like number", "-", { reason: "invalid-number", column: 1 }],
    ["bad escape", '"a\\x"', { reason: "invalid-escape", column: 3 }],
    ["short unicode escape", '"\\u12"', { reason: "invalid-escape", column: 2 }],
    ["line break inside a string", '"a\nb"', { reason: "unescaped-control", line: 1, column: 3 }],
    ["unterminated string", '{"a": "b', { reason: "unterminated-string", column: 7 }],
    ["two values", "{} {}", { reason: "trailing-content", column: 4, found: "{" }],
    ["literal cut short", "[tru", { reason: "unexpected-end", column: 5 }],
    ["string ending in a backslash", '"abc\\', { reason: "unterminated-string", column: 1 }],
    ["error after a byte order mark", "﻿{,}", { reason: "expected-key", column: 2 }],
    ["only whitespace", " \n\t ", { reason: "empty" }],
    ["nothing", "", { reason: "empty" }],
  ])("%s", (_name, input, expected) => {
    expect(error(input)).toMatchObject(expected);
  });

  it("counts lines across \\n, \\r\\n and \\r", () => {
    expect(error("[\r\n1,\r2,\n x]")).toMatchObject({ line: 4, column: 2 });
  });

  it("counts columns in characters, so emoji and accents count once", () => {
    expect(error('{"tên": "😀", x}')).toMatchObject({ reason: "expected-key", line: 1, column: 14, found: "x" });
  });
});

describe("transformJson: edge cases", () => {
  it("formats Unicode as is", () => {
    expect(ok('{"tên":"Tiếng Việt 😀 中文"}')).toBe('{\n  "tên": "Tiếng Việt 😀 中文"\n}');
  });

  it("ignores a byte order mark", () => {
    expect(ok('\uFEFF{"a":1}', { output: "minify" })).toBe('{"a":1}');
  });

  it("handles nesting far deeper than the call stack allows", () => {
    const depth = 100_000;
    const input = "[".repeat(depth) + "]".repeat(depth);
    expect(ok(input, { output: "minify" })).toBe(input);
    expect(error("[".repeat(depth))).toMatchObject({ reason: "unexpected-end", column: depth + 1 });
  });

  it("formats a few MB of JSON quickly, matching JSON.stringify", () => {
    const value = Array.from({ length: 30_000 }, (_, i) => ({ id: i, name: `item ${i}`, tags: ["a", "b"], ok: i % 2 === 0, n: null }));
    const input = JSON.stringify(value);
    expect(input.length).toBeGreaterThan(2_000_000);
    const started = performance.now();
    expect(ok(input, { indent: 4 })).toBe(JSON.stringify(value, null, 4));
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("detectPaste", () => {
  it.each([
    ['{"a":1}', 0.9],
    ['  [1, {"b": [true]}]\n', 0.9],
    ["{}", 0.4],
    ["[]", 0.4],
    ["42", 0],
    ['"text"', 0],
    ["true", 0],
    ["{a:1}", 0],
    ["[1,2,]", 0],
    ["hello world", 0],
    ["", 0],
  ])("%j scores %d", (text, score) => {
    expect(detectPaste(text)).toBe(score);
  });
});
