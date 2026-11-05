import { describe, expect, it } from "vitest";
import { DecodeError, decodeBytes, detectPaste, encodeBytes, encodeDataUri, fileExtension, isDataUri, parseDataUri } from "./logic";

const ascii = (text: string) => new TextEncoder().encode(text);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("encodeBytes", () => {
  it("encodes bytes that are not text, in every alphabet", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x3f]);
    expect(text(encodeBytes(bytes, "standard"))).toBe("//4AgD8=");
    expect(text(encodeBytes(bytes, "url-safe"))).toBe("__4AgD8");
    expect(text(encodeBytes(bytes, "base32"))).toBe("777ABAB7");
  });

  it("matches RFC 4648 across chunk boundaries", () => {
    expect(text(encodeBytes(ascii("foobar"), "standard"))).toBe("Zm9vYmFy");
    expect(text(encodeBytes(ascii("foobar"), "base32"))).toBe("MZXW6YTBOI======");
  });
});

describe("decodeBytes", () => {
  const bytes = [0xff, 0xfe, 0x00, 0x80, 0x3f];

  it("decodes to bytes that are not text, in every alphabet", () => {
    expect([...decodeBytes("//4AgD8=", "standard")]).toEqual(bytes);
    expect([...decodeBytes("__4AgD8", "url-safe")]).toEqual(bytes);
    expect([...decodeBytes("777abab7", "base32")]).toEqual(bytes);
  });

  it("round-trips every byte value", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (const variant of ["standard", "url-safe", "base32"] as const) {
      expect(decodeBytes(text(encodeBytes(all, variant)), variant)).toEqual(all);
    }
  });

  it("says why it cannot decode", () => {
    expect(() => decodeBytes("Zm9v!A==", "standard")).toThrow(new DecodeError("invalid-character"));
    expect(() => decodeBytes("Zm9vY", "standard")).toThrow(new DecodeError("invalid-length"));
  });
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("parseDataUri", () => {
  it("splits out the MIME type and decodes the Base64 data", () => {
    const uri = parseDataUri("data:image/png;base64,iVBORw0KGgo=");
    expect(uri?.mime).toBe("image/png");
    expect([...uri!.bytes]).toEqual(PNG_SIGNATURE);
  });

  it("ignores case, parameters and line breaks", () => {
    const uri = parseDataUri("  DATA:Text/HTML;charset=utf-8;BASE64,PG\nI+\n");
    expect(uri?.mime).toBe("text/html");
    expect(text(uri!.bytes)).toBe("<b>");
  });

  it("decodes percent-encoded data, defaulting to text/plain", () => {
    const uri = parseDataUri("data:,Hello%2C%20World%21");
    expect(uri?.mime).toBe("text/plain");
    expect(text(uri!.bytes)).toBe("Hello, World!");
  });

  it.each(["Zm9vYmFy", "", "https://example.com", "data:image/png;base64"])("is null for %j, which is not a data URI", (input) => {
    expect(parseDataUri(input)).toBeNull();
  });

  it("rejects malformed Base64 data", () => {
    expect(() => parseDataUri("data:image/png;base64,iVBO!w0K")).toThrow(new DecodeError("invalid-character"));
  });
});

describe("encodeDataUri", () => {
  it("builds a data URI from a file's bytes and type", () => {
    expect(text(encodeDataUri(new Uint8Array(PNG_SIGNATURE), "image/png"))).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  it("falls back to application/octet-stream when the type is unknown", () => {
    expect(text(encodeDataUri(ascii("foo"), ""))).toBe("data:application/octet-stream;base64,Zm9v");
  });
});

describe("fileExtension", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/svg+xml", "svg"],
    ["application/pdf", "pdf"],
    ["text/plain", "txt"],
    ["application/x-unknown", "bin"],
  ])("names a %s file *.%s", (mime, extension) => {
    expect(fileExtension(mime)).toBe(extension);
  });
});

describe("Paste Detection of data URIs", () => {
  it("recognises a data URI", () => {
    expect(isDataUri("  data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isDataUri("Zm9vYmFy")).toBe(false);
  });

  it("scores a data URI that decodes", () => {
    expect(detectPaste("data:image/png;base64,iVBORw0KGgo=")).toBeGreaterThan(0.8);
  });

  it("scores 0 for a data URI whose Base64 is malformed", () => {
    expect(detectPaste("data:image/png;base64,iVBO!w0K")).toBe(0);
  });
});
