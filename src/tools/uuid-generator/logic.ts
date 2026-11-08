import { md5, sha1 } from "@noble/hashes/legacy.js";
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/** What the Tool makes: six RFC 9562 UUID versions and a ULID. Names stay untranslated (they are technical terms). */
export const VERSIONS = ["v1", "v3", "v4", "v5", "v6", "v7", "ulid"] as const;
export type Version = (typeof VERSIONS)[number];

/** The named versions hash a name with a namespace; the rest take only time and randomness. */
export type NamedVersion = "v3" | "v5";

const NAMED_VERSIONS = new Set<Version>(["v3", "v5"]);

/** The namespaces of RFC 9562 (formerly RFC 4122), offered on the UI by id; anything else must be a UUID itself. */
export const NAMED_NAMESPACES = ["dns", "url", "oid", "x500"] as const;
export type NamedNamespace = (typeof NAMED_NAMESPACES)[number];

const RFC_NAMESPACES: Record<NamedNamespace, string> = {
  dns: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  url: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
  oid: "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
  x500: "6ba7b814-9dad-11d1-80b4-00c04fd430c8",
};

/** 100-ns intervals between the UUID epoch 1582-10-15 and the Unix epoch (0x01b21dd213814000 ticks, RFC 9562 §A). */
const GREGORIAN_OFFSET_TICKS = 122192928000000000n;
const GREGORIAN_OFFSET_MS = 12219292800000;

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type GeneratorErrorReason = "empty-name" | "bad-namespace" | "time-out-of-range";

export class GeneratorError extends Error {
  constructor(readonly reason: GeneratorErrorReason) {
    super(`Cannot generate: ${reason}`);
    this.name = "GeneratorError";
  }
}

export type InspectErrorReason = "not-an-id";

export class InspectError extends Error {
  constructor(readonly reason: InspectErrorReason) {
    super(`Cannot inspect: ${reason}`);
    this.name = "InspectError";
  }
}

/** How a version makes its IDs: the Unix time in ms, and cryptographic randomness, both injectable for tests. */
export interface GenerateOptions {
  nowMs?: () => number;
  randomBytes?: (length: number) => Uint8Array;
}

/** What v3/v5 hash: a namespace (a named one's id, or any UUID) and a name. */
export interface NamedInput {
  namespace: string;
  name: string;
}

export function isNamedVersion(version: Version): version is NamedVersion {
  return NAMED_VERSIONS.has(version);
}

const defaultRandomBytes = (length: number): Uint8Array => crypto.getRandomValues(new Uint8Array(length));

function formatUuid(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The bytes as one unsigned number; fits a Number up to 2^53, more than the 48-bit times this Tool reads. */
function numberFromBytes(bytes: Uint8Array): number {
  return Number(`0x${bytesToHex(bytes)}`);
}

/** A UUID in the common shapes (plain, braced, `urn:uuid:`), as its 16 bytes; null when the shape does not match. */
function parseUuidBytes(text: string): Uint8Array | null {
  const hex = text.trim().replace(/^\{|\}$/g, "").replace(/^urn:uuid:/i, "").replace(/-/g, "");
  return /^[0-9a-f]{32}$/i.test(hex) ? hexToBytes(hex) : null;
}

/** The shapes a pasted text can be one ID in. Bare 32 hex digits are left out on purpose: they are ambiguous with Base64. */
const UUID_PASTE_SHAPE = /^(?:urn:uuid:)?\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;
const ULID_PASTE_SHAPE = /^[0-9a-hjkmnp-tv-z]{26}$/i;

/** The namespace as 16 bytes: a named one's id, or any UUID the user gave. */
function namespaceBytes(namespace: string): Uint8Array {
  const trimmed = namespace.trim();
  const uuid = RFC_NAMESPACES[trimmed as NamedNamespace] ?? trimmed;
  const bytes = parseUuidBytes(uuid);
  if (!bytes) throw new GeneratorError("bad-namespace");
  return bytes;
}

/** A 48-bit Unix time, written over the first `length` bytes of `bytes`, big-endian. */
function writeUnixMs(bytes: Uint8Array, ms: number): void {
  if (!Number.isSafeInteger(ms) || ms < 0 || ms >= 2 ** 48) throw new GeneratorError("time-out-of-range");
  for (let i = 0; i < 6; i++) bytes[i] = Number((BigInt(ms) >> BigInt(8 * (5 - i))) & 0xffn);
}

/** The 60-bit Gregorian time of `ms`, in 100-ns intervals since the UUID epoch. */
function gregorianTicks(ms: number): bigint {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new GeneratorError("time-out-of-range");
  return BigInt(ms) * 10000n + GREGORIAN_OFFSET_TICKS;
}

/** `ticks` (at most 60 bits) as 8 big-endian bytes; the two topmost bits are always 0. */
function ticksBytes(ticks: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) bytes[i] = Number((ticks >> BigInt(8 * (7 - i))) & 0xffn);
  return bytes;
}

