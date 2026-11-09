import { describe, expect, it } from "vitest";
import { CidrError, describeNetwork, formatAddress, parseNetwork } from "./logic";

function reason(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof CidrError) return error.reason;
    throw error;
  }
  return undefined;
}

describe("parseNetwork", () => {
  it("reads an IPv4 CIDR", () => {
    expect(parseNetwork("192.168.1.10/24")).toEqual({ version: 4, address: 0xc0a8010an, prefix: 24 });
  });

  it("reads a bare IPv4 address as a single-address network", () => {
    expect(parseNetwork("  10.0.0.1 ")).toEqual({ version: 4, address: 0x0a000001n, prefix: 32 });
  });

  it.each(["10.1.2.3/255.255.255.0", "10.1.2.3 255.255.255.0", "10.1.2.3 / 255.255.255.0"])("reads a dotted netmask in %j", (text) => {
    expect(parseNetwork(text)).toEqual({ version: 4, address: 0x0a010203n, prefix: 24 });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["256.0.0.1", "invalid-address"],
    ["10.0.0", "invalid-address"],
    ["10.0.0.1.2", "invalid-address"],
    ["010.0.0.1", "invalid-address"],
    ["１０.0.0.1", "invalid-address"],
    ["10.0.0.-1", "invalid-address"],
    ["hello", "invalid-address"],
    ["10.0.0.1/33", "invalid-prefix"],
    ["10.0.0.1/", "invalid-prefix"],
    ["10.0.0.1/1a", "invalid-prefix"],
    ["10.0.0.1/24/8", "invalid-prefix"],
    ["10.0.0.1/255.0.255.0", "invalid-mask"],
    ["2001:db8::/129", "invalid-prefix"],
    ["2001:db8::/ffff::", "invalid-prefix"],
    ["2001:db8:::1", "invalid-address"],
    ["2001:db8::1::2", "invalid-address"],
    ["1:2:3:4:5:6:7:8:9", "invalid-address"],
    ["1:2:3:4:5:6:7", "invalid-address"],
    ["12345::", "invalid-address"],
    ["g::1", "invalid-address"],
    ["fe80::1%eth0", "invalid-address"],
    ["::ffff:300.0.0.1", "invalid-address"],
    [`${"1:".repeat(10_000)}1`, "invalid-address"],
  ])("refuses %j as %s", (text, expected) => {
    expect(reason(() => parseNetwork(text))).toBe(expected);
  });
});

describe("IPv6", () => {
  it.each([
    ["2001:db8::1/64", 0x20010db8000000000000000000000001n, 64],
    ["::", 0n, 128],
    ["::1", 1n, 128],
    ["2001:DB8:0:0:0:0:0:1", 0x20010db8000000000000000000000001n, 128],
    ["1:2:3:4:5:6:7:8", 0x00010002000300040005000600070008n, 128],
    ["::ffff:192.0.2.1", 0xffffc0000201n, 128],
    ["[2001:db8::1]", 0x20010db8000000000000000000000001n, 128],
  ])("reads %j", (text, address, prefix) => {
    expect(parseNetwork(text)).toEqual({ version: 6, address, prefix });
  });

  // RFC 5952 §4: lowercase, no leading zeros, the longest run of two or more zero groups (the first on a tie) as ::.
  it.each([
    [0x20010db8000000000000000000000001n, "2001:db8::1"],
    [0n, "::"],
    [1n, "::1"],
    [0x20010db8000000010000000000000001n, "2001:db8:0:1::1"],
    [0x20010db8000000000001000000000001n, "2001:db8::1:0:0:1"],
    [0x20010db8000000010001000100010001n, "2001:db8:0:1:1:1:1:1"],
    [0xffffffffffffffffffffffffffffffffn, "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"],
    // §5: an IPv4-mapped address keeps its IPv4 part dotted.
    [0xffffc0000201n, "::ffff:192.0.2.1"],
  ])("formats %s as %j", (value, text) => {
    expect(formatAddress(6, value)).toBe(text);
  });

  it("formats IPv4 as a dotted quad", () => {
    expect(formatAddress(4, 0xc0a8010an)).toBe("192.168.1.10");
  });
});

const describe_ = (text: string) => describeNetwork(parseNetwork(text));

