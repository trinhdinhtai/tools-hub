import {
  CompactSign,
  compactVerify,
  createLocalJWKSet,
  errors,
  exportJWK,
  importJWK,
  importPKCS8,
  importSPKI,
  importX509,
  type JSONWebKeySet,
  type JWK,
} from "jose";
import { decodeJwt, tokenOf } from "./logic";

/** The algorithms a token can be verified or signed with: every JWS family the Tool handles. */
export const ALGORITHMS = [
  "HS256", "HS384", "HS512",
  "RS256", "RS384", "RS512",
  "PS256", "PS384", "PS512",
  "ES256", "ES384", "ES512",
  "EdDSA",
] as const;
export type Algorithm = (typeof ALGORITHMS)[number];

/** `Ed25519` is the fully specified name for EdDSA with that curve (RFC 9864); tokens may use either. */
const KNOWN_ALGS: readonly string[] = [...ALGORITHMS, "Ed25519"];

export type JwsErrorReason =
  | "key-empty"
  | "key-json"
  | "key-format"
  | "pem-unsupported"
  | "key-mismatch"
  | "key-invalid"
  | "jwks-no-match"
  | "jwks-secret"
  | "jwks-invalid"
  | "jws-unsupported"
  | "alg-none"
  | "alg-unsupported"
  | "private-needed"
  | "jwks-sign"
  | "payload-json"
  | "payload-not-object";

/** Why a token cannot be verified or signed with what was pasted. `detail` is the PEM label or alg a message names. */
export class JwsError extends Error {
  constructor(
    readonly reason: JwsErrorReason,
    readonly detail?: string,
  ) {
    super(detail === undefined ? reason : `${reason}: ${detail}`);
    this.name = "JwsError";
  }
}

/** Whether the signature checks out, and the `kid` of the JWKS key that checked it. */
export type Verification = { valid: boolean; kid?: string };

const utf8 = new TextEncoder();

/**
 * A text's UTF-8, copied into this realm's Uint8Array: jose checks `instanceof Uint8Array`, which fails on bytes from
 * another realm, as TextEncoder's are under jsdom.
 */
const bytesOf = (text: string) => new Uint8Array(utf8.encode(text));

type Key = CryptoKey | Uint8Array;

/**
 * The members of a JWK that are private: without them an RSA, EC or OKP key is its public half. `key_ops` goes too: a
 * private key's `["sign"]` would stop its public half from verifying.
 */
const PRIVATE_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "key_ops"] as const;

function publicJwk(jwk: JWK): JWK {
  if (jwk.kty === "oct") return jwk;
  const copy: Record<string, unknown> = { ...jwk };
  for (const member of PRIVATE_MEMBERS) delete copy[member];
  return copy as JWK;
}

/** What a pasted key text is. */
type ParsedKey =
  | { kind: "secret"; bytes: Uint8Array }
  | { kind: "jwk"; jwk: JWK }
  | { kind: "jwks"; jwks: JSONWebKeySet }
  | { kind: "pem"; label: string; pem: string };

/** PEM blocks jose reads; others, like PKCS#1 `RSA PUBLIC KEY` or SEC1 `EC PRIVATE KEY`, need converting first. */
const PEM_LABELS = ["PUBLIC KEY", "CERTIFICATE", "PRIVATE KEY"];

function parseKey(text: string): ParsedKey {
  const trimmed = text.trim();
  if (trimmed === "") throw new JwsError("key-empty");
  if (trimmed.startsWith("{")) {
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new JwsError("key-json");
    }
    const object = value as Record<string, unknown>;
    if (Array.isArray(object.keys)) return { kind: "jwks", jwks: object as unknown as JSONWebKeySet };
    if (typeof object.kty === "string") return { kind: "jwk", jwk: object as JWK };
    throw new JwsError("key-format");
  }
  const pem = /^-----BEGIN ([A-Z0-9 ]+)-----/.exec(trimmed);
  if (pem) {
    if (!PEM_LABELS.includes(pem[1]!)) throw new JwsError("pem-unsupported", pem[1]);
    return { kind: "pem", label: pem[1]!, pem: trimmed };
  }
  return { kind: "secret", bytes: bytesOf(text) };
}

/** Whether the key is a shared secret: what HS algorithms take, and the others must not. */
const isSecret = (key: ParsedKey) => key.kind === "secret" || (key.kind === "jwk" && key.jwk.kty === "oct");

/**
 * Refuses a key that is not of the kind `alg` takes. A public key must never act as an HMAC secret (the algorithm
 * confusion attack), and a secret cannot check an RSA, EC or EdDSA signature.
 */
function checkKind(key: ParsedKey, alg: string) {
  if (key.kind !== "jwks" && isSecret(key) !== alg.startsWith("HS")) throw new JwsError("key-mismatch", alg);
}

/** The token's alg, refused when it is `none` or not one the Tool knows. */
function algOf(header: Record<string, unknown>): string {
  const { alg } = header;
  if (alg === undefined || alg === "none") throw new JwsError("alg-none");
  if (typeof alg !== "string" || !KNOWN_ALGS.includes(alg)) throw new JwsError("alg-unsupported", String(alg));
  return alg;
}

