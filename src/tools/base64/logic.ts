export type Variant = "standard" | "url-safe" | "base32";

/** Each alphabet's name as written in error messages. */
export const VARIANT_NAMES: Record<Variant, string> = { standard: "Base64", "url-safe": "Base64 URL-safe", base32: "Base32" };

const STANDARD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const codes = (alphabet: string) => Uint8Array.from(alphabet, (ch) => ch.charCodeAt(0));
const STANDARD_CODES = codes(STANDARD);
const URL_SAFE_CODES = codes(URL_SAFE);
const BASE32_CODES = codes(BASE32);
const PAD = 61; // "="

function bytesToBase64(bytes: Uint8Array, alphabet: Uint8Array, pad: boolean): Uint8Array {
  const whole = bytes.length - (bytes.length % 3);
  const rest = bytes.length - whole;
  const out = new Uint8Array((whole / 3) * 4 + (rest === 0 ? 0 : pad ? 4 : rest + 1));
  let j = 0;
  for (let i = 0; i < whole; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out[j++] = alphabet[n >> 18]!;
    out[j++] = alphabet[(n >> 12) & 63]!;
    out[j++] = alphabet[(n >> 6) & 63]!;
    out[j++] = alphabet[n & 63]!;
  }
  if (rest > 0) {
    const n = (bytes[whole]! << 16) | ((bytes[whole + 1] ?? 0) << 8);
    out[j++] = alphabet[n >> 18]!;
    out[j++] = alphabet[(n >> 12) & 63]!;
    if (rest === 2) out[j++] = alphabet[(n >> 6) & 63]!;
    while (j < out.length) out[j++] = PAD;
  }
  return out;
}

function bytesToBase32(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(bytes.length / 5) * 8);
  let j = 0;
  let bits = 0;
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    value = ((value << 8) | bytes[i]!) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out[j++] = BASE32_CODES[(value >> bits) & 31]!;
    }
  }
  if (bits > 0) out[j++] = BASE32_CODES[(value << (5 - bits)) & 31]!;
  out.fill(PAD, j);
  return out;
}

/** Encodes raw bytes (a file) as the ASCII bytes of their Base64 or Base32 text. */
export function encodeBytes(bytes: Uint8Array, variant: Variant): Uint8Array {
  if (variant === "url-safe") return bytesToBase64(bytes, URL_SAFE_CODES, false);
  if (variant === "base32") return bytesToBase32(bytes);
  return bytesToBase64(bytes, STANDARD_CODES, true);
}

const ascii = new TextDecoder("latin1");

export function encode(text: string, variant: Variant): string {
  return ascii.decode(encodeBytes(new TextEncoder().encode(text), variant));
}

export type DecodeErrorReason = "invalid-character" | "invalid-length" | "not-utf8";

export class DecodeError extends Error {
  constructor(readonly reason: DecodeErrorReason) {
    super(`Cannot decode: ${reason}`);
    this.name = "DecodeError";
  }
}

/** Char code → alphabet index, or -1 for characters outside the alphabet. */
function lookup(alphabet: string, caseInsensitive = false): Int16Array {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet.charCodeAt(i)] = i;
    if (caseInsensitive) table[alphabet.toLowerCase().charCodeAt(i)] = i;
  }
  return table;
}

const STANDARD_LOOKUP = lookup(STANDARD);
const URL_SAFE_LOOKUP = lookup(URL_SAFE);
const BASE32_LOOKUP = lookup(BASE32, true);

/** Reads `body` as `bitsPerChar`-bit digits of `table` into bytes. */
function digitsToBytes(body: string, table: Int16Array, bitsPerChar: number): Uint8Array {
  const out = new Uint8Array(Math.floor((body.length * bitsPerChar) / 8));
  let bits = 0;
  let value = 0;
  let j = 0;
  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    const idx = code < 128 ? table[code]! : -1;
    if (idx < 0) throw new DecodeError("invalid-character");
    value = ((value << bitsPerChar) | idx) & 0xffff;
    bits += bitsPerChar;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

function base64ToBytes(input: string, table: Int16Array, padRequired: boolean): Uint8Array {
  const clean = input.replace(/\s+/g, "");
  const body = clean.replace(/=+$/, "");
  const padding = clean.length - body.length;
  if (padding > 2) throw new DecodeError("invalid-length");
  if (padRequired && padding > 0 && clean.length % 4 !== 0) throw new DecodeError("invalid-length");
  if (padRequired && padding === 0 && body.length % 4 !== 0) throw new DecodeError("invalid-length");
  if (body.length % 4 === 1) throw new DecodeError("invalid-length");
  return digitsToBytes(body, table, 6);
}

function bytesToText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DecodeError("not-utf8");
  }
}

// Unpadded Base32 lengths (mod 8) that a whole number of bytes can produce.
const BASE32_VALID_TAIL = new Set([0, 2, 4, 5, 7]);

