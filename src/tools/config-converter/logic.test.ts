import { describe, expect, it } from "vitest";
import { convertConfig, detectFormat, detectPaste, FORMATS, parseConfig, stringifyConfig, type Format } from "./logic";

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

  it("expands YAML merge keys, so no `<<` key reaches the output", () => {
    const yaml = "defaults: &defaults\n  adapter: postgres\n  pool: 5\nproduction:\n  <<: *defaults\n  pool: 20\n";
    expect(convertConfig(yaml, "yaml", "json")).toEqual({
      ok: true,
      text: '{\n  "defaults": {\n    "adapter": "postgres",\n    "pool": 5\n  },\n  "production": {\n    "adapter": "postgres",\n    "pool": 20\n  }\n}\n',
    });
    expect(convertConfig(yaml, "yaml", "env")).toEqual({
      ok: true,
      text: "defaults__adapter=postgres\ndefaults__pool=5\nproduction__adapter=postgres\nproduction__pool=20\n",
    });
  });

  it("expands merge keys when the output is YAML too", () => {
    expect(convertConfig("a: &a {x: 1}\nb:\n  <<: *a\n  y: 2\n", "yaml", "yaml")).toEqual({
      ok: true,
      text: "a:\n  x: 1\nb:\n  x: 1\n  y: 2\n",
    });
  });

  it("quotes a key named << in YAML, so that it is not read back as a merge key", () => {
    const json = '{\n  "<<": 1,\n  "a": {\n    "<<": [\n      1\n    ]\n  }\n}\n';
    const yaml = convertConfig(json, "json", "yaml");
    expect(yaml).toEqual({ ok: true, text: '"<<": 1\na:\n  "<<":\n    - 1\n' });
    expect(convertConfig(yaml.ok ? yaml.text : "", "yaml", "json")).toEqual({ ok: true, text: json });
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
    expect(detectFormat("a: &a\n  b: *a\nc: 1\n")).toBeNull();
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

  it("reads .env with comments, export, quotes and escapes", () => {
    const env = [
      "# database",
      "export DB_HOST=localhost",
      "DB_PORT = 5432 # default",
      'GREETING="hello\\nworld \\"quoted\\""',
      "RAW='no $expansion \\n here'",
      "EMPTY=",
      'MULTI="line one',
      'line two"',
    ].join("\n");
    expect(parseConfig(env, "env")).toEqual({
      ok: true,
      docs: [
        {
          DB_HOST: "localhost",
          DB_PORT: "5432",
          GREETING: 'hello\nworld "quoted"',
          RAW: "no $expansion \\n here",
          EMPTY: "",
          MULTI: "line one\nline two",
        },
      ],
    });
  });

  it("writes nested values to .env as keys joined with __, quoting what needs it", () => {
    expect(convertConfig('{"db":{"host":"x","port":5432},"tags":["a","b"],"motd":"hi there\\n","off":null}', "json", "env")).toEqual({
      ok: true,
      text: 'db__host=x\ndb__port=5432\ntags__0=a\ntags__1=b\nmotd="hi there\\n"\noff=\n',
    });
  });

  it("reads keys joined with __ in .env back into nested objects and arrays", () => {
    expect(parseConfig("db__host=x\ntags__0=a\ntags__1=b\n", "env")).toEqual({
      ok: true,
      docs: [{ db: { host: "x" }, tags: ["a", "b"] }],
    });
  });

  it("keeps keys flat when nesting them would clash", () => {
    expect(parseConfig("db=main\ndb__host=x\n", "env")).toEqual({ ok: true, docs: [{ db: "main", db__host: "x" }] });
  });

  it("says which .env line is not valid", () => {
    expect(convertConfig("A=1\nnot an assignment\n", "env", "json")).toEqual({
      ok: false,
      error: { reason: "invalid", line: 2, column: 1 },
    });
    expect(convertConfig('A=1\nB="never closed\n', "env", "json")).toEqual({
      ok: false,
      error: { reason: "invalid", line: 2, column: 3 },
    });
  });

  it("refuses .env for a config that is not a table of keys", () => {
    expect(convertConfig('"just text"', "json", "env")).toEqual({ ok: false, error: { reason: "not-a-table" } });
  });

  it("reads .properties the way Java does, and nests dotted keys", () => {
    const properties = [
      "# comment",
      "! also a comment",
      "server.port=8080",
      "server.host : example.com",
      "app.name   Tools Hub",
      "app.greeting = hello, \\",
      "    world",
      "app.unicode = caf\\u00e9 \\t tab",
      "servers[0].name=a",
      "servers[1].name=b",
    ].join("\n");
    expect(parseConfig(properties, "properties")).toEqual({
      ok: true,
      docs: [
        {
          server: { port: "8080", host: "example.com" },
          app: { name: "Tools Hub", greeting: "hello, world", unicode: "café \t tab" },
          servers: [{ name: "a" }, { name: "b" }],
        },
      ],
    });
  });

  it("writes .properties with dotted keys and escapes", () => {
    expect(convertConfig('{"server":{"port":8080},"servers":[{"name":"a"}],"my key":"x=y","note":"  two\\nlines"}', "json", "properties")).toEqual({
      ok: true,
      text: "server.port=8080\nservers[0].name=a\nmy\\ key=x=y\nnote=\\ \\ two\\nlines\n",
    });
  });

  it("says which .properties line has a broken \\u escape", () => {
    expect(convertConfig("a=1\nb=\\u00zz\n", "properties", "json")).toEqual({
      ok: false,
      error: { reason: "invalid", line: 2, column: 3 },
    });
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

describe("detectFormat", () => {
  it.each([
    ['{\n  "name": "app"\n}', "json"],
    ["[1, 2]", "json"],
    ["name: app\nserver:\n  port: 80\n", "yaml"],
    ["- a\n- b\n", "yaml"],
    ["---\na: 1\n---\nb: 2\n", "yaml"],
    ['title = "demo"\n\n[server]\nport = 8080\n', "toml"],
    ["[package]\nname = 'x'\n", "toml"],
    ["# db\nDB_HOST=localhost\nexport DB_PORT=5432\n", "env"],
    ["API_KEY=abc123", "env"],
    ["server.port=8080\nspring.datasource.url=jdbc:mysql://localhost/db\n", "properties"],
    ["# app\napp.name=Tools Hub\n", "properties"],
  ] as const)("recognises %j as %s", (text, format) => {
    expect(detectFormat(text)).toBe(format);
  });

  it.each([
    "",
    "   ",
    "hello world",
    "42",
    "Note: buy milk",
    "Dear team:\nThe meeting is at noon: see you there",
    "https://example.com/search?q=yaml&lang=vi",
    "SGVsbG8sIFRvb2xzIEh1Yg==",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl",
    "{not json",
    String.raw`^\d{3}-\d{4}$`,
  ])("recognises nothing in %j", (text) => {
    expect(detectFormat(text)).toBeNull();
  });
});

describe("detectPaste", () => {
  it("scores YAML, TOML and .env", () => {
    expect(detectPaste("name: app\nserver:\n  port: 80\n")).toBeGreaterThanOrEqual(0.7);
    expect(detectPaste('title = "demo"\n\n[server]\nport = 8080\n')).toBeGreaterThanOrEqual(0.7);
    expect(detectPaste("DB_HOST=localhost\nDB_PORT=5432\n")).toBeGreaterThanOrEqual(0.7);
    expect(detectPaste("server.port=8080\napp.name=x\n")).toBeGreaterThan(0);
  });

  it("scores JSON below JSON Viewer, which is the better fit for it", () => {
    const score = detectPaste('{"name":"app","port":8080}');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.9);
  });

  it("scores 0 for content other Tools are for, and for plain text", () => {
    for (const text of [
      "SGVsbG8sIFRvb2xzIEh1Yg==",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl",
      "https://example.com/?a=b",
      "just some words",
      "{}",
      "[]",
      "",
    ]) {
      expect(detectPaste(text), text).toBe(0);
    }
  });
});
