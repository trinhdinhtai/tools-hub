import { describe, expect, it } from "vitest";
import { CidrError, formatAddress, parseNetwork } from "./logic";

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
