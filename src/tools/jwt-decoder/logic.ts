/** A decoded JWT: its header and payload as JSON, and its signature as it was written (base64url). */
export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
}

export type JwtErrorReason = "empty" | "whitespace" | "parts" | "encrypted" | "base64" | "utf8" | "json" | "not-object";

/** The part of a token an error is in. */
export type JwtPart = "header" | "payload" | "signature";

/** Why a text is not a JWT that can be decoded, and in which part when it is one part that is wrong. */
export class JwtError extends Error {
  constructor(
    readonly reason: JwtErrorReason,
    readonly part?: JwtPart,
  ) {
    super(reason);
    this.name = "JwtError";
  }
}

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** Base64url without padding (RFC 7515): a length that leaves one character over is not whole bytes. */
const BASE64URL = /^[A-Za-z0-9_-]*$/;

function checkBase64url(segment: string, part: JwtPart) {
  if (!BASE64URL.test(segment) || segment.length % 4 === 1) throw new JwtError("base64", part);
}

/** A header or payload: base64url of UTF-8 JSON that is an object. */
function decodeSegment(segment: string, part: JwtPart): Record<string, unknown> {
  checkBase64url(segment, part);
  const binary = atob(segment.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  let json: string;
  try {
    json = UTF8.decode(bytes);
  } catch {
    throw new JwtError("utf8", part);
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new JwtError("json", part);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new JwtError("not-object", part);
  return value as Record<string, unknown>;
}

/** `Bearer ` or a whole `Authorization: Bearer ` header line, as copied from a request. */
const BEARER = /^(?:authorization:\s*)?bearer\s+/i;

/**
 * The token in a pasted text: without a Bearer prefix, and joined back where it was wrapped over lines. A space left
 * within a line is refused: gluing the words after a token onto its signature would hide that they are there.
 */
export function tokenOf(text: string): string {
  const token = text.trim().replace(BEARER, "").replace(/\s*[\r\n]\s*/g, "");
  if (/\s/.test(token)) throw new JwtError("whitespace");
  return token;
}

/**
 * Decodes a JWS compact JWT (`header.payload.signature`), also after `Bearer ` or wrapped over lines. Throws a JwtError
 * saying why it cannot. Decoding is not verifying: the signature is given back as written, not checked against any key.
 */
export function decodeJwt(text: string): DecodedJwt {
  const token = tokenOf(text);
  if (token === "") throw new JwtError("empty");
  const parts = token.split(".");
  // A JWE has five parts and an encrypted payload: there is nothing to read without the key.
  if (parts.length === 5) throw new JwtError("encrypted");
  if (parts.length !== 3) throw new JwtError("parts");
  const [header, payload, signature] = parts as [string, string, string];
  const decoded = { header: decodeSegment(header, "header"), payload: decodeSegment(payload, "payload") };
  checkBase64url(signature, "signature");
  return { ...decoded, signature };
}

/**
 * Paste Detection: a token whose header decodes and names its `alg` is near certain. One token on one line only, maybe
 * after `Bearer `: a token wrapped over lines, or among other words or lines, is not offered.
 */
export function detectPaste(text: string): number {
  const rest = text.trim().replace(BEARER, "");
  if (rest === "" || /\s/.test(rest)) return 0;
  try {
    return typeof decodeJwt(rest).header.alg === "string" ? 0.95 : 0;
  } catch {
    return 0;
  }
}

/** The registered claims that are times (RFC 7519 §4.1), in the order they matter to whether a token works now. */
export const TIME_CLAIMS = ["exp", "nbf", "iat"] as const;
export type TimeClaim = (typeof TIME_CLAIMS)[number];

export interface TimeClaimValue {
  claim: TimeClaim;
  /** The claim as the token has it. */
  value: unknown;
  /** The instant in milliseconds since 1970, or null when the value is not a NumericDate a date can show. */
  ms: number | null;
}

/** The furthest a `Date` reaches either side of 1970, in milliseconds. */
const MAX_MS = 8_640_000_000_000_000;

/** A NumericDate (seconds since 1970, fractions allowed) in milliseconds, or null. */
function numericDate(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const ms = value * 1000;
  return Math.abs(ms) <= MAX_MS ? ms : null;
}

/** The time claims the payload has, read as instants. */
export function timeClaims(payload: Record<string, unknown>): TimeClaimValue[] {
  return TIME_CLAIMS.filter((claim) => claim in payload).map((claim) => ({ claim, value: payload[claim], ms: numericDate(payload[claim]) }));
}

/**
 * Whether a token may be used now, by its exp and nbf, and `at` the instant (milliseconds) that decides it: the exp it
 * expires at, or the nbf it starts at. `invalid` names the claim that is not a date.
 */
export type TokenStatus =
  | { state: "active" | "expired" | "not-yet-valid"; at: number }
  | { state: "no-expiry" }
  | { state: "invalid"; claim: "exp" | "nbf" };

/**
 * The token's status at `now` (milliseconds) by RFC 7519, with no leeway: expired from exp on, not yet valid before nbf,
 * `no-expiry` when it has no exp. A wrong iat does not count: it says nothing about whether the token works now.
 */
export function tokenStatus(payload: Record<string, unknown>, now: number): TokenStatus {
  const exp = "exp" in payload ? numericDate(payload.exp) : undefined;
  const nbf = "nbf" in payload ? numericDate(payload.nbf) : undefined;
  if (exp === null) return { state: "invalid", claim: "exp" };
  if (nbf === null) return { state: "invalid", claim: "nbf" };
  if (exp !== undefined && now >= exp) return { state: "expired", at: exp };
  if (nbf !== undefined && now < nbf) return { state: "not-yet-valid", at: nbf };
  return exp === undefined ? { state: "no-expiry" } : { state: "active", at: exp };
}