describe("describeNetwork", () => {
  it("works out an IPv4 /24 from any address inside it", () => {
    expect(describe_("192.168.1.10/24")).toEqual({
      version: 4,
      prefix: 24,
      address: "192.168.1.10",
      cidr: "192.168.1.0/24",
      network: "192.168.1.0",
      broadcast: "192.168.1.255",
      firstHost: "192.168.1.1",
      lastHost: "192.168.1.254",
      hostCount: 254n,
      addressCount: 256n,
      mask: "255.255.255.0",
      wildcard: "0.0.0.255",
      type: "private",
    });
  });

  it("uses both addresses of a /31 point-to-point link as hosts (RFC 3021)", () => {
    expect(describe_("10.0.0.1/31")).toMatchObject({
      network: "10.0.0.0",
      broadcast: null,
      firstHost: "10.0.0.0",
      lastHost: "10.0.0.1",
      hostCount: 2n,
    });
  });

  it("treats a /32 as the one host it holds", () => {
    expect(describe_("8.8.8.8")).toMatchObject({
      cidr: "8.8.8.8/32",
      broadcast: null,
      firstHost: "8.8.8.8",
      lastHost: "8.8.8.8",
      hostCount: 1n,
      mask: "255.255.255.255",
      wildcard: "0.0.0.0",
      type: "public",
    });
  });

  it("covers the whole IPv4 space at /0", () => {
    expect(describe_("1.2.3.4/0")).toMatchObject({
      network: "0.0.0.0",
      broadcast: "255.255.255.255",
      addressCount: 4294967296n,
      hostCount: 4294967294n,
      mask: "0.0.0.0",
      wildcard: "255.255.255.255",
      type: "mixed",
    });
  });

  it("gives an IPv6 network its full range, with no broadcast", () => {
    expect(describe_("2001:db8:abcd:12::1/64")).toEqual({
      version: 6,
      prefix: 64,
      address: "2001:db8:abcd:12::1",
      cidr: "2001:db8:abcd:12::/64",
      network: "2001:db8:abcd:12::",
      broadcast: null,
      firstHost: "2001:db8:abcd:12::",
      lastHost: "2001:db8:abcd:12:ffff:ffff:ffff:ffff",
      hostCount: 18446744073709551616n,
      addressCount: 18446744073709551616n,
      mask: "ffff:ffff:ffff:ffff::",
      wildcard: "::ffff:ffff:ffff:ffff",
      type: "documentation",
    });
  });

  // A mask is not an address: its ::ffff bits must not read as an IPv4-mapped address (RFC 5952 §5 is for addresses).
  it.each([
    [80, "ffff:ffff:ffff:ffff:ffff::", "::ffff:ffff:ffff"],
    [95, "ffff:ffff:ffff:ffff:ffff:fffe::", "::1:ffff:ffff"],
  ])("writes the IPv6 /%s mask and wildcard in hex", (prefix, mask, wildcard) => {
    expect(describe_(`2001:db8::/${prefix}`)).toMatchObject({ mask, wildcard });
  });

  it("counts all 2^128 addresses of ::/0 exactly", () => {
    expect(describe_("::/0")).toMatchObject({ addressCount: 2n ** 128n, lastHost: "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", type: "mixed" });
  });

  it.each([
    ["0.0.0.0", "unspecified"],
    ["10.20.30.40", "private"],
    ["172.16.0.0/12", "private"],
    ["172.32.0.1", "public"],
    ["192.168.0.1", "private"],
    ["100.64.0.1", "shared"],
    ["127.0.0.1", "loopback"],
    ["169.254.10.10", "link-local"],
    ["192.0.2.1", "documentation"],
    ["198.51.100.7", "documentation"],
    ["203.0.113.9", "documentation"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.251", "multicast"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "broadcast"],
    ["1.1.1.1", "public"],
    ["10.0.0.0/7", "mixed"],
    ["192.0.0.0/16", "mixed"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    ["::ffff:192.0.2.1", "ipv4-mapped"],
    ["fe80::1", "link-local"],
    ["fd12:3456::1", "unique-local"],
    ["ff02::1", "multicast"],
    ["2001:db8::/32", "documentation"],
    ["2606:4700::1111", "global"],
    ["2001::/16", "mixed"],
    ["4000::1", "reserved"],
  ])("types %j as %s", (text, type) => {
    expect(describe_(text).type).toBe(type);
  });
});
