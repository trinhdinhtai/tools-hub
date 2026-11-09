import { describe, expect, it } from "vitest";
import { decodeJwt, detectPaste, JwtError, timeClaims, tokenStatus } from "./logic";

// The jwt.io sample token, signed with HS256 and the secret "your-256-bit-secret".
const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

/** Base64url of bytes, or of a text's UTF-8, without padding. */
function b64url(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("decodeJwt", () => {
  it("decodes the header and payload of a signed token", () => {
    const decoded = decodeJwt(SAMPLE);
    expect(decoded.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decoded.payload).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
    expect(decoded.signature).toBe("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
  });

  const reason = (text: string) => {
    try {
      decodeJwt(text);
    } catch (error) {
      if (error instanceof JwtError) return { reason: error.reason, part: error.part };
      throw error;
    }
    return null;
  };

  it("refuses an empty Input and one that is not three parts", () => {
    expect(reason("")).toEqual({ reason: "empty", part: undefined });
    expect(reason("  \n ")).toEqual({ reason: "empty", part: undefined });
    expect(reason("hello")).toEqual({ reason: "parts", part: undefined });
    expect(reason("a.b")).toEqual({ reason: "parts", part: undefined });
    expect(reason("a.b.c.d")).toEqual({ reason: "parts", part: undefined });
  });

  it("names the part that is not base64url, not UTF-8, not JSON or not a JSON object", () => {
    const good = b64url('{"alg":"none"}');
    expect(reason(`${good}.ab+c.sig`)).toEqual({ reason: "base64", part: "payload" });
    expect(reason(`a.${good}.sig`)).toEqual({ reason: "base64", part: "header" });
    expect(reason(`${b64url(new Uint8Array([0xff, 0xfe, 0x7b]))}.${good}.`)).toEqual({ reason: "utf8", part: "header" });
    expect(reason(`${good}.${b64url("{not json")}.`)).toEqual({ reason: "json", part: "payload" });
    expect(reason(`${good}.${b64url("[1,2]")}.`)).toEqual({ reason: "not-object", part: "payload" });
    expect(reason(`${b64url("null")}.${good}.`)).toEqual({ reason: "not-object", part: "header" });
    expect(reason(`${good}.${good}.sig/nature`)).toEqual({ reason: "base64", part: "signature" });
  });

  it("reads Unicode claims, an unsigned token and a large payload", () => {
    const header = b64url('{"alg":"none"}');
    expect(decodeJwt(`${header}.${b64url('{"name":"Trịnh Đình Tài 🚀"}')}.`)).toEqual({
      header: { alg: "none" },
      payload: { name: "Trịnh Đình Tài 🚀" },
      signature: "",
    });
    const big = "x".repeat(1_000_000);
    expect(decodeJwt(`${header}.${b64url(JSON.stringify({ big }))}.`).payload).toEqual({ big });
  });

  it("takes a token pasted after Bearer or wrapped over several lines", () => {
    expect(decodeJwt(`Bearer ${SAMPLE}`).header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(decodeJwt(`authorization: bearer ${SAMPLE}`).header).toEqual({ alg: "HS256", typ: "JWT" });
    const wrapped = `${SAMPLE.slice(0, 40)}\n${SAMPLE.slice(40, 90)}\r\n  ${SAMPLE.slice(90)}\n`;
    expect(decodeJwt(wrapped).payload).toEqual({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
  });

  it("refuses words after the token rather than gluing them onto the signature", () => {
    expect(reason(`${SAMPLE} and some words`)).toEqual({ reason: "whitespace", part: undefined });
    expect(reason(`Bearer ${SAMPLE.slice(0, 30)} ${SAMPLE.slice(30)}`)).toEqual({ reason: "whitespace", part: undefined });
  });

  it("refuses a character outside base64url, such as one in another script", () => {
    expect(reason(`${b64url('{"alg":"none"}')}.eyJhbGciOiJIUzI1NiJ9đ.`)).toEqual({ reason: "base64", part: "payload" });
  });

  it("says a five-part token is encrypted (JWE), which it cannot read", () => {
    expect(reason("eyJhbGciOiJSU0EtT0FFUCIsImVuYyI6IkEyNTZHQ00ifQ.a.b.c.d")).toEqual({ reason: "encrypted", part: undefined });
  });
});

describe("timeClaims", () => {
  it("reads exp, nbf and iat as instants, in that order, fractions included", () => {
    expect(timeClaims({ iat: 1516239022, exp: 1700000000.5, sub: "x", nbf: 0 })).toEqual([
      { claim: "exp", value: 1700000000.5, ms: 1700000000500 },
      { claim: "nbf", value: 0, ms: 0 },
      { claim: "iat", value: 1516239022, ms: 1516239022000 },
    ]);
    expect(timeClaims({ sub: "x" })).toEqual([]);
  });

  it("gives no instant for a claim that is not a NumericDate, or is past what a date can show", () => {
    expect(timeClaims({ exp: "1700000000", iat: null, nbf: 1e300 })).toEqual([
      { claim: "exp", value: "1700000000", ms: null },
      { claim: "nbf", value: 1e300, ms: null },
      { claim: "iat", value: null, ms: null },
    ]);
  });
});

describe("tokenStatus", () => {
  const exp = 1700000000;
  const at = (seconds: number) => seconds * 1000;

  it("is active before exp and expired from exp on", () => {
    expect(tokenStatus({ exp }, at(exp) - 1)).toEqual({ state: "active", at: at(exp) });
    expect(tokenStatus({ exp }, at(exp))).toEqual({ state: "expired", at: at(exp) });
    expect(tokenStatus({ exp }, at(exp) + 86_400_000)).toEqual({ state: "expired", at: at(exp) });
  });

  it("is not yet valid before nbf, and active from nbf on", () => {
    expect(tokenStatus({ nbf: exp, exp: exp + 60 }, at(exp) - 1)).toEqual({ state: "not-yet-valid", at: at(exp) });
    expect(tokenStatus({ nbf: exp, exp: exp + 60 }, at(exp))).toEqual({ state: "active", at: at(exp + 60) });
  });

  it("never expires without exp", () => {
    expect(tokenStatus({ sub: "x", iat: exp }, at(exp))).toEqual({ state: "no-expiry" });
    expect(tokenStatus({ nbf: exp }, at(exp) - 1)).toEqual({ state: "not-yet-valid", at: at(exp) });
  });

  it("names an exp or nbf that is not a NumericDate rather than guessing", () => {
    expect(tokenStatus({ exp: "tomorrow" }, at(exp))).toEqual({ state: "invalid", claim: "exp" });
    expect(tokenStatus({ exp, nbf: true }, at(exp) - 1)).toEqual({ state: "invalid", claim: "nbf" });
    // A wrong iat says nothing about whether the token may be used now.
    expect(tokenStatus({ exp, iat: "x" }, at(exp) - 1)).toEqual({ state: "active", at: at(exp) });
  });
});

describe("detectPaste", () => {
  it("is near certain for a token whose header names its alg, also after Bearer", () => {
    expect(detectPaste(SAMPLE)).toBeGreaterThanOrEqual(0.9);
    expect(detectPaste(`Bearer ${SAMPLE}
`)).toBeGreaterThanOrEqual(0.9);
  });

  it("ignores text that only looks like three dotted parts, or does not decode", () => {
    expect(detectPaste("")).toBe(0);
    expect(detectPaste("www.example.com")).toBe(0);
    expect(detectPaste("1.2.3")).toBe(0);
    expect(detectPaste(`${b64url('{"typ":"JWT"}')}.${b64url("{}")}.`)).toBe(0);
    expect(detectPaste(`${SAMPLE} and some more words`)).toBe(0);
    expect(detectPaste(`${SAMPLE}
foo`)).toBe(0);
    expect(detectPaste(`${SAMPLE.slice(0, 40)}
${SAMPLE.slice(40)}`)).toBe(0);
    expect(detectPaste("Trịnh.Đình.Tài")).toBe(0);
    expect(detectPaste(`${"a".repeat(2_000_000)}.b.c`)).toBe(0);
  });
});
