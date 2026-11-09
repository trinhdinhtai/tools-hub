import { describe, expect, it } from "vitest";
import { convert, EscapeError } from "./logic";

/** The reason and offending sequence of the `EscapeError` that `run` throws. */
function failure(run: () => unknown): { reason: string; sequence: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof EscapeError) return { reason: error.reason, sequence: error.sequence };
    throw error;
  }
  throw new Error("expected an EscapeError");
}

describe("HTML", () => {
  it("escapes the characters that are special in HTML text and attributes", () => {
    expect(convert(`<a href="x?a=1&b='2'">Tôi & bạn</a>`, "html", "escape")).toBe(
      "&lt;a href=&quot;x?a=1&amp;b=&#39;2&#39;&quot;&gt;Tôi &amp; bạn&lt;/a&gt;",
    );
  });

  it("unescapes named, decimal and hex entities", () => {
    expect(convert("&lt;p&gt; &copy; &NotEqualTilde; &#8364; &#x1F600; &#X41;", "html", "unescape")).toBe("<p> © ≂̸ € 😀 A");
  });

  it("round-trips any text", () => {
    const text = `<script>alert("x & 'y'")</script> Tiếng Việt 😀`;
    expect(convert(convert(text, "html", "escape"), "html", "unescape")).toBe(text);
  });

  it("leaves an ampersand that starts no entity as it is", () => {
    expect(convert("a & b &; &#; R&D", "html", "unescape")).toBe("a & b &; &#; R&D");
  });

  it("rejects an entity name it does not know", () => {
    expect(failure(() => convert("x &nope; y", "html", "unescape"))).toEqual({ reason: "unknown-entity", sequence: "&nope;" });
  });

  it("rejects a numeric entity outside Unicode, a surrogate or NUL", () => {
    expect(failure(() => convert("&#x110000;", "html", "unescape"))).toEqual({ reason: "invalid-code-point", sequence: "&#x110000;" });
    expect(failure(() => convert("&#55296;", "html", "unescape"))).toEqual({ reason: "invalid-code-point", sequence: "&#55296;" });
    expect(failure(() => convert("&#0;", "html", "unescape"))).toEqual({ reason: "invalid-code-point", sequence: "&#0;" });
  });

  it("handles empty and large Input", () => {
    expect(convert("", "html", "escape")).toBe("");
    expect(convert("", "html", "unescape")).toBe("");
    const big = "<b>&</b>".repeat(100_000);
    expect(convert(convert(big, "html", "escape"), "html", "unescape")).toBe(big);
  });
});

describe("Backslash", () => {
  it("escapes backslashes, double quotes and control characters, leaving other text as it is", () => {
    expect(convert('say "hi"\\\n\r\t\b\f\v\0\u0001\u007f Việt 😀', "backslash", "escape")).toBe(
      'say \\"hi\\"\\\\\\n\\r\\t\\b\\f\\u000b\\u0000\\u0001\\u007f Việt 😀',
    );
  });

  it("gives a string literal that JSON reads back", () => {
    const text = 'a "quote" \\ back\nslash\t\v\0\u0001\u001f\b\f\r';
    expect(JSON.parse(`"${convert(text, "backslash", "escape")}"`)).toBe(text);
  });

  it("unescapes every JavaScript string escape", () => {
    expect(convert("\\n\\r\\t\\b\\f\\v\\0\\\\\\\"\\'\\/\\x41\\u00e9\\u{1F600}\\uD83D\\uDE00", "backslash", "unescape")).toBe(
      "\n\r\t\b\f\v\0\\\"'/Aé😀😀",
    );
  });

  it("round-trips any text", () => {
    const text = 'line 1\nline "2"\t\\ end\u0007 Tiếng Việt 😀';
    expect(convert(convert(text, "backslash", "escape"), "backslash", "unescape")).toBe(text);
  });

  it("rejects an escape it does not know", () => {
    expect(failure(() => convert("C:\\q", "backslash", "unescape"))).toEqual({ reason: "unknown-escape", sequence: "\\q" });
  });

  it("rejects an escape cut short", () => {
    expect(failure(() => convert("a\\x4", "backslash", "unescape"))).toEqual({ reason: "incomplete-escape", sequence: "\\x4" });
    expect(failure(() => convert("\\u12g4", "backslash", "unescape"))).toEqual({ reason: "incomplete-escape", sequence: "\\u12g" });
    expect(failure(() => convert("\\u{12", "backslash", "unescape"))).toEqual({ reason: "incomplete-escape", sequence: "\\u{12" });
    expect(failure(() => convert("end\\", "backslash", "unescape"))).toEqual({ reason: "incomplete-escape", sequence: "\\" });
  });

  it("rejects a code point past U+10FFFF", () => {
    expect(failure(() => convert("\\u{110000}", "backslash", "unescape"))).toEqual({
      reason: "invalid-code-point",
      sequence: "\\u{110000}",
    });
  });

  it("handles empty and large Input", () => {
    expect(convert("", "backslash", "escape")).toBe("");
    expect(convert("", "backslash", "unescape")).toBe("");
    const big = 'x"\n\\'.repeat(100_000);
    expect(convert(convert(big, "backslash", "escape"), "backslash", "unescape")).toBe(big);
  });
});

