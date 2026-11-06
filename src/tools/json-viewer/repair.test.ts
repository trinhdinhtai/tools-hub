import { describe, expect, it } from "vitest";
import { transformJson } from "./logic";
import { repairJson } from "./repair";

/** Repairs to minified JSON, and checks the result is strict JSON. */
function repaired(text: string): string {
  const result = repairJson(text, { output: "minify", indent: 2, sortKeys: false });
  if (result === null) throw new Error("expected the Input to be repairable");
  expect(transformJson(result, { output: "minify", indent: 2, sortKeys: false })).toEqual({ ok: true, text: result });
  return result;
}

describe("repairJson: JSON5", () => {
  it.each([
    ["unquoted keys", "{a: 1, $b_2: 2, tên: 3}", '{"a":1,"$b_2":2,"tên":3}'],
    ["single-quoted strings", `{'a': 'it\\'s "quoted"'}`, '{"a":"it\'s \\"quoted\\""}'],
    ["trailing commas", "{a: [1, 2,],}", '{"a":[1,2]}'],
    ["line and block comments", '{\n  // note\n  "a": 1, /* more */ "b": 2\n}', '{"a":1,"b":2}'],
    ["hex, leading and trailing dots, plus sign", "[0x1F, .5, 5., +3, -0xA, 1_000]", "[31,0.5,5,3,-10,1000]"],
    ["Infinity and NaN, which JSON cannot hold, become null", "[Infinity, -Infinity, NaN]", "[null,null,null]"],
    ["escapes JSON lacks", String.raw`['\x41\v\0', "a\
b"]`, '["A\\u000b\\u0000","ab"]'],
    ["line breaks and tabs inside a string", '["a\tb\nc"]', '["a\\tb\\nc"]'],
    ["a hex number too big for a double stays exact", "0xFFFFFFFFFFFFFFFFFF", "4722366482869645213695"],
  ])("%s", (_name, input, expected) => {
    expect(repaired(input)).toBe(expected);
  });
});

describe("repairJson: Python, Ruby and JavaScript literals", () => {
  it.each([
    ["Python dict with None, True, False", "{'a': None, 'b': True, 'c': False}", '{"a":null,"b":true,"c":false}'],
    ["Python tuples become arrays", "{'p': (1, 2), 'e': ()}", '{"p":[1,2],"e":[]}'],
    ["Python string prefixes and raw strings", String.raw`[u'é', r'C:\new', b'x']`, String.raw`["é","C:\\new","x"]`],
    ["Python # comments", "{'a': 1  # one\n}", '{"a":1}'],
    ["Python number keys", "{1: 'x', 2.5: 'y'}", '{"1":"x","2.5":"y"}'],
    ["Ruby hash rockets, symbols and nil", '{:a => 1, "b" => nil, c: :d}', '{"a":1,"b":null,"c":"d"}'],
    ["JavaScript undefined and backticks", "{a: undefined, b: `t`}", '{"a":null,"b":"t"}'],
    ["missing commas between lines", "[\n  1\n  2\n]", "[1,2]"],
  ])("%s", (_name, input, expected) => {
    expect(repaired(input)).toBe(expected);
  });
});

describe("repairJson: NDJSON", () => {
  it("wraps one value per line in an array", () => {
    expect(repaired('{"id":1}\n{"id":2}\r\n\n{"id":3}\n')).toBe('[{"id":1},{"id":2},{"id":3}]');
  });

  it("keeps a single value as it is", () => {
    expect(repaired('{"id":1}\n')).toBe('{"id":1}');
  });
});

describe("repairJson: output", () => {
  it("formats with the chosen options", () => {
    expect(repairJson("{b: 1, a: 2}", { output: "format", indent: 2, sortKeys: true })).toBe('{\n  "a": 2,\n  "b": 1\n}');
  });

  it("leaves valid JSON as it is", () => {
    expect(repaired('{"a":"\\u00e9","n":12345678901234567890}')).toBe('{"a":"\\u00e9","n":12345678901234567890}');
  });
});

describe("repairJson: what it cannot repair", () => {
  it.each([
    ["empty", ""],
    ["only whitespace and comments", "  // nothing\n"],
    ["prose", "hello world"],
    ["an unknown name", "{a: foo}"],
    ["an unclosed object", "{a: 1"],
    ["a closing bracket that does not match", "[1}"],
    ["an unterminated string", "['abc"],
    ["an unterminated comment", "[1] /* no end"],
    ["a key without a value", "{a}"],
    ["a function call", "{a: Date()}"],
    ["a malformed number", "[1.2.3]"],
    ["arithmetic, which is not two numbers", "[1-1, 2+3]"],
  ])("%s", (_name, input) => {
    expect(repairJson(input, { output: "minify", indent: 2, sortKeys: false })).toBeNull();
  });
});

describe("repairJson: edge cases", () => {
  it("keeps Unicode, emoji included", () => {
    expect(repaired("{'tên': 'Tiếng Việt 😀', \u00a0b: '中文'}")).toBe('{"tên":"Tiếng Việt 😀","b":"中文"}');
  });

  it("handles nesting far deeper than the call stack allows", () => {
    const depth = 100_000;
    expect(repaired("[".repeat(depth) + "]".repeat(depth))).toBe("[".repeat(depth) + "]".repeat(depth));
  });

  it("repairs a few MB of Python literal quickly", () => {
    const rows = Array.from({ length: 30_000 }, (_, i) => `{'id': ${i}, 'name': 'item ${i}', 'ok': ${i % 2 ? "True" : "False"}, 'n': None},`);
    const input = "[" + rows.join("\n") + "]";
    expect(input.length).toBeGreaterThan(1_500_000);
    const started = performance.now();
    const result = JSON.parse(repaired(input)) as { id: number; ok: boolean; n: null }[];
    expect(performance.now() - started).toBeLessThan(2000);
    expect(result).toHaveLength(30_000);
    expect(result[29_999]).toEqual({ id: 29_999, name: "item 29999", ok: true, n: null });
  });
});
