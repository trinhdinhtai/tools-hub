import { describe, expect, it } from "vitest";
import { JwsError, signJwt, verifyJwt } from "./crypto";
import { decodeJwt } from "./logic";
import * as f from "./crypto.fixtures";

/** The token with its payload swapped for another one: the signature no longer matches it. */
/** The JwsError a promise rejects with, as its reason and detail. */
async function jwsError(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(JwsError);
  const { reason, detail } = error as JwsError;
  return detail === undefined ? { reason } : { reason, detail };
}

function tampered(token: string): string {
  const [header, , signature] = token.split(".");
  return `${header}.${btoa('{"sub":"admin"}').replace(/=+$/, "")}.${signature}`;
}

/** RFC 7515 Appendix A.1: an HS256 JWS and its key. */
const RFC_HS256 =
  "eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_HS256_JWK = '{"kty":"oct","k":"AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow"}';

describe("verifyJwt", () => {
  it("verifies an HS256 token with its JWK, and refuses a wrong secret", async () => {
    expect(await verifyJwt(RFC_HS256, RFC_HS256_JWK)).toEqual({ valid: true });
    expect(await verifyJwt(RFC_HS256, "not the secret")).toEqual({ valid: false });
  });

  it.each([
    ["RS256", "a PEM public key", f.tokens.RS256, f.rsaPublicPem],
    ["RS256", "an X.509 certificate", f.tokens.RS256, f.rsaCertificatePem],
    ["RS256", "a JWK", f.tokens.RS256, JSON.stringify(f.rsaPublicJwk)],
    ["PS256", "a PEM public key", f.tokens.PS256, f.rsaPublicPem],
    ["ES256", "a PEM public key", f.tokens.ES256, f.ec256PublicPem],
    ["ES256", "a JWK", f.tokens.ES256, JSON.stringify(f.ec256PublicJwk)],
    ["ES384", "a JWK", f.tokens.ES384, JSON.stringify(f.ec384PublicJwk)],
    ["EdDSA", "a PEM public key", f.tokens.EdDSA, f.edPublicPem],
    ["EdDSA", "a JWK", f.tokens.EdDSA, JSON.stringify(f.edPublicJwk)],
    ["HS512", "a Unicode secret", f.tokens.HS512, f.hs512Secret],
  ])("verifies %s with %s, and refuses the token once tampered with", async (_alg, _key, token, key) => {
    expect(await verifyJwt(token, key)).toEqual({ valid: true });
    expect(await verifyJwt(tampered(token), key)).toEqual({ valid: false });
  });

  it("picks the key from a pasted JWKS by kid, and says which one it was", async () => {
    const jwks = JSON.stringify({ keys: [f.ec256PublicJwk, f.rsaPublicJwk] });
    expect(await verifyJwt(f.tokens.RS256, jwks)).toEqual({ valid: true, kid: "rsa-1" });
    expect(await verifyJwt(tampered(f.tokens.RS256), jwks)).toEqual({ valid: false });
  });

  it("tries every JWKS key that could have signed a token without a kid", async () => {
    const otherEd = { kty: "OKP", crv: "Ed25519", x: "geAXi-iuKmtl0kFfx2pQp9KmDFj-YhMX_IMSLZTV7R0" };
    const jwks = JSON.stringify({ keys: [otherEd, f.rsaPublicJwk, f.edPublicJwk] });
    expect(await verifyJwt(f.tokens.EdDSA, jwks)).toEqual({ valid: true });
  });

  it("verifies with a private key too, by its public half", async () => {
    expect(await verifyJwt(f.tokens.RS256, JSON.stringify(f.rsaPrivateJwk))).toEqual({ valid: true });
    expect(await verifyJwt(f.tokens.ES256, f.ec256PrivatePem)).toEqual({ valid: true });
    expect(await verifyJwt(f.tokens.EdDSA, f.edPrivatePem)).toEqual({ valid: true });
  });

  it("verifies with a private JWK whose key_ops only allow signing, and with a JWKS of private keys", async () => {
    const signOnly = { ...f.rsaPrivateJwk, key_ops: ["sign"] };
    expect(await verifyJwt(f.tokens.RS256, JSON.stringify(signOnly))).toEqual({ valid: true });
    expect(await verifyJwt(f.tokens.RS256, JSON.stringify({ keys: [signOnly] }))).toEqual({ valid: true, kid: "rsa-1" });
  });

  it("says a JWKS holds no HMAC secrets, and when it is not a valid JWKS", async () => {
    expect(await jwsError(verifyJwt(f.tokens.HS512, JSON.stringify({ keys: [{ kty: "oct", k: "c2VjcmV0" }] })))).toEqual({ reason: "jwks-secret" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, '{"keys":[1]}'))).toEqual({ reason: "jwks-invalid" });
  });

  it("names a JWS feature it does not support instead of failing in jose's words", async () => {
    const [, payload, signature] = f.tokens.HS512.split(".");
    const header = btoa('{"alg":"HS512","crit":["exp"],"exp":1}').replace(/=+$/, "");
    expect(await jwsError(verifyJwt(`${header}.${payload}.${signature}`, f.hs512Secret))).toEqual({ reason: "jws-unsupported" });
  });

  it("says what is wrong with a key it cannot use", async () => {
    expect(await jwsError(verifyJwt(f.tokens.RS256, ""))).toEqual({ reason: "key-empty" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, "  \n "))).toEqual({ reason: "key-empty" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, '{"kty":'))).toEqual({ reason: "key-json" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, '{"name":"not a key"}'))).toEqual({ reason: "key-format" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, f.rsaPkcs1PublicPem))).toEqual({ reason: "pem-unsupported", detail: "RSA PUBLIC KEY" });
    expect(await jwsError(verifyJwt(f.tokens.ES256, f.ecSec1PrivatePem))).toEqual({ reason: "pem-unsupported", detail: "EC PRIVATE KEY" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, "-----BEGIN PUBLIC KEY-----\nnot base64\n-----END PUBLIC KEY-----"))).toEqual({
      reason: "key-invalid",
      detail: "RS256",
    });
  });

  it("refuses a key of the wrong kind for the token's alg, rather than verifying with it", async () => {
    // A public key used as an HMAC secret is the classic algorithm confusion attack.
    expect(await jwsError(verifyJwt(f.tokens.HS512, f.rsaPublicPem))).toEqual({ reason: "key-mismatch", detail: "HS512" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, "a secret"))).toEqual({ reason: "key-mismatch", detail: "RS256" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, f.ec256PublicPem))).toEqual({ reason: "key-invalid", detail: "RS256" });
    expect(await jwsError(verifyJwt(f.tokens.ES384, JSON.stringify(f.ec256PublicJwk)))).toEqual({ reason: "key-invalid", detail: "ES384" });
  });

  it("says when no key of a JWKS fits the token", async () => {
    expect(await jwsError(verifyJwt(f.tokens.RS256, JSON.stringify({ keys: [f.ec256PublicJwk] })))).toEqual({ reason: "jwks-no-match" });
    expect(await jwsError(verifyJwt(f.tokens.RS256, '{"keys":[]}'))).toEqual({ reason: "jwks-no-match" });
  });

  it("has nothing to verify on an unsigned token, and names an alg it does not know", async () => {
    const unsigned = `${btoa('{"alg":"none"}').replace(/=+$/, "")}.${btoa("{}").replace(/=+$/, "")}.`;
    expect(await jwsError(verifyJwt(unsigned, "secret"))).toEqual({ reason: "alg-none" });
    const odd = `${btoa('{"alg":"XY256"}').replace(/=+$/, "")}.${btoa("{}").replace(/=+$/, "")}.c2ln`;
    expect(await jwsError(verifyJwt(odd, "secret"))).toEqual({ reason: "alg-unsupported", detail: "XY256" });
  });
});

