import { describe, expect, it } from "vitest";
import { detectLanguage, formatCode, type FormatError, type Indent, type Language } from "./logic";

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

describe("formatCode: minify", () => {
  it("minifies JavaScript without renaming what other code can see", async () => {
    const input = "// add\nfunction add(first, second) {\n  const sum = first + second;\n  return sum;\n}\nconsole.log(add(1, 2));\n";
    expect(await formatCode(input, "javascript", "minify", "2")).toEqual({
      ok: true,
      text: "function add(d,n){return d+n}console.log(add(1,2));",
    });
  });

  it("minifies CSS", async () => {
    expect(await formatCode("/* c */\na {\n  color: #ff0000;\n  margin: 0px 0px;\n}\n", "css", "minify", "2")).toEqual({
      ok: true,
      text: "a{color:red;margin:0}",
    });
  });

  it("minifies HTML, keeping the spaces that show and what is preformatted", async () => {
    const input = [
      "<!DOCTYPE html>",
      "<html>",
      "  <head>",
      "    <title> Hi </title>",
      "  </head>",
      "  <body>",
      "    <!-- note -->",
      '    <p   class="a   b"  >Hello   <b>world</b> !</p>',
      "    <span>a</span>",
      "    <span>b</span>",
      "    <pre>  keep",
      "   this </pre>",
      "    <textarea>  and\n  this</textarea>",
      "  </body>",
      "</html>",
      "",
    ].join("\n");
    expect(await formatCode(input, "html", "minify", "2")).toEqual({
      ok: true,
      text:
        '<!DOCTYPE html><html><head><title>Hi</title></head><body><p class="a   b">Hello <b>world</b> !</p>' +
        "<span>a</span> <span>b</span><pre>  keep\n   this </pre><textarea>  and\n  this</textarea></body></html>",
    });
  });

  it("minifies the CSS and JavaScript inside HTML, and leaves other scripts as they are", async () => {
    const input = [
      "<style>",
      "  a { color: #ff0000; }",
      "</style>",
      "<script>",
      "  var total = 1 + 2;",
      "</script>",
      '<script type="application/ld+json">',
      '  { "a": 1 }',
      "</script>",
    ].join("\n");
    expect(await formatCode(input, "html", "minify", "2")).toEqual({
      ok: true,
      text: '<style>a{color:red}</style><script>var total=3;</script><script type="application/ld+json">{ "a": 1 }</script>',
    });
  });

  it("leaves what is quoted in a tag, and a script it cannot read, as they are", async () => {
    const input = "<a  title = \"a > b = c\"\n  href='x' >go</a>\n<script>\n  if (</script>";
    expect(await formatCode(input, "html", "minify", "2")).toEqual({
      ok: true,
      text: "<a title=\"a > b = c\" href='x'>go</a><script>if (</script>",
    });
  });

  it("minifies XML, keeping text, CDATA and processing instructions", async () => {
    const input = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<!-- c -->",
      '<root a = "1"',
      "      b='x  y'>",
      "  <item>  text  </item>",
      "  <![CDATA[ <raw>  ]]>",
      "  <empty />",
      "</root>",
      "",
    ].join("\n");
    expect(await formatCode(input, "xml", "minify", "2")).toEqual({
      ok: true,
      text: `<?xml version="1.0" encoding="UTF-8"?><root a="1" b='x  y'><item>  text  </item><![CDATA[ <raw>  ]]><empty/></root>`,
    });
  });

  it("minifies SQL, keeping strings and quoted names", async () => {
    const input = [
      "SELECT a ,  \"my  col\"",
      "FROM t -- the table",
      "WHERE x = 'a  b -- not a comment' /* c */",
      "  AND y IN ( 1 , 2 )",
      "  AND z = 'it''s' ;",
    ].join("\n");
    expect(await formatCode(input, "sql", "minify", "2")).toEqual({
      ok: true,
      text: `SELECT a,"my  col" FROM t WHERE x='a  b -- not a comment' AND y IN(1,2) AND z='it''s';`,
    });
  });

  it.each<[string, string, string]>([
    ["a space between words in mixed content", "<p><b>a</b> <i>b</i></p>", "<p><b>a</b> <i>b</i></p>"],
    ["whitespace under xml:space=preserve", '<r>\n  <t xml:space="preserve">\n  <a/> </t>\n</r>', '<r><t xml:space="preserve">\n  <a/> </t></r>'],
  ])("keeps %s in XML", async (_name, input, output) => {
    expect(await formatCode(input, "xml", "minify", "2")).toEqual({ ok: true, text: output });
  });

  it("keeps HTML conditional comments", async () => {
    const input = "<div>\n  <!--[if IE]><p>IE</p><![endif]-->\n  <!-- gone -->\n</div>";
    expect(await formatCode(input, "html", "minify", "2")).toEqual({
      ok: true,
      text: "<div><!--[if IE]><p>IE</p><![endif]--></div>",
    });
  });

  it("keeps SQL optimizer hints and MySQL version comments", async () => {
    expect(await formatCode("SELECT /*+ INDEX(t i) */ a\nFROM t /* gone */", "sql", "minify", "2")).toEqual({
      ok: true,
      text: "SELECT /*+ INDEX(t i) */ a FROM t",
    });
  });

  it("keeps the line break between strings PostgreSQL joins", async () => {
    expect(await formatCode("SELECT 'a'\n  'b' AS x", "sql", "minify", "2")).toEqual({ ok: true, text: "SELECT 'a'\n'b' AS x" });
  });

  it.each<[string, string, string]>([
    ["PostgreSQL parameters", "SELECT a FROM t WHERE id = $1", "SELECT a FROM t WHERE id=$1"],
    ["MySQL backticks", "SELECT `my col` FROM `t`", "SELECT `my col` FROM `t`"],
    ["T-SQL brackets", "SELECT [my col] FROM [t]", "SELECT [my col] FROM [t]"],
  ])("accepts %s", async (_name, input, minified) => {
    expect(await formatCode(input, "sql", "beautify", "2")).toMatchObject({ ok: true });
    expect(await formatCode(input, "sql", "minify", "2")).toEqual({ ok: true, text: minified });
  });

  it("never joins a minus sign onto the next one, which would start a comment", async () => {
    expect(await formatCode("SELECT 1 - -1", "sql", "minify", "2")).toEqual({ ok: true, text: "SELECT 1 - -1" });
  });

  it.each<[Language, string]>([
    ["javascript", "const a = {b:1"],
    ["css", "a { color: red"],
    ["html", "<div><span></div>"],
    ["sql", "SELECT a FROM (b"],
  ])("refuses %s that does not parse", async (language, input) => {
    expect(await formatCode(input, language, "minify", "2")).toMatchObject({ ok: false, error: { reason: "invalid", line: 1 } });
  });

  it("refuses XML that does not parse", async () => {
    expect(await formatCode("<a><b></a>", "xml", "minify", "2")).toMatchObject({ ok: false, error: { reason: "invalid" } });
  });

  it("keeps Unicode as it is", async () => {
    expect(await formatCode("<p>  Tiếng   Việt 🎉 </p>", "html", "minify", "2")).toEqual({ ok: true, text: "<p>Tiếng Việt 🎉</p>" });
    expect(await formatCode("SELECT 'chào  👋'  AS  \"tên\"", "sql", "minify", "2")).toEqual({
      ok: true,
      text: `SELECT 'chào  👋' AS "tên"`,
    });
  });

  it("minifies a large Input", async () => {
    const input = Array.from({ length: 5000 }, (_, i) => `<item id="${i}">\n  <name> n${i} </name>\n</item>`).join("\n");
    const result = await formatCode(`<list>${input}</list>`, "xml", "minify", "2");
    expect(result.ok && result.text).toBe(
      `<list>${Array.from({ length: 5000 }, (_, i) => `<item id="${i}"><name> n${i} </name></item>`).join("")}</list>`,
    );
  });
});

