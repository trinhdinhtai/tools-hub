import { describe, expect, it } from "vitest";
import { DecodeError, EncodeError, SplitError, buildUrl, decodeParam, decodeText, detectPaste, encodeParam, encodeText, splitUrl, type UrlParts } from "./logic";

const URL_WITH_EVERYTHING = "https://user:pass@example.com:8443/api/v2?q=hello%20world&lang=vi&flag#top";

describe("encodeText", () => {
  it("encodes a whole URL but keeps its structure characters", () => {
    expect(encodeText("https://example.com/a b?x=1&y=tiếng#f", "full")).toBe("https://example.com/a%20b?x=1&y=ti%E1%BA%BFng#f");
  });

  it("encodes a component, reserved characters included", () => {
    expect(encodeText("a b/c?d=e", "component")).toBe("a%20b%2Fc%3Fd%3De");
    expect(encodeText("tiếng", "component")).toBe("ti%E1%BA%BFng");
  });

  it("keeps the empty string empty", () => {
    expect(encodeText("", "full")).toBe("");
    expect(encodeText("", "component")).toBe("");
  });

  it("survives a large input", () => {
    const text = `https://example.com/${"a".repeat(100_000)}`;
    expect(encodeText(text, "full")).toBe(text);
  });

  it("rejects a lone surrogate with a clear error", () => {
    expect(() => encodeText("\ud800", "component")).toThrow(EncodeError);
    expect(() => encodeText("\ud800", "full")).toThrow(new EncodeError("lone-surrogate"));
  });
});

describe("decodeText", () => {
  it("is the inverse of encoding, whole URL or component", () => {
    const url = "https://example.com/a%20b?x=1&y=ti%E1%BA%BFng#f";
    expect(decodeText(url, "full")).toBe("https://example.com/a b?x=1&y=tiếng#f");
    expect(decodeText("a%20b%2Fc%3Fd%3De", "component")).toBe("a b/c?d=e");
  });

  it("differs by scope: full keeps an encoded slash, component decodes it", () => {
    expect(decodeText("%2F", "full")).toBe("%2F");
    expect(decodeText("%2F", "component")).toBe("/");
  });

  it("keeps the empty string empty", () => {
    expect(decodeText("", "full")).toBe("");
    expect(decodeText("", "component")).toBe("");
  });

  it.each(["%zz", "%A", "%ed%a0%80"])("rejects the invalid escape %s with a clear error", (invalid) => {
    expect(() => decodeText(invalid, "component")).toThrow(new DecodeError("invalid-escape"));
    expect(() => decodeText(invalid, "full")).toThrow(DecodeError);
  });
});

describe("splitUrl", () => {
  it("splits a URL with every part, params decoded", () => {
    expect(splitUrl(URL_WITH_EVERYTHING)).toEqual({
      scheme: "https",
      host: "user:pass@example.com",
      port: "8443",
      path: "/api/v2",
      params: [
        { name: "q", value: "hello world", raw: "q=hello%20world" },
        { name: "lang", value: "vi", raw: "lang=vi" },
        { name: "flag", value: "", raw: "flag" },
      ],
      fragment: "top",
    });
  });

  it("reads + in a param as a space", () => {
    expect(splitUrl("https://example.com/?q=hello+world").params[0]).toEqual({ name: "q", value: "hello world", raw: "q=hello+world" });
  });

  it("keeps an IPv6 host and its port apart", () => {
    const parts = splitUrl("http://[::1]:8080/x");
    expect(parts.host).toBe("[::1]");
    expect(parts.port).toBe("8080");
    expect(parts.path).toBe("/x");
  });

  it("keeps a port that is not all digits in the host", () => {
    const parts = splitUrl("http://host:80a/x");
    expect(parts.host).toBe("host:80a");
    expect(parts.port).toBe("");
  });

  it("keeps a bare trailing colon in the host", () => {
    expect(buildUrl(splitUrl("http://host:/x"))).toBe("http://host:/x");
  });

  it("keeps the scheme, path and fragment exactly as written", () => {
    const parts = splitUrl("HTTP://EXAMPLE.COM/PaTh?q=1#FrAg");
    expect(parts.scheme).toBe("HTTP");
    expect(parts.host).toBe("EXAMPLE.COM");
    expect(parts.path).toBe("/PaTh");
    expect(parts.fragment).toBe("FrAg");
  });

  it("ignores surrounding whitespace", () => {
    expect(splitUrl("  https://example.com/a  ")).toEqual({ scheme: "https", host: "example.com", port: "", path: "/a", params: [], fragment: "" });
  });

  it.each([
    ["", "not-a-url"],
    ["   ", "not-a-url"],
    ["example.com/path", "not-a-url"],
    ["mailto:a@example.com", "not-a-url"],
    ["https://", "missing-host"],
    ["https:///path", "missing-host"],
    ["https://?q=1", "missing-host"],
  ])("rejects %j with %s", (invalid, reason) => {
    expect(() => splitUrl(invalid)).toThrow(new SplitError(reason as "not-a-url" | "missing-host"));
  });

  it("survives a large URL", () => {
    const url = `https://example.com/?q=${"a".repeat(100_000)}`;
    const parts = splitUrl(url);
    expect(parts.params[0]!.raw).toHaveLength(100_002);
    expect(buildUrl(parts)).toBe(url);
  });
});

