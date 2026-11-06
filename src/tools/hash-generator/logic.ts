import { hmac } from "@noble/hashes/hmac.js";
import { md5, sha1 } from "@noble/hashes/legacy.js";
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js";
import { keccak_256, sha3_224, sha3_256, sha3_384, sha3_512 } from "@noble/hashes/sha3.js";
import { bytesToHex, type CHash } from "@noble/hashes/utils.js";

/** Every hash the Tool computes, in the order it lists them. Names stay untranslated (they are technical terms). */
export const ALGORITHMS = [
  { id: "md5", name: "MD5" },
  { id: "sha-1", name: "SHA-1" },
  { id: "sha-224", name: "SHA-224" },
  { id: "sha-256", name: "SHA-256" },
  { id: "sha-384", name: "SHA-384" },
  { id: "sha-512", name: "SHA-512" },
  { id: "sha3-224", name: "SHA3-224" },
  { id: "sha3-256", name: "SHA3-256" },
  { id: "sha3-384", name: "SHA3-384" },
  { id: "sha3-512", name: "SHA3-512" },
  { id: "keccak-256", name: "Keccak-256" },
] as const;

export type AlgorithmId = (typeof ALGORITHMS)[number]["id"];

const HASHES: Record<AlgorithmId, CHash> = {
  md5,
  "sha-1": sha1,
  "sha-224": sha224,
  "sha-256": sha256,
  "sha-384": sha384,
  "sha-512": sha512,
  "sha3-224": sha3_224,
  "sha3-256": sha3_256,
  "sha3-384": sha3_384,
  "sha3-512": sha3_512,
  "keccak-256": keccak_256,
};

/** Every algorithm's digest of `data` as lowercase hex, keyed by algorithm id. `key` makes each an HMAC. */
export function digestsOf(data: Uint8Array, key: Uint8Array | null): Record<AlgorithmId, string> {
  const out = {} as Record<AlgorithmId, string>;
  for (const { id } of ALGORITHMS) {
    const hash = HASHES[id];
    out[id] = bytesToHex(key === null ? hash(data) : hmac(hash, key, data));
  }
  return out;
}
