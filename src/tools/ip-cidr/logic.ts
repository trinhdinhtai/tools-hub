/** 4 for IPv4, 6 for IPv6. */
export type Version = 4 | 6;

/** An address and its prefix length, as the user wrote it: the address need not be the network's first address. */
export interface Network {
  version: Version;
  address: bigint;
  prefix: number;
}

export type CidrErrorReason = "empty" | "invalid-address" | "invalid-prefix" | "invalid-mask";

/** Why a text is not a network; `line` (from 1) says which line of a list was wrong. */
export class CidrError extends Error {
  constructor(
    readonly reason: CidrErrorReason,
    readonly line?: number,
  ) {
    super(reason);
    this.name = "CidrError";
  }
}

const BITS: Record<Version, number> = { 4: 32, 6: 128 };

/** A dotted quad of decimal octets 0–255, ASCII digits only; leading zeros are refused, since some read them as octal. */
const OCTET = /^(?:0|[1-9][0-9]{0,2})$/;

function parseIPv4(text: string): bigint | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!OCTET.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

const HEXTET = /^[0-9a-f]{1,4}$/i;

/** Eight groups of 1–4 hex digits, one `::` for a run of zero groups, and an optional dotted IPv4 tail (RFC 4291 §2.2). */
function parseIPv6(text: string): bigint | null {
  const unbracketed = /^\[(.*)\]$/.exec(text)?.[1] ?? text;
  const halves = unbracketed.split("::");
  if (halves.length > 2) return null;
  const groups = halves.map((half) => (half === "" ? [] : half.split(":")));
  // A dotted IPv4 tail stands for the last two groups.
  const last = groups[groups.length - 1]!;
  let tail: bigint | null = null;
  if (last.length > 0 && last[last.length - 1]!.includes(".")) {
    tail = parseIPv4(last.pop()!);
    if (tail === null) return null;
  }
  const words = groups.flat().length + (tail === null ? 0 : 2);
  if (halves.length === 1 ? words !== 8 : words > 7) return null;

  let value = 0n;
  const push = (hextets: string[]) => {
    for (const hextet of hextets) {
      if (!HEXTET.test(hextet)) return false;
      value = (value << 16n) | BigInt(parseInt(hextet, 16));
    }
    return true;
  };
  if (!push(groups[0]!)) return null;
  if (halves.length === 2) {
    value <<= BigInt(16 * (8 - words));
    if (!push(groups[1]!)) return null;
  }
  if (tail !== null) value = (value << 32n) | tail;
  return value;
}

function parseAddress(text: string): { version: Version; value: bigint } | null {
  const v4 = parseIPv4(text);
  if (v4 !== null) return { version: 4, value: v4 };
  const v6 = text.includes(":") ? parseIPv6(text) : null;
  return v6 === null ? null : { version: 6, value: v6 };
}

/** IPv4 as a dotted quad; IPv6 in the canonical text form of RFC 5952. */
export function formatAddress(version: Version, value: bigint): string {
  if (version === 4) return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)).join(".");
  // §5: an IPv4-mapped address (::ffff:0:0/96) keeps its IPv4 part dotted.
  if (value >> 32n === 0xffffn) return `::ffff:${formatAddress(4, value & 0xffffffffn)}`;
  return formatHex(value);
}

/** The RFC 5952 hex form, never with a dotted tail: for masks and wildcards, which are bits rather than addresses. */
function formatMask(version: Version, value: bigint): string {
  return version === 4 ? formatAddress(4, value) : formatHex(value);
}

function formatHex(value: bigint): string {
  const words = Array.from({ length: 8 }, (_, i) => Number((value >> BigInt(16 * (7 - i))) & 0xffffn));
  // §4.2: the longest run of two or more zero groups becomes ::, the first one on a tie.
  let best = { start: -1, length: 1 };
  for (let i = 0; i < 8; ) {
    if (words[i] !== 0) {
      i++;
      continue;
    }
    let end = i;
    while (end < 8 && words[end] === 0) end++;
    if (end - i > best.length) best = { start: i, length: end - i };
    i = end;
  }
  const hex = words.map((word) => word.toString(16));
  if (best.start < 0) return hex.join(":");
  return `${hex.slice(0, best.start).join(":")}::${hex.slice(best.start + best.length).join(":")}`;
}

/** The prefix length of a contiguous netmask such as 255.255.255.0, or null when its one bits are not contiguous. */
function maskPrefix(mask: bigint, bits: number): number | null {
  const inverted = ~mask & ((1n << BigInt(bits)) - 1n);
  // A wildcard (the inverted mask) of a contiguous mask is 2^n − 1: all ones from the bottom.
  if ((inverted & (inverted + 1n)) !== 0n) return null;
  return bits - inverted.toString(2).replace(/^0$/, "").length;
}

/** Splits `address/prefix`, `address prefix` or a bare `address` into its two texts; prefix is null when absent. */
function splitInput(text: string): [string, string | null] {
  const slash = text.indexOf("/");
  if (slash >= 0) return [text.slice(0, slash).trim(), text.slice(slash + 1).trim()];
  const parts = text.split(/\s+/);
  if (parts.length === 1) return [text, null];
  if (parts.length === 2) return [parts[0]!, parts[1]!];
  throw new CidrError("invalid-address");
}