/** v1 (RFC 9562 §5.1): Gregorian timestamp, low fields first; v6 (§5.6): the same timestamp, most significant first. */
function generateV1orV6(version: 1 | 6, options: GenerateOptions): string {
  const { nowMs = Date.now, randomBytes = defaultRandomBytes } = options;
  const ticks = gregorianTicks(nowMs());
  const t = ticksBytes(ticks);
  const bytes = new Uint8Array(16);
  // clock_seq (14 random bits) and node (6 random bytes) are shared by both versions, in the same place.
  bytes.set(randomBytes(8), 8);
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  bytes[10] = bytes[10]! | 0x01; // a random node sets the multicast bit, so it never collides with a real MAC
  if (version === 1) {
    bytes.set(t.subarray(4, 8), 0); // time_low: least significant 32 bits
    bytes.set(t.subarray(2, 4), 4); // time_mid: the next 16
    bytes[6] = 0x10 | (t[0]! & 0x0f); // version 1, then time_hi: the top 4 of its 12 bits
    bytes[7] = t[1]!; // time_hi: its low 8
  } else {
    const high = ticks >> 12n; // time_high: the most significant 48 bits
    const low = ticks & 0xfffn; // the remaining 12
    for (let i = 0; i < 6; i++) bytes[i] = Number((high >> BigInt(8 * (5 - i))) & 0xffn);
    bytes[6] = 0x60 | Number(low >> 8n); // version 6, then the top 4 of the remaining 12
    bytes[7] = Number(low & 0xffn);
  }
  return formatUuid(bytes);
}

