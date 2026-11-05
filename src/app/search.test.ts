import { describe, expect, it } from "vitest";
import { searchTools, type SearchEntry } from "./search";

const entries: SearchEntry[] = [
  { id: "base64", names: ["Base64"], aliases: ["base64url", "encode", "decode", "mã hoá", "giải mã"] },
  { id: "hash", names: ["Hash Generator", "Tạo mã băm"], aliases: ["sha", "md5", "băm"] },
  { id: "timestamp", names: ["Timestamp", "Dấu thời gian"], aliases: ["epoch", "unix", "đổi giờ"] },
];

describe("searchTools", () => {
  it("matches a Tool by its name, ignoring case", () => {
    expect(searchTools("HASH", entries)).toEqual(["hash"]);
  });

  it("matches a Tool by an alias", () => {
    expect(searchTools("epoch", entries)).toEqual(["timestamp"]);
    expect(searchTools("sha", entries)).toEqual(["hash"]);
  });

  it("matches Vietnamese with or without diacritics, either way round", () => {
    expect(searchTools("mã hoá", entries)).toEqual(["base64"]);
    expect(searchTools("ma hoa", entries)).toEqual(["base64"]);
    expect(searchTools("mã hóa", entries)).toEqual(["base64"]);
    expect(searchTools("doi gio", entries)).toEqual(["timestamp"]);
    expect(searchTools("Đổi", entries)).toEqual(["timestamp"]);
  });

  it("matches the words of the query in any order", () => {
    expect(searchTools("generator hash", entries)).toEqual(["hash"]);
  });

  it("finds nothing when no Tool matches", () => {
    expect(searchTools("regex", entries)).toEqual([]);
  });

  it("ranks a name match above an alias match", () => {
    const list: SearchEntry[] = [
      { id: "jwt", names: ["JWT Decoder"], aliases: ["token"] },
      { id: "token-counter", names: ["Token Counter"], aliases: [] },
    ];
    expect(searchTools("token", list)).toEqual(["token-counter", "jwt"]);
  });

  it("ranks a match at the start of a word above one inside a word", () => {
    const list: SearchEntry[] = [
      { id: "url", names: ["URL Encoder"], aliases: [] },
      { id: "curl", names: ["cURL Builder"], aliases: [] },
    ];
    expect(searchTools("url", list)).toEqual(["url", "curl"]);
  });

  it("lists every Tool, in the given order, for an empty query", () => {
    expect(searchTools("  ", entries)).toEqual(["base64", "hash", "timestamp"]);
  });
});
