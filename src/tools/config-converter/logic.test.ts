import { describe, expect, it } from "vitest";
import { convertConfig, FORMATS, parseConfig, stringifyConfig, type Format } from "./logic";

describe("convertConfig", () => {
  it("converts a JSON object to YAML", () => {
    expect(convertConfig('{"name":"app","port":8080,"tags":["a","b"]}', "json", "yaml")).toEqual({
      ok: true,
      text: "name: app\nport: 8080\ntags:\n  - a\n  - b\n",
    });
  });

  it("turns a YAML stream of several documents into a JSON array of them", () => {
    expect(convertConfig("a: 1\n---\nb: 2\n", "yaml", "json")).toEqual({
      ok: true,
      text: '[\n  {\n    "a": 1\n  },\n  {\n    "b": 2\n  }\n]\n',
    });
  });

  it("keeps the documents apart when the output is YAML too", () => {
    expect(convertConfig("a: 1\n---\nb: 2\n", "yaml", "yaml")).toEqual({ ok: true, text: "a: 1\n---\nb: 2\n" });
  });

  it("says where YAML is not valid", () => {
    expect(convertConfig("a: 1\nb: [1, 2\n", "yaml", "json")).toEqual({
      ok: false,
      error: { reason: "invalid", line: 3, column: 1 },
    });
  });

  it("refuses a YAML map with the same key twice, and says where the second one is", () => {
    expect(convertConfig("db:\n  host: a\n  port: 1\n  host: b\n", "yaml", "json")).toEqual({
      ok: false,
      error: { reason: "invalid", line: 4, column: 3 },
    });
  });

  it("refuses YAML whose aliases refer to themselves, or expand without end", () => {
    for (const to of FORMATS) {
      expect(convertConfig("a: &a\n  b: *a\n", "yaml", to)).toEqual({ ok: false, error: { reason: "invalid" } });
    }
    // Each level holds ten aliases of the one before: 10^9 values once expanded.
    const names = "abcdefghij";
    const bomb = ["a: &a [x, x, x, x, x, x, x, x, x, x]"];
    for (let i = 1; i < 10; i++) bomb.push(`${names[i]}: &${names[i]} [${Array(10).fill(`*${names[i - 1]}`).join(", ")}]`);
    expect(convertConfig(bomb.join("\n"), "yaml", "json")).toEqual({ ok: false, error: { reason: "invalid" } });
  });

  it("drops the empty document a trailing --- leaves", () => {
    expect(parseConfig("a: 1\n---\n", "yaml")).toEqual({ ok: true, docs: [{ a: 1 }] });
  });

  it("says where JSON is not valid", () => {
    expect(convertConfig('{\n  "a": 1,\n  oops\n}', "json", "yaml")).toEqual({
      ok: false,
      error: { reason: "invalid", line: 3, column: 3 },
    });
  });

  it("treats Input of only whitespace as empty, in every format", () => {
    for (const from of FORMATS) {
      expect(convertConfig(" \n\t\n", from, "json")).toEqual({ ok: false, error: { reason: "empty" } });
    }
  });

  it("reads TOML tables, arrays and dates", () => {
    const toml = 'title = "demo"\n\n[server]\nport = 8080\nhosts = ["a", "b"]\nstarted = 2024-05-01T10:00:00Z\n';
    expect(convertConfig(toml, "toml", "json")).toEqual({
      ok: true,
      text:
        '{\n  "title": "demo",\n  "server": {\n    "port": 8080,\n    "hosts": [\n      "a",\n      "b"\n    ],\n' +
        '    "started": "2024-05-01T10:00:00.000Z"\n  }\n}\n',
    });
  });

  it("writes TOML with a table per nested object", () => {
    expect(convertConfig('{"title":"demo","server":{"port":8080}}', "json", "toml")).toEqual({
      ok: true,
      text: 'title = "demo"\n\n[server]\nport = 8080\n',
    });
  });

  it("says where TOML is not valid", () => {
    expect(convertConfig('a = 1\nb = "open\n', "toml", "json")).toMatchObject({
      ok: false,
      error: { reason: "invalid", line: 2 },
    });
  });

  it("refuses TOML for a value TOML cannot hold, and says where it is", () => {
    expect(convertConfig('{"db":{"password":null}}', "json", "toml")).toEqual({
      ok: false,
      error: { reason: "toml-null", path: "db.password" },
    });
    expect(convertConfig("[1, 2]", "json", "toml")).toEqual({ ok: false, error: { reason: "not-a-table" } });
    expect(convertConfig("a: 1\n---\nb: 2\n", "yaml", "toml")).toEqual({ ok: false, error: { reason: "not-a-table" } });
  });

  it("writes a single YAML document as a single JSON value", () => {
    expect(convertConfig("server:\n  port: 80\n", "yaml", "json")).toEqual({
      ok: true,
      text: '{\n  "server": {\n    "port": 80\n  }\n}\n',
    });
  });
});

describe("round trip", () => {
  /** What every format can hold: a table of strings, nested, with arrays, in any script. */
  const STRINGS = {
    name: "Tools Hub",
    greeting: "Xin chào, thế giới 👋",
    db: { host: "localhost", port: "5432", options: { ssl: "true" } },
    hosts: ["a.example.com", "b.example.com"],
    quoted: 'say "hi" # not a comment',
    multiline: "line one\nline two",
  };
  /** What JSON, YAML and TOML can hold: types too, and arrays of tables. */
  const TYPED = {
    port: 8080,
    ratio: 0.5,
    debug: false,
    servers: [
      { name: "alpha", weight: 1 },
      { name: "beta", weight: 2 },
    ],
    nested: { deeper: { list: [1, 2, 3] } },
  };

  const write = (value: unknown, format: Format) => {
    const result = stringifyConfig([value], format);
    if (!result.ok) throw new Error(`cannot write ${format}: ${JSON.stringify(result.error)}`);
    return result.text;
  };

  for (const from of FORMATS) {
    for (const to of FORMATS) {
      it(`${from} → ${to} → ${from} gives back the same config`, () => {
        const source = write(STRINGS, from);
        const there = convertConfig(source, from, to);
        expect(there.ok).toBe(true);
        const back = convertConfig(there.ok ? there.text : "", to, from);
        expect(back.ok && parseConfig(back.text, from)).toEqual({ ok: true, docs: [STRINGS] });
        // TOML writes plain keys before tables, so through TOML only the key order may change.
        if (to !== "toml") expect(back).toEqual({ ok: true, text: source });
      });
    }
  }

  for (const from of ["json", "yaml", "toml"] as const) {
    for (const to of ["json", "yaml", "toml"] as const) {
      it(`${from} → ${to} → ${from} keeps numbers, booleans and arrays of tables`, () => {
        const there = convertConfig(write(TYPED, from), from, to);
        const back = there.ok ? convertConfig(there.text, to, from) : there;
        expect(back.ok && parseConfig(back.text, from)).toEqual({ ok: true, docs: [TYPED] });
      });
    }
  }

  it("keeps a YAML stream of several documents through YAML", () => {
    const stream = "a: 1\n---\n- x\n- y\n---\nc: true\n";
    expect(convertConfig(stream, "yaml", "yaml")).toEqual({ ok: true, text: stream });
  });

  it("converts large Input", () => {
    const big = Object.fromEntries(Array.from({ length: 20_000 }, (_, i) => [`key_${i}`, `value ${i}`]));
    for (const to of FORMATS) {
      const there = convertConfig(JSON.stringify(big), "json", to);
      expect(there.ok && parseConfig(there.text, to)).toEqual({ ok: true, docs: [big] });
    }
  });
});
