import { describe, expect, it } from "vitest";
import { formatCode, type FormatError, type Indent, type Language } from "./logic";

describe("formatCode: beautify", () => {
  it("indents JavaScript", async () => {
    expect(await formatCode("const a={b:1,c:[1,2]};function f(x){return x*2}", "javascript", "beautify", "2")).toEqual({
      ok: true,
      text: "const a = { b: 1, c: [1, 2] };\nfunction f(x) {\n  return x * 2;\n}\n",
    });
  });

  it.each<[string, Language, string, string]>([
    ["CSS", "css", "a{color:red;margin:0 auto}b,i{x:1}", "a {\n  color: red;\n  margin: 0 auto;\n}\nb,\ni {\n  x: 1;\n}\n"],
    [
      "HTML",
      "html",
      "<div><p>a</p><ul><li>b</li></ul></div>",
      "<div>\n  <p>a</p>\n  <ul>\n    <li>b</li>\n  </ul>\n</div>\n",
    ],
    [
      "XML",
      "xml",
      '<?xml version="1.0"?><root><item id="1">a</item><item id="2"/></root>',
      '<?xml version="1.0" ?>\n<root>\n  <item id="1">a</item>\n  <item id="2" />\n</root>\n',
    ],
    [
      "SQL",
      "sql",
      "select a, b from t where x = 'it''s' and y > 1",
      "SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 'it''s'\n  AND y > 1\n",
    ],
  ])("indents %s", async (_name, language, input, output) => {
    expect(await formatCode(input, language, "beautify", "2")).toEqual({ ok: true, text: output });
  });

  it.each<[Indent, string]>([
    ["2", "function f() {\n  return 1;\n}\n"],
    ["4", "function f() {\n    return 1;\n}\n"],
    ["tab", "function f() {\n\treturn 1;\n}\n"],
  ])("indents with %s", async (indent, output) => {
    expect(await formatCode("function f(){return 1}", "javascript", "beautify", indent)).toEqual({ ok: true, text: output });
  });

  it("indents SQL with tabs", async () => {
    expect(await formatCode("select a from t", "sql", "beautify", "tab")).toEqual({ ok: true, text: "SELECT\n\ta\nFROM\n\tt\n" });
  });

  it("refuses JavaScript that does not parse, saying where", async () => {
    expect(await formatCode("const a = {b:1", "javascript", "beautify", "2")).toEqual({
      ok: false,
      error: { reason: "invalid", line: 1, column: 15, message: 'Unexpected token, expected ","' },
    });
  });

  it.each<[string, Language, string, Partial<FormatError>]>([
    ["CSS with an unclosed block", "css", "a {\n  color: red", { line: 1, column: 1, message: "Unclosed block" }],
    [
      "HTML closing a tag that is not open",
      "html",
      "<div><span></div>",
      {
        line: 1,
        column: 12,
        message: 'Unexpected closing tag "div". It may happen when the tag has already been closed by another tag.',
      },
    ],
    ["XML with a tag left open", "xml", "<a><b></a>", {}],
    ["SQL with an unclosed bracket", "sql", "SELECT a FROM (b", { line: 1, column: 17, message: "Parse error at token: «EOF»" }],
    ["SQL with an unclosed string", "sql", "SELECT 'abc", { line: 1, column: 8, message: "Parse error: Unexpected \"'abc\"" }],
  ])("refuses %s", async (_name, language, input, error) => {
    const result = await formatCode(input, language, "beautify", "2");
    expect(result).toMatchObject({ ok: false, error: { reason: "invalid", ...error } });
    expect(result.ok === false && result.error.reason === "invalid" && result.error.message).toBeTruthy();
  });

  it.each(["", "  \n\t "])("has nothing to format in %j", async (text) => {
    expect(await formatCode(text, "javascript", "beautify", "2")).toEqual({ ok: false, error: { reason: "empty" } });
  });

  it("keeps Unicode as it is", async () => {
    expect(await formatCode('const s="Xin chào 👋",t=`日本`', "javascript", "beautify", "2")).toEqual({
      ok: true,
      text: 'const s = "Xin chào 👋",\n  t = `日本`;\n',
    });
    expect(await formatCode("<p>Tiếng Việt 🎉</p>", "html", "beautify", "2")).toEqual({ ok: true, text: "<p>Tiếng Việt 🎉</p>\n" });
  });

  it("formats a large Input", async () => {
    const input = Array.from({ length: 5000 }, (_, i) => `.c${i}{color:red;margin:${i}px}`).join("");
    const result = await formatCode(input, "css", "beautify", "2");
    expect(result.ok && result.text.split("\n")).toHaveLength(5000 * 4 + 1);
  });
});
