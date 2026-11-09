import { describe, expect, it } from "vitest";
import { convert, EscapeError } from "./logic";
import { punycodeDecode, punycodeEncode } from "./punycode";

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

describe("Punycode (RFC 3492)", () => {
  const cp = (...codePoints: number[]) => String.fromCodePoint(...codePoints);
  // RFC 3492 §7.1 sample strings: Unicode → Punycode, case of basic code points kept.
  const vectors: [string, string, string][] = [
    ["A Arabic (Egyptian)", cp(0x644, 0x64a, 0x647, 0x645, 0x627, 0x628, 0x62a, 0x643, 0x644, 0x645, 0x648, 0x634, 0x639, 0x631, 0x628, 0x64a, 0x61f), "egbpdaj6bu4bxfgehfvwxn"],
    ["B Chinese (simplified)", cp(0x4ed6, 0x4eec, 0x4e3a, 0x4ec0, 0x4e48, 0x4e0d, 0x8bf4, 0x4e2d, 0x6587), "ihqwcrb4cv8a8dqg056pqjye"],
    ["C Chinese (traditional)", cp(0x4ed6, 0x5011, 0x7232, 0x4ec0, 0x9ebd, 0x4e0d, 0x8aaa, 0x4e2d, 0x6587), "ihqwctvzc91f659drss3x8bo0yb"],
    ["D Czech", "Pročprostěnemluvíčesky", "Proprostnemluvesky-uyb24dma41a"],
    ["J Spanish", "PorquénopuedensimplementehablarenEspañol", "PorqunopuedensimplementehablarenEspaol-fmd56a"],
    ["K Vietnamese", "TạisaohọkhôngthểchỉnóitiếngViệt", "TisaohkhngthchnitingVit-kjcr8268qyxafd2f1b9g"],
    ["L 3年B組金八先生", cp(0x33, 0x5e74, 0x42, 0x7d44, 0x91d1, 0x516b, 0x5148, 0x751f), "3B-ww4c5e180e575a65lsy2b"],
    ["O ひとつ屋根の下2", cp(0x3072, 0x3068, 0x3064, 0x5c4b, 0x6839, 0x306e, 0x4e0b, 0x32), "2-u9tlzr9756bt3uc0v"],
    ["R そのスピードで", cp(0x305d, 0x306e, 0x30b9, 0x30d4, 0x30fc, 0x30c9, 0x3067), "d9juau41awczczp"],
    ["S all basic", "-> $1.00 <-", "-> $1.00 <--"],
  ];

  it.each(vectors)("encodes and decodes %s", (_, unicode, encoded) => {
    expect(punycodeEncode(unicode)).toBe(encoded);
    expect(punycodeDecode(encoded)).toBe(unicode);
  });

  it("decodes digits in either case", () => {
    expect(punycodeDecode("IHQWCRB4CV8A8DQG056PQJYE")).toBe(cp(0x4ed6, 0x4eec, 0x4e3a, 0x4ec0, 0x4e48, 0x4e0d, 0x8bf4, 0x4e2d, 0x6587));
  });

  it("rejects text that is not Punycode", () => {
    expect(() => punycodeDecode("abc-!")).toThrow(RangeError);
    expect(() => punycodeDecode("é-abc")).toThrow(RangeError);
    expect(() => punycodeDecode("99999999999999a")).toThrow(RangeError);
  });
});

describe("Punycode domains", () => {
  it("encodes each label that is not ASCII, lowercase, with the xn-- prefix", () => {
    expect(convert("münchen.de", "punycode", "escape")).toBe("xn--mnchen-3ya.de");
    expect(convert("MÜNCHEN.DE", "punycode", "escape")).toBe("xn--mnchen-3ya.de");
    expect(convert("tiếngviệt.vn", "punycode", "escape")).toBe("xn--tingvit-5t4cyc.vn");
    expect(convert("😀.ws", "punycode", "escape")).toBe("xn--e28h.ws");
    expect(convert("例え。jp", "punycode", "escape")).toBe("xn--r8jz45g.jp");
  });

  it("decodes each xn-- label, leaving the others as they are", () => {
    expect(convert("xn--mnchen-3ya.de", "punycode", "unescape")).toBe("münchen.de");
    expect(convert("XN--MNCHEN-3YA.DE", "punycode", "unescape")).toBe("münchen.DE");
    expect(convert("www.xn--tingvit-5t4cyc.vn", "punycode", "unescape")).toBe("www.tiếngviệt.vn");
  });

  it("converts one domain per line, ignoring spaces around it", () => {
    expect(convert("  münchen.de \nexample.com\n日本語.jp", "punycode", "escape")).toBe("xn--mnchen-3ya.de\nexample.com\nxn--wgv71a119e.jp");
  });

  it("round-trips a domain", () => {
    expect(convert(convert("bücher.tiếngviệt.example", "punycode", "escape"), "punycode", "unescape")).toBe("bücher.tiếngviệt.example");
  });

  it("rejects an xn-- label that is not Punycode", () => {
    expect(failure(() => convert("a.xn--mnchen-3y!.de", "punycode", "unescape"))).toEqual({
      reason: "invalid-punycode",
      sequence: "xn--mnchen-3y!",
    });
  });

  it("rejects a label longer than 63 characters once encoded", () => {
    const long = "ü".repeat(60);
    expect(failure(() => convert(`${long}.de`, "punycode", "escape"))).toEqual({ reason: "label-too-long", sequence: long });
  });

  it("rejects one huge label at once, without encoding it", () => {
    const huge = "Tiếng Việt có dấu ".repeat(60_000);
    expect(failure(() => convert(huge, "punycode", "escape")).reason).toBe("label-too-long");
  });

  it("handles empty and large Input", () => {
    expect(convert("", "punycode", "escape")).toBe("");
    expect(convert("", "punycode", "unescape")).toBe("");
    const many = Array(20_000).fill("münchen.de").join("\n");
    expect(convert(convert(many, "punycode", "escape"), "punycode", "unescape")).toBe(many);
  });
});
