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