describe("buildUrl", () => {
  it("reassembles splitUrl byte-for-byte when nothing was edited", () => {
    expect(buildUrl(splitUrl(URL_WITH_EVERYTHING))).toBe(URL_WITH_EVERYTHING);
  });

  it("leaves out the port, the query and the fragment when empty", () => {
    expect(buildUrl({ scheme: "https", host: "example.com", port: "", path: "", params: [], fragment: "" })).toBe("https://example.com");
  });

  it("gives a typed path its leading slash so it stays out of the host", () => {
    const parts = splitUrl("https://example.com/a");
    expect(buildUrl({ ...parts, path: "b" })).toBe("https://example.com/b");
  });

  it("reassembles correctly after one param is edited, untouched params byte-for-byte", () => {
    const parts = splitUrl(URL_WITH_EVERYTHING);
    const params = parts.params.map((param) => (param.name === "q" ? { name: "q", value: "a b&c=d", raw: encodeParam("q", "a b&c=d") } : param));
    expect(buildUrl({ ...parts, params })).toBe("https://user:pass@example.com:8443/api/v2?q=a%20b%26c%3Dd&lang=vi&flag#top");
  });

  it("adds a param at the end of the query", () => {
    const parts = splitUrl("https://example.com/search?q=1");
    expect(buildUrl({ ...parts, params: [...parts.params, { name: "lang", value: "vi", raw: encodeParam("lang", "vi") }] })).toBe(
      "https://example.com/search?q=1&lang=vi",
    );
  });

  it("does not add a ? for a param row that has not been typed into yet", () => {
    const parts = splitUrl("https://example.com/");
    expect(buildUrl({ ...parts, params: [{ name: "", value: "", raw: "" }] })).toBe("https://example.com/");
  });
});

describe("decodeParam / encodeParam", () => {
  it("keeps an invalid escape as written instead of failing", () => {
    expect(decodeParam("%zz")).toBe("%zz");
    expect(decodeParam("a%2")).toBe("a%2");
  });

  it("round-trips a param with reserved characters", () => {
    const raw = encodeParam("q&1", "a b=c");
    expect(raw).toBe("q%261=a%20b%3Dc");
    expect(splitUrl(`https://example.com/?${raw}`).params[0]).toEqual({ name: "q&1", value: "a b=c", raw });
  });
});

describe("detectPaste", () => {
  it.each([
    ["https://example.com/a?b=c", 1],
    ["HTTP://EXAMPLE.COM", 1],
    ["ftp://example.com/file", 0.9],
  ])("scores %j as %s", (url, score) => {
    expect(detectPaste(url)).toBe(score);
  });

  it.each([
    "",
   "just some text",
   "example.com/no-scheme",
   "https://two words",
   "https://",
  ])("scores %j as 0", (notUrl) => {
    expect(detectPaste(notUrl)).toBe(0);
  });

  it("accepts a URL surrounded by whitespace", () => {
    expect(detectPaste("  https://example.com/a\n")).toBe(1);
  });
});

describe("split and build round trips", () => {
  it.each([
    "https://example.com",
    "https://example.com/",
    "https://example.com/a/b/c",
    "https://example.com?a=1&b=2",
    "https://example.com/a?q=a+b&r=%2F&s=%zz#frag",
    "http://[::1]:8080/path?x=1#y",
    "https://user:pass@host:99/?q=%E1%BA%BF#đà",
    "https://vi.wikipedia.org/wiki/Ti%E1%BA%BFng_Vi%E1%BB%87t",
  ])("keeps %j identical", (url) => {
    expect(buildUrl(splitUrl(url) as UrlParts)).toBe(url);
  });
});