describe("detectLanguage", () => {
  it.each<[string, Language]>([
    ["<!DOCTYPE html><html><body></body></html>", "html"],
    ["  <div class=\"a\"><p>hi</p></div>", "html"],
    ["<template><slot></slot></template>", "html"],
    ['<?xml version="1.0"?><root/>', "xml"],
    ["<note><to>Tove</to><from>Jani</from></note>", "xml"],
    ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>', "xml"],
    ["select * from users where id = 1", "sql"],
    ["﻿SELECT 1", "sql"],
    ["-- users\nINSERT INTO t (a) VALUES (1);", "sql"],
    ["WITH x AS (SELECT 1) SELECT * FROM x", "sql"],
    ["CREATE TABLE t (id INT PRIMARY KEY)", "sql"],
    ["body { margin: 0; }", "css"],
    [".a > .b:hover, #c::before { color: red }", "css"],
    ["@media (max-width: 600px) { a { color: red } }", "css"],
    [":root { --gap: 4px; }", "css"],
    ["a { color: var(--c); }", "css"],
    ['a[href^="http"]:not(.x) { content: "return"; }', "css"],
    ["switch (x) { case 1: break; }", "javascript"],
    ["const o = { a: 1 }", "javascript"],
    ["const a = 1;", "javascript"],
    ["function f() { return { a: 1 }; }", "javascript"],
    ["import x from 'y'\nexport default x", "javascript"],
    ["document.querySelector('a').addEventListener('click', () => {})", "javascript"],
    ["if (a) { b = c; }", "javascript"],
    ["// Tiếng Việt 👋\nlet s = 'chào'", "javascript"],
  ])("tells %j is %s", (text, language) => {
    expect(detectLanguage(text)).toBe(language);
  });

  it.each(["", "   ", "hello world", "Xin chào các bạn", "12345"])("has no language for %j", (text) => {
    expect(detectLanguage(text)).toBeNull();
  });

  it("is quick on a large Input", () => {
    const text = `${"a { color: red; }\n".repeat(50_000)}`;
    const start = performance.now();
    expect(detectLanguage(text)).toBe("css");
    expect(performance.now() - start).toBeLessThan(200);
  });
});