/** The key that verifies `alg`: a private key is turned into its public half, which is all verifying needs. */
async function verifyingKey(key: Exclude<ParsedKey, { kind: "jwks" }>, alg: string): Promise<Key> {
  try {
    return await importVerifying(key, alg);
  } catch {
    throw new JwsError("key-invalid", alg);
  }
}

async function importVerifying(key: Exclude<ParsedKey, { kind: "jwks" }>, alg: string): Promise<Key> {
  switch (key.kind) {
    case "secret":
      return key.bytes;
    case "jwk":
      return importJWK(publicJwk(key.jwk), alg) as Promise<Key>;
    case "pem":
      if (key.label === "PUBLIC KEY") return importSPKI(key.pem, alg);
      if (key.label === "CERTIFICATE") return importX509(key.pem, alg);
      return importJWK(publicJwk(await exportJWK(await importPKCS8(key.pem, alg, { extractable: true }))), alg) as Promise<Key>;
  }
}

/** Whether `key` signed `token`: a signature that does not match is an answer, any other failure is thrown. */
async function signedBy(token: string, key: Key): Promise<boolean> {
  try {
    await compactVerify(token, key);
    return true;
  } catch (error) {
    if (error instanceof errors.JWSSignatureVerificationFailed) return false;
    // A `crit` extension or `b64: false`: JWS features beyond a plain signed JWT.
    if (error instanceof errors.JWSInvalid || error instanceof errors.JOSENotSupported) throw new JwsError("jws-unsupported");
    throw error;
  }
}

/**
 * Whether a JWS compact token's signature checks out against a pasted secret, PEM, JWK or JWKS. Only the signature:
 * claims such as exp are not checked. A JWKS gives the key the header's `kid` names, or tries each key that fits.
 */
export async function verifyJwt(text: string, keyText: string): Promise<Verification> {
  const token = tokenOf(text);
  const header = decodeJwt(token).header;
  const alg = algOf(header);
  const key = parseKey(keyText);
  checkKind(key, alg);
  if (key.kind !== "jwks") return { valid: await signedBy(token, await verifyingKey(key, alg)) };

  // jose's JWKS takes public keys only, so an HMAC secret has no place in one.
  if (alg.startsWith("HS")) throw new JwsError("jwks-secret");
  const kid = typeof header.kid === "string" ? header.kid : undefined;
  // A JWKS of private keys verifies by their public halves, as a single private key does.
  const keys = key.jwks.keys.map((jwk: unknown) => (typeof jwk === "object" && jwk !== null ? publicJwk(jwk as JWK) : jwk));
  let candidates: AsyncIterable<CryptoKey> | CryptoKey[];
  try {
    candidates = [await createLocalJWKSet({ keys } as JSONWebKeySet)({ alg, kid })];
  } catch (error) {
    if (error instanceof errors.JWKSMultipleMatchingKeys) candidates = error;
    else if (error instanceof errors.JWKSNoMatchingKey) throw new JwsError("jwks-no-match");
    else if (error instanceof errors.JWKSInvalid) throw new JwsError("jwks-invalid");
    else throw new JwsError("key-invalid", alg);
  }
  for await (const candidate of candidates) {
    if (await signedBy(token, candidate)) return kid === undefined ? { valid: true } : { valid: true, kid };
  }
  return { valid: false };
}

/** The private key that signs with `alg`. */
async function signingKey(key: ParsedKey, alg: Algorithm): Promise<Key> {
  if (key.kind === "jwks") throw new JwsError("jwks-sign");
  checkKind(key, alg);
  if (key.kind === "secret") return key.bytes;
  if (key.kind === "jwk" ? key.jwk.kty !== "oct" && key.jwk.d === undefined : key.label !== "PRIVATE KEY") {
    throw new JwsError("private-needed");
  }
  try {
    return key.kind === "jwk" ? ((await importJWK(key.jwk, alg)) as Key) : await importPKCS8(key.pem, alg);
  } catch {
    throw new JwsError("key-invalid", alg);
  }
}

/** The payload text as a JSON object, ready to sign. */
function payloadOf(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new JwsError("payload-json");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new JwsError("payload-not-object");
  return value as Record<string, unknown>;
}

/**
 * A JWS compact token of `payloadText` (a JSON object) signed with `alg` and a pasted secret, PKCS#8 PEM or private
 * JWK. The header is `{ alg, typ: "JWT" }`, with the JWK's `kid` when it has one.
 */
export async function signJwt(alg: Algorithm, payloadText: string, keyText: string): Promise<string> {
  const payload = payloadOf(payloadText);
  const parsed = parseKey(keyText);
  const key = await signingKey(parsed, alg);
  const kid = parsed.kind === "jwk" && typeof parsed.jwk.kid === "string" ? parsed.jwk.kid : undefined;
  return new CompactSign(bytesOf(JSON.stringify(payload)))
    .setProtectedHeader(kid === undefined ? { alg, typ: "JWT" } : { alg, typ: "JWT", kid })
    .sign(key);
}