function parsePrefix(text: string | null, version: Version): number {
  const bits = BITS[version];
  if (text === null) return bits;
  if (version === 4 && text.includes(".")) {
    const mask = parseIPv4(text);
    if (mask === null) throw new CidrError("invalid-mask");
    const prefix = maskPrefix(mask, bits);
    if (prefix === null) throw new CidrError("invalid-mask");
    return prefix;
  }
  if (!/^[0-9]{1,3}$/.test(text)) throw new CidrError("invalid-prefix");
  const prefix = Number(text);
  if (prefix > bits) throw new CidrError("invalid-prefix");
  return prefix;
}

/** Reads `address/prefix`, `address/netmask`, `address netmask` or a bare address (a network of one address). */
export function parseNetwork(text: string): Network {
  const trimmed = text.trim();
  if (trimmed === "") throw new CidrError("empty");
  const [addressText, prefixText] = splitInput(trimmed);
  const address = parseAddress(addressText);
  if (address === null) throw new CidrError("invalid-address");
  return { version: address.version, address: address.value, prefix: parsePrefix(prefixText, address.version) };
}

/** What a network is for, from the IANA special-purpose registries; `mixed` when it spans more than one kind. */
export type AddressType =
  | "unspecified"
  | "loopback"
  | "private"
  | "shared"
  | "link-local"
  | "documentation"
  | "benchmarking"
  | "multicast"
  | "broadcast"
  | "reserved"
  | "ipv4-mapped"
  | "unique-local"
  | "global"
  | "public"
  | "mixed";

/** Special-purpose blocks, most specific first: the first that holds a whole network names its type. */
const BLOCKS: Record<Version, readonly [Network, AddressType][]> = {
  4: (
    [
      ["255.255.255.255/32", "broadcast"],
      ["192.0.2.0/24", "documentation"],
      ["198.51.100.0/24", "documentation"],
      ["203.0.113.0/24", "documentation"],
      ["169.254.0.0/16", "link-local"],
      ["192.168.0.0/16", "private"],
      ["198.18.0.0/15", "benchmarking"],
      ["172.16.0.0/12", "private"],
      ["100.64.0.0/10", "shared"],
      ["0.0.0.0/8", "unspecified"],
      ["10.0.0.0/8", "private"],
      ["127.0.0.0/8", "loopback"],
      ["224.0.0.0/4", "multicast"],
      ["240.0.0.0/4", "reserved"],
    ] as const
  ).map(([text, type]) => [parseNetwork(text), type] as const),
  6: (
    [
      ["::/128", "unspecified"],
      ["::1/128", "loopback"],
      ["::ffff:0.0.0.0/96", "ipv4-mapped"],
      ["2001:db8::/32", "documentation"],
      ["3fff::/20", "documentation"],
      ["fe80::/10", "link-local"],
      ["ff00::/8", "multicast"],
      ["fc00::/7", "unique-local"],
      ["2000::/3", "global"],
    ] as const
  ).map(([text, type]) => [parseNetwork(text), type] as const),
};

/** The all-ones value of a version's width. */
const ones = (version: Version) => (1n << BigInt(BITS[version])) - 1n;

/** The first and last address of a network, as numbers. */
function bounds({ version, address, prefix }: Network): [bigint, bigint] {
  const host = ones(version) >> BigInt(prefix);
  const first = address & ~host & ones(version);
  return [first, first | host];
}

/** The most specific block that holds the whole network names its type, unless the network also cuts into another one. */
function typeOf(network: Network): AddressType {
  const [first, last] = bounds(network);
  let type: AddressType | null = null;
  for (const [block, blockType] of BLOCKS[network.version]) {
    const [blockFirst, blockLast] = bounds(block);
    const holds = blockFirst <= first && last <= blockLast;
    if (holds) type ??= blockType;
    else if (first <= blockLast && blockFirst <= last) return "mixed";
  }
  return type ?? (network.version === 4 ? "public" : "reserved");
}

/** Everything the calculator shows for one network; addresses are formatted text, counts exact. */
export interface NetworkDetails {
  version: Version;
  prefix: number;
  /** The address as given, which may sit anywhere inside the network. */
  address: string;
  cidr: string;
  network: string;
  /** IPv4 only, and not for /31 and /32, which have no broadcast address. */
  broadcast: string | null;
  firstHost: string;
  lastHost: string;
  hostCount: bigint;
  addressCount: bigint;
  mask: string;
  wildcard: string;
  type: AddressType;
}

export function describeNetwork(network: Network): NetworkDetails {
  const { version, prefix } = network;
  const [first, last] = bounds(network);
  const format = (value: bigint) => formatAddress(version, value);
  const addressCount = last - first + 1n;
  // IPv4 keeps its first and last address for the network and broadcast, except on /31 links (RFC 3021) and /32
  // hosts. IPv6 has no broadcast: every address in the range is usable.
  const hasBroadcast = version === 4 && prefix <= 30;
  const wildcard = ones(version) >> BigInt(prefix);
  return {
    version,
    prefix,
    address: format(network.address),
    cidr: `${format(first)}/${prefix}`,
    network: format(first),
    broadcast: hasBroadcast ? format(last) : null,
    firstHost: format(hasBroadcast ? first + 1n : first),
    lastHost: format(hasBroadcast ? last - 1n : last),
    hostCount: hasBroadcast ? addressCount - 2n : addressCount,
    addressCount,
    mask: formatMask(version, ones(version) ^ wildcard),
    wildcard: formatMask(version, wildcard),
    type: typeOf(network),
  };
}