describe("signJwt", () => {
  it("signs an HS256 token with a Unicode secret, exactly as any other HMAC signer would", async () => {
    // Computed with Node's crypto: HMAC-SHA256 over base64url(header).base64url(payload), secret as UTF-8.
    expect(await signJwt("HS256", '{"sub":"42","name":"Tài"}', "bí mật")).toBe(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsIm5hbWUiOiJUw6BpIn0.J-q-tQoh3wcF_iCzu_XqeRT13S1rn-flSuXR-9vhyH4",
    );
  });

  it.each([
    ["RS256", "a PKCS#8 PEM", f.rsaPrivatePem, f.rsaPublicPem],
    ["PS384", "a PKCS#8 PEM", f.rsaPrivatePem, f.rsaPublicPem],
    ["ES256", "a PKCS#8 PEM", f.ec256PrivatePem, f.ec256PublicPem],
    ["EdDSA", "a PKCS#8 PEM", f.edPrivatePem, f.edPublicPem],
    ["EdDSA", "a private JWK", JSON.stringify(f.edPrivateJwk), JSON.stringify(f.edPublicJwk)],
    ["HS512", "a secret", f.hs512Secret, f.hs512Secret],
  ] as const)("signs %s with %s, and the public key verifies it", async (alg, _key, privateKey, publicKey) => {
    const token = await signJwt(alg, '{"sub":"42"}', privateKey);
    expect(decodeJwt(token).header).toEqual({ alg, typ: "JWT" });
    expect(await verifyJwt(token, publicKey)).toEqual({ valid: true });
  });

  it("puts the kid of a JWK in the header, so a JWKS can find the key", async () => {
    const token = await signJwt("RS512", "{}", JSON.stringify(f.rsaPrivateJwk));
    expect(decodeJwt(token).header).toEqual({ alg: "RS512", typ: "JWT", kid: "rsa-1" });
    expect(await verifyJwt(token, JSON.stringify({ keys: [f.ec256PublicJwk, f.rsaPublicJwk] }))).toEqual({ valid: true, kid: "rsa-1" });
  });

  it("signs a large payload, keeping its Unicode", async () => {
    const big = "Trịnh Đình Tài 🚀 ".repeat(50_000);
    const token = await signJwt("ES512", JSON.stringify({ big }), f.ec521PrivatePem);
    expect(decodeJwt(token).payload).toEqual({ big });
  });

  it("says what is wrong with the payload or the key", async () => {
    expect(await jwsError(signJwt("HS256", "", "secret"))).toEqual({ reason: "payload-json" });
    expect(await jwsError(signJwt("HS256", "{oops", "secret"))).toEqual({ reason: "payload-json" });
    expect(await jwsError(signJwt("HS256", "[1, 2]", "secret"))).toEqual({ reason: "payload-not-object" });
    expect(await jwsError(signJwt("HS256", "{}", ""))).toEqual({ reason: "key-empty" });
    expect(await jwsError(signJwt("RS256", "{}", f.rsaPublicPem))).toEqual({ reason: "private-needed" });
    expect(await jwsError(signJwt("RS256", "{}", JSON.stringify(f.rsaPublicJwk)))).toEqual({ reason: "private-needed" });
    expect(await jwsError(signJwt("RS256", "{}", f.rsaPkcs1PrivatePem))).toEqual({ reason: "pem-unsupported", detail: "RSA PRIVATE KEY" });
    expect(await jwsError(signJwt("HS256", "{}", f.rsaPrivatePem))).toEqual({ reason: "key-mismatch", detail: "HS256" });
    expect(await jwsError(signJwt("ES256", "{}", f.rsaPrivatePem))).toEqual({ reason: "key-invalid", detail: "ES256" });
    expect(await jwsError(signJwt("ES256", "{}", JSON.stringify({ keys: [] })))).toEqual({ reason: "jwks-sign" });
  });
});
