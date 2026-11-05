import { describe, expect, it } from "vitest";
import { decode, detectPaste, encode } from "./logic";

// RFC 4648 §10 test vectors
const RFC_VECTORS: [string, string][] = [
  ["", ""],
  ["f", "Zg=="],
  ["fo", "Zm8="],
  ["foo", "Zm9v"],
  ["foob", "Zm9vYg=="],
  ["fooba", "Zm9vYmE="],
  ["foobar", "Zm9vYmFy"],
];

describe("Base64 standard", () => {
  it.each(RFC_VECTORS)("encodes %j as %j", (input, expected) => {
    expect(encode(input, "standard")).toBe(expected);
  });
});

describe("Base64 standard decode", () => {
  it.each(RFC_VECTORS)("decodes %j from %j", (expected, input) => {
    expect(decode(input, "standard")).toBe(expected);
  });

  it("round-trips Unicode text", () => {
    const text = "Xin chào thế giới 👋 — ✓";
    expect(decode(encode(text, "standard"), "standard")).toBe(text);
  });

  it("knows the Base64 of Vietnamese text", () => {
    expect(encode("Tiếng Việt", "standard")).toBe("VGnhur9uZyBWaeG7h3Q=");
  });

  it("ignores surrounding whitespace and line breaks", () => {
    expect(decode("  Zm9v\nYmFy\r\n", "standard")).toBe("foobar");
  });

  it.each(["Zm9v!", "Zm9vY", "Z===", "Zm=9v"])("rejects malformed input %j", (input) => {
    expect(() => decode(input, "standard")).toThrow();
  });

  it("rejects bytes that are not UTF-8 text", () => {
    expect(() => decode("/w==", "standard")).toThrow();
  });
});

describe("Base64 URL-safe", () => {
  it("uses - and _ and drops padding", () => {
    expect(encode("<<???>>", "url-safe")).toBe("PDw_Pz8-Pg");
  });

  it("decodes with or without padding", () => {
    expect(decode("PDw_Pz8-Pg", "url-safe")).toBe("<<???>>");
    expect(decode("PDw_Pz8-Pg==", "url-safe")).toBe("<<???>>");
  });

  it("rejects the standard-only characters", () => {
    expect(() => decode("PDw/Pz8+Pg==", "url-safe")).toThrow();
  });

  it("round-trips Unicode text", () => {
    const text = "đường dẫn?a=1&b=2 🚀";
    expect(decode(encode(text, "url-safe"), "url-safe")).toBe(text);
  });
});

// RFC 4648 §10 test vectors
const RFC_BASE32_VECTORS: [string, string][] = [
  ["", ""],
  ["f", "MY======"],
  ["fo", "MZXQ===="],
  ["foo", "MZXW6==="],
  ["foob", "MZXW6YQ="],
  ["fooba", "MZXW6YTB"],
  ["foobar", "MZXW6YTBOI======"],
];

describe("Base32", () => {
  it.each(RFC_BASE32_VECTORS)("encodes %j as %j", (input, expected) => {
    expect(encode(input, "base32")).toBe(expected);
  });

  it.each(RFC_BASE32_VECTORS)("decodes %j from %j", (expected, input) => {
    expect(decode(input, "base32")).toBe(expected);
  });

  it("accepts lowercase and missing padding", () => {
    expect(decode("mzxw6ytboi", "base32")).toBe("foobar");
  });

  it("round-trips Unicode text", () => {
    const text = "Mã hoá Base32 ✓";
    expect(decode(encode(text, "base32"), "base32")).toBe(text);
  });

  it.each(["MZXW1===", "MZXW6YTBO", "M=======", "MY==============", "MZXW6YQ========="])("rejects malformed input %j", (input) => {
    expect(() => decode(input, "base32")).toThrow();
  });
});

describe("detectPaste", () => {
  it.each([
    "SGVsbG8sIHdvcmxkIQ==",
    "VGnhur9uZyBWaeG7h3Q=",
    "eyJ1c2VyIjoiYWxpY2UiLCJyb2xlIjoiYWRtaW4ifQ",
    "  Zm9vYmFyYmF6\n",
  ])("scores valid Base64 %j above 0", (text) => {
    expect(detectPaste(text)).toBeGreaterThan(0);
  });

  it.each([
    "",
    "hello",
    "Hello world, this is plain text.",
    "password",
    "Xin chào thế giới",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl",
    "https://example.com/path?q=1",
    "deadbeefcafebabe0123456789abcdef",
    "1700000000",
    '{"a": 1}',
  ])("scores non-Base64 text %j as 0", (text) => {
    expect(detectPaste(text)).toBe(0);
  });

  it("never scores above 1", () => {
    expect(detectPaste(encode("a fairly long sentence of plain English text", "standard"))).toBeLessThanOrEqual(1);
  });
});
