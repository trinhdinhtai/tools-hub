export type Variant = "standard" | "url-safe" | "base32";

const STANDARD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function bytesToBase64(bytes: Uint8Array, alphabet: string, pad: boolean): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const n = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]!;
    out += b1 === undefined ? (pad ? "=" : "") : alphabet[(n >> 6) & 63]!;
    out += b2 === undefined ? (pad ? "=" : "") : alphabet[n & 63]!;
  }
  return out;
}

function bytesToBase32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(value >> bits) & 31]!;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]!;
  return out + "=".repeat((8 - (out.length % 8)) % 8);
}

export function encode(text: string, variant: Variant): string {
  const bytes = new TextEncoder().encode(text);
  if (variant === "url-safe") return bytesToBase64(bytes, URL_SAFE, false);
  if (variant === "base32") return bytesToBase32(bytes);
  return bytesToBase64(bytes, STANDARD, true);
}

export type DecodeErrorReason = "invalid-character" | "invalid-length" | "not-utf8";

export class DecodeError extends Error {
  constructor(readonly reason: DecodeErrorReason) {
    super(`Cannot decode: ${reason}`);
    this.name = "DecodeError";
  }
}

function base64ToBytes(input: string, alphabet: string, padRequired: boolean): Uint8Array {
  const clean = input.replace(/\s+/g, "");
  const body = clean.replace(/=+$/, "");
  const padding = clean.length - body.length;
  if (padding > 2) throw new DecodeError("invalid-length");
  if (padRequired && padding > 0 && clean.length % 4 !== 0) throw new DecodeError("invalid-length");
  if (padRequired && padding === 0 && body.length % 4 !== 0) throw new DecodeError("invalid-length");
  if (body.length % 4 === 1) throw new DecodeError("invalid-length");

  const out = new Uint8Array(Math.floor((body.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let j = 0;
  for (const ch of body) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new DecodeError("invalid-character");
    value = ((value << 6) | idx) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (value >> bits) & 0xff;
    }
  }
  return out;
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
  const clean = input.replace(/\s+/g, "").toUpperCase();
  const body = clean.replace(/=+$/, "");
  const padding = clean.length - body.length;
  if (!BASE32_VALID_TAIL.has(body.length % 8)) throw new DecodeError("invalid-length");
  // Padding, when present, must fill exactly the last 8-character block.
  if (padding > 0 && padding !== (8 - (body.length % 8)) % 8) throw new DecodeError("invalid-length");

  const out = new Uint8Array(Math.floor((body.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let j = 0;
  for (const ch of body) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new DecodeError("invalid-character");
    value = ((value << 5) | idx) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[j++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

export function decode(input: string, variant: Variant): string {
  if (variant === "url-safe") return bytesToText(base64ToBytes(input, URL_SAFE, false));
  if (variant === "base32") return bytesToText(base32ToBytes(input));
  return bytesToText(base64ToBytes(input, STANDARD, true));
}

const BASE64_SHAPE = /^[A-Za-z0-9+/_-]+={0,2}$/;
const HEX_OR_DIGITS = /^[0-9a-f]+$/i;
// Control characters other than tab, LF and CR mean the decoded bytes are not readable text.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * Scores how likely a pasted text is Base64 that decodes to readable text.
 * 0 means "not Base64"; never above 1.
 */
export function detectPaste(text: string): number {
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