describe("Unicode", () => {
  it("escapes every non-ASCII character as \\uHHHH, characters past U+FFFF as a surrogate pair", () => {
    expect(convert("Tiếng Việt\n😀 ©", "unicode", "escape")).toBe("Ti\\u1ebfng Vi\\u1ec7t\n\\ud83d\\ude00 \\u00a9");
  });

  it("unescapes \\uHHHH and \\u{H…}, leaving other backslashes as they are", () => {
    expect(convert("Ti\\u1EBFng \\u{1F600}\\ud83d\\ude00 C:\\temp\\n", "unicode", "unescape")).toBe("Tiếng 😀😀 C:\\temp\\n");
  });

  it("round-trips any text", () => {
    const text = "日本語 Tiếng Việt 😀 \\ plain";
    expect(convert(convert(text, "unicode", "escape"), "unicode", "unescape")).toBe(text);
  });

  it("rejects a \\u escape cut short or past U+10FFFF", () => {
    expect(failure(() => convert("x\\u00e", "unicode", "unescape"))).toEqual({ reason: "incomplete-escape", sequence: "\\u00e" });
    expect(failure(() => convert("\\u{}", "unicode", "unescape"))).toEqual({ reason: "incomplete-escape", sequence: "\\u{}" });
    expect(failure(() => convert("\\u{FFFFFF}", "unicode", "unescape"))).toEqual({
      reason: "invalid-code-point",
      sequence: "\\u{FFFFFF}",
    });
  });

  it("handles empty and large Input", () => {
    expect(convert("", "unicode", "escape")).toBe("");
    expect(convert("", "unicode", "unescape")).toBe("");
    const big = "ă😀a".repeat(100_000);
    expect(convert(convert(big, "unicode", "escape"), "unicode", "unescape")).toBe(big);
  });
});

describe("Hex", () => {
  it("escapes every UTF-8 byte as \\xHH", () => {
    expect(convert("Hi é😀", "hex", "escape")).toBe("\\x48\\x69\\x20\\xc3\\xa9\\xf0\\x9f\\x98\\x80");
  });

  it("unescapes \\xHH bytes as UTF-8, characters between them as they are", () => {
    expect(convert("\\x48\\x69 \\xC3\\xA9 \\xe1\\xba\\xbf!", "hex", "unescape")).toBe("Hi é ế!");
  });

  it("round-trips any text", () => {
    const text = "Tiếng Việt 😀 \\ \n end";
    expect(convert(convert(text, "hex", "escape"), "hex", "unescape")).toBe(text);
  });

  it("rejects a \\x escape cut short", () => {
    expect(failure(() => convert("\\x4", "hex", "unescape"))).toEqual({ reason: "incomplete-escape", sequence: "\\x4" });
    expect(failure(() => convert("\\xzz", "hex", "unescape"))).toEqual({ reason: "incomplete-escape", sequence: "\\xz" });
  });

  it("rejects bytes that are not UTF-8", () => {
    expect(failure(() => convert("\\xc3\\x28", "hex", "unescape"))).toEqual({ reason: "not-utf8", sequence: "" });
    expect(failure(() => convert("ab\\xff", "hex", "unescape"))).toEqual({ reason: "not-utf8", sequence: "" });
  });

  it("handles empty and large Input", () => {
    expect(convert("", "hex", "escape")).toBe("");
    expect(convert("", "hex", "unescape")).toBe("");
    const big = "aế😀".repeat(50_000);
    expect(convert(convert(big, "hex", "escape"), "hex", "unescape")).toBe(big);
    const plain = "ế".repeat(1_000_000);
    expect(convert(plain, "hex", "unescape")).toBe(plain);
  });
});