function base32ToBytes(input: string): Uint8Array {
  const clean = input.replace(/\s+/g, "");
  const body = clean.replace(/=+$/, "");
  const padding = clean.length - body.length;
  if (!BASE32_VALID_TAIL.has(body.length % 8)) throw new DecodeError("invalid-length");
  // Padding, when present, must fill exactly the last 8-character block.
  if (padding > 0 && padding !== (8 - (body.length % 8)) % 8) throw new DecodeError("invalid-length");
  return digitsToBytes(body, BASE32_LOOKUP, 5);
}

/** Decodes Base64 or Base32 text to raw bytes, whatever they are. Throws a `DecodeError` if it is malformed. */
export function decodeBytes(input: string, variant: Variant): Uint8Array {
  if (variant === "url-safe") return base64ToBytes(input, URL_SAFE_LOOKUP, false);
  if (variant === "base32") return base32ToBytes(input);
  return base64ToBytes(input, STANDARD_LOOKUP, true);
}

/** Decodes Base64 or Base32 text that holds UTF-8 text. */
export function decode(input: string, variant: Variant): string {
  return bytesToText(decodeBytes(input, variant));
}

export interface DataUri {
  /** The type/subtype, lowercase, without parameters, e.g. "image/png". */
  mime: string;
  bytes: Uint8Array;
}

const DATA_URI = /^data:([^,]*),/i;

/** Percent-decodes to bytes (data URIs without `;base64` can carry any byte as %XX). */
function percentToBytes(data: string): Uint8Array {
  const out: number[] = [];
  const utf8 = new TextEncoder();
  for (let i = 0; i < data.length; i++) {
    const hex = data[i] === "%" ? data.slice(i + 1, i + 3) : "";
    if (/^[0-9a-f]{2}$/i.test(hex)) {
      out.push(parseInt(hex, 16));
      i += 2;
    } else {
      out.push(...utf8.encode(data[i]!));
    }
  }
  return Uint8Array.from(out);
}

/** Whether the text is shaped like a data URI (`data:…,…`), whether or not its data decodes. */
export function isDataUri(text: string): boolean {
  return DATA_URI.test(text.trim());
}

/**
 * Reads a data URI (RFC 2397): its MIME type and its decoded bytes. Null when the text is not a data URI; throws a
 * `DecodeError` when it is one but its Base64 is malformed.
 */
export function parseDataUri(text: string): DataUri | null {
  const trimmed = text.trim();
  const match = DATA_URI.exec(trimmed);
  if (!match) return null;
  const [type = "", ...params] = match[1]!.split(";").map((part) => part.trim());
  const base64 = params.some((param) => param.toLowerCase() === "base64");
  const data = trimmed.slice(match[0].length);
  return {
    mime: type.toLowerCase() || "text/plain",
    bytes: base64 ? decodeBytes(data, "standard") : percentToBytes(data),
  };
}

/** What comes before the Base64 in a data URI; files with no known type are application/octet-stream. */
export function dataUriPrefix(mime: string): string {
  return `data:${mime || "application/octet-stream"};base64,`;
}

/** A data URI for a file's bytes, as ASCII bytes. */
export function encodeDataUri(bytes: Uint8Array, mime: string): Uint8Array {
  const prefix = new TextEncoder().encode(dataUriPrefix(mime));
  const body = encodeBytes(bytes, "standard");
  const out = new Uint8Array(prefix.length + body.length);
  out.set(prefix);
  out.set(body, prefix.length);
  return out;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "application/pdf": "pdf",
  "application/json": "json",
  "application/zip": "zip",
  "application/gzip": "gz",
  "application/wasm": "wasm",
  "application/xml": "xml",
  "text/plain": "txt",
  "text/html": "html",
  "text/css": "css",
  "text/csv": "csv",
  "text/javascript": "js",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "video/mp4": "mp4",
  "font/woff2": "woff2",
};

/** The usual file extension for a MIME type; "bin" when there is none. */
export function fileExtension(mime: string): string {
  return EXTENSIONS[mime] ?? "bin";
}

const BASE64_SHAPE = /^[A-Za-z0-9+/_-]+={0,2}$/;
const HEX_OR_DIGITS = /^[0-9a-f]+$/i;
// Control characters other than tab, LF and CR mean the decoded bytes are not readable text.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * Scores how likely a pasted text is Base64 that decodes to readable text, or a data URI.
 * 0 means "not Base64"; never above 1.
 */
export function detectPaste(text: string): number {
  if (isDataUri(text)) {
    try {
      parseDataUri(text);
      return 0.9;
    } catch {
      return 0;
    }
  }
  const compact = text.replace(/\s+/g, "");
  if (compact.length < 8 || !BASE64_SHAPE.test(compact) || HEX_OR_DIGITS.test(compact)) return 0;

  let decoded: string | undefined;
  for (const variant of ["standard", "url-safe"] as const) {
    try {
      decoded = decode(compact, variant);
      break;
    } catch {
      // try the next variant
    }
  }
  if (decoded === undefined || CONTROL_CHARS.test(decoded)) return 0;
  return compact.endsWith("=") || compact.length >= 16 ? 0.9 : 0.6;
}