/** v4 (§5.4): 122 random bits. */
function generateV4(options: GenerateOptions): string {
  const { randomBytes = defaultRandomBytes } = options;
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/** v7 (§5.7): 48-bit Unix time in ms, then 74 random bits. */
function generateV7(options: GenerateOptions): string {
  const { nowMs = Date.now, randomBytes = defaultRandomBytes } = options;
  const bytes = randomBytes(16);
  writeUnixMs(bytes, nowMs());
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/** v3 (§5.3) or v5 (§5.5): the namespace UUID and the UTF-8 name, hashed with MD5 or SHA-1. */
function generateNamed(version: 3 | 5, input: NamedInput | null): string {
  if (!input || !input.name) throw new GeneratorError("empty-name");
  const hash = version === 3 ? md5 : sha1;
  const bytes = hash(concatBytes(namespaceBytes(input.namespace), utf8ToBytes(input.name))).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | (version << 4);
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/** ULID (ulid/spec): 48-bit Unix time in ms, then 80 random bits, encoded in Crockford Base32. */
export function generateUlid(options: GenerateOptions = {}): string {
  const { nowMs = Date.now, randomBytes = defaultRandomBytes } = options;
  const bytes = new Uint8Array(16);
  writeUnixMs(bytes, nowMs());
  bytes.set(randomBytes(10), 6);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  let out = "";
  for (let i = 0; i < 26; i++) {
    out = ULID_ALPHABET[Number(value & 31n)]! + out;
    value >>= 5n;
  }
  return out;
}

/** One ID of `version`; v3/v5 need the namespace and name to hash. */
export function generate(version: Version, input: NamedInput | null, options: GenerateOptions = {}): string {
  if (version === "ulid") return generateUlid(options);
  if (version === "v4") return generateV4(options);
  if (version === "v7") return generateV7(options);
  if (version === "v1") return generateV1orV6(1, options);
  if (version === "v6") return generateV1orV6(6, options);
  return generateNamed(version === "v3" ? 3 : 5, input);
}

export type VariantId = "ncs" | "rfc4122" | "microsoft" | "reserved";

/** What the top bits of octet 8 say (RFC 9562 §4.1): 0xx NCS, 10x RFC 4122, 110 Microsoft, 111 reserved. */
function variantOf(byte8: number): VariantId {
  if ((byte8 & 0x80) === 0) return "ncs";
  if ((byte8 & 0x40) === 0) return "rfc4122";
  if ((byte8 & 0x20) === 0) return "microsoft";
  return "reserved";
}

/** The Gregorian time in `bytes` (v1 layout, also kept by v2 and v6) as Unix ms. */
function gregorianMsOf(bytes: Uint8Array, isV6: boolean): number {
  // v1/v2 split the 60 bits into time_hi (12), time_mid (16) and time_low (32); v6 keeps the most significant
  // 48 bits first, then the remaining 12.
  const ticks = isV6
    ? (BigInt(numberFromBytes(bytes.subarray(0, 6))) << 12n) | (BigInt(bytes[6]! & 0x0f) << 8n) | BigInt(bytes[7]!)
    : (BigInt(((bytes[6]! & 0x0f) << 8) | bytes[7]!) << 48n) |
      (BigInt((bytes[4]! << 8) | bytes[5]!) << 32n) |
      BigInt(numberFromBytes(bytes.subarray(0, 4)));
  return Number(ticks / 10000n) - GREGORIAN_OFFSET_MS;
}

export interface IdDetails {
  kind: "uuid" | "ulid";
  /** The ID in its canonical form: lowercase hyphenated for a UUID, uppercase for a ULID. */
  canonical: string;
  /** 0-15, from the high bits of octet 6; null for a ULID, which does not have a version. */
  version: number | null;
  variant: VariantId | null;
  /** Unix ms of the time inside the ID: v1/v2/v6 carry a Gregorian time, v7 and ULID a Unix one. */
  timestampMs: number | null;
}

/** Reads a UUID (plain, braced, `urn:uuid:`) or a ULID (case-insensitive) and reports what is inside it. */
export function inspect(text: string): IdDetails {
  const bytes = parseUuidBytes(text);
  if (bytes) {
    const version = bytes[6]! >> 4;
    return {
      kind: "uuid",
      canonical: formatUuid(bytes),
      version,
      variant: variantOf(bytes[8]!),
      timestampMs: version === 1 || version === 2 ? gregorianMsOf(bytes, false) : version === 6 ? gregorianMsOf(bytes, true) : version === 7 ? numberFromBytes(bytes.subarray(0, 6)) : null,
    };
  }
  const compact = text.trim();
  if (ULID_PASTE_SHAPE.test(compact)) {
    const bytes = new Uint8Array(16);
    let value = 0n;
    for (const char of compact) {
      const index = ULID_ALPHABET.indexOf(char.toUpperCase());
      value = (value << 5n) | BigInt(index);
    }
    for (let i = 0; i < 16; i++) bytes[i] = Number((value >> BigInt(8 * (15 - i))) & 0xffn);
    return { kind: "ulid", canonical: compact.toUpperCase(), version: null, variant: null, timestampMs: numberFromBytes(bytes.subarray(0, 6)) };
  }
  throw new InspectError("not-an-id");
}

/**
 * Scores how likely a pasted text is one UUID or ULID: 0.9 when it is one, 0 otherwise. A long pasted block never
 * matches, so the check costs two anchored tests even on a large Input.
 */
export function detectPaste(text: string): number {
  const trimmed = text.trim();
  return UUID_PASTE_SHAPE.test(trimmed) || ULID_PASTE_SHAPE.test(trimmed) ? 0.9 : 0;
}
