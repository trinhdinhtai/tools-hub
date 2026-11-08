import { describe, expect, it } from "vitest";
import { CASES, SlugError, slugify, toCase, toWords } from "./logic";

describe("toWords", () => {
  it("splits on the usual delimiters", () => {
    expect(toWords("user_name-id.list")).toEqual(["user", "name", "id", "list"]);
    expect(toWords("Đà Nẵng, Đà Lạt")).toEqual(["Đà", "Nẵng", "Đà", "Lạt"]);
  });

  it("splits camelCase and PascalCase acronym boundaries", () => {
    expect(toWords("getUserIDList")).toEqual(["get", "User", "ID", "List"]);
    expect(toWords("HTTPServer2URL")).toEqual(["HTTP", "Server2", "URL"]);
  });

  it("keeps Vietnamese diacritics on their letters", () => {
    expect(toWords("tiếng Việt")).toEqual(["tiếng", "Việt"]);
    // Decomposed input (NFD) still reads as whole words, not as letters split by their marks.
    expect(toWords("tiếng".normalize("NFD"))).toEqual(["tiếng"]);
  });

  it("keeps the empty string and symbol-only text empty", () => {
    expect(toWords("")).toEqual([]);
    expect(toWords("…!?")).toEqual([]);
  });
});

describe("toCase", () => {
  it("converts one name to every style", () => {
    expect(CASES.map((style) => toCase("getUser_ID list", style))).toEqual([
      "getUserIdList", // camel
      "GetUserIdList", // pascal
      "get_user_id_list", // snake
      "get-user-id-list", // kebab
      "GET_USER_ID_LIST", // constant
      "Get User Id List", // title
    ]);
  });

  it("converts Vietnamese names without losing their diacritics", () => {
    expect(toCase("đà nẵng", "pascal")).toBe("ĐàNẵng");
    expect(toCase("tiếng Việt", "kebab")).toBe("tiếng-việt");
    expect(toCase("Ninh Bình", "constant")).toBe("NINH_BÌNH");
  });

  it("converts each line on its own", () => {
    expect(toCase("đà nẵng\nhồ chí minh", "snake")).toBe("đà_nẵng\nhồ_chí_minh");
  });

  it("keeps empty and symbol-only lines empty", () => {
    expect(toCase("one\n\n…", "kebab")).toBe("one\n\n");
    expect(toCase("", "camel")).toBe("");
  });

  it("survives a large input", () => {
    const text = `getUser\n${"a".repeat(100_000)}`;
    expect(toCase(text, "snake")).toBe(`get_user\n${"a".repeat(100_000)}`);
  });
});

describe("slugify", () => {
  it("builds a slug from a URL-unfriendly name", () => {
    expect(slugify("Bài Viết Đầu Tiên!")).toBe("bai-viet-dau-tien");
    expect(slugify("Hồ Chí Minh City")).toBe("ho-chi-minh-city");
  });

  it("removes Vietnamese diacritics, đ included", () => {
    expect(slugify("Đà Nẵng")).toBe("da-nang");
    expect(slugify("ĐƯỜNG ĐÔN MÔN")).toBe("duong-don-mon");
    // The letter đ itself: no decomposed form to lean on, only the explicit replacement.
    expect(slugify("đ")).toBe("d");
    expect(slugify("Đường", "_")).toBe("duong");
  });

  it("drops delimiters and repeats, and honours a custom separator", () => {
    expect(slugify("  a  --  b__c  ")).toBe("a-b-c");
    expect(slugify("one two three", "+")).toBe("one+two+three");
  });

  it("keeps digits and slug-friendly letters as they are", () => {
    expect(slugify("React 19 & TS")).toBe("react-19-ts");
    expect(slugify("Miền Bắc 2026")).toBe("mien-bac-2026");
  });

  it("handles empty and multi-line input like toCase", () => {
    expect(slugify("")).toBe("");
    expect(slugify("  \n ")).toBe("\n");
    expect(slugify("Đà Nẵng\nHồ Chí Minh")).toBe("da-nang\nho-chi-minh");
  });

  it("rejects a non-empty line without a single letter or digit", () => {
    expect(() => slugify("!!!")).toThrow(new SlugError("no-alphanumeric"));
    expect(() => slugify("ok\n***")).toThrow(SlugError);
  });

  it("survives a large input", () => {
    const text = `Tiếng Việt ${"a".repeat(100_000)}`;
    expect(slugify(text)).toBe(`tieng-viet-${"a".repeat(100_000)}`);
  });
});
