import { describe, expect, it } from "vitest";
import { ALGORITHMS, digestsOf, type AlgorithmId } from "./logic";

const utf8 = new TextEncoder();
const digestOf = (data: Uint8Array) => digestsOf(data, null);

// Standard test vectors: RFC 1321 (MD5), FIPS 180-4 (SHA-1, SHA-2), FIPS 202 (SHA-3) and the Keccak team's
// reference values for Keccak-256. Cross-checked against Node's OpenSSL crypto, an independent implementation.
const VECTORS: readonly [AlgorithmId, string, string][] = [
  ["md5", "d41d8cd98f00b204e9800998ecf8427e", "900150983cd24fb0d6963f7d28e17f72"],
  ["sha-1", "da39a3ee5e6b4b0d3255bfef95601890afd80709", "a9993e364706816aba3e25717850c26c9cd0d89d"],
  ["sha-224", "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f", "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7"],
  [
    "sha-256",
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  ],
  [
    "sha-384",
    "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b",
    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
  ],
  [
    "sha-512",
    "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  ],
  [
    "sha3-224",
    "6b4e03423667dbb73b6e15454f0eb1abd4597f9a1b078e3f5b5a6bc7",
    "e642824c3f8cf24ad09234ee7d3c766fc9a3a5168d0c94ad73b46fdf",
  ],
  [
    "sha3-256",
    "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
    "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
  ],
  [
    "sha3-384",
    "0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2ac3713831264adb47fb6bd1e058d5f004",
    "ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25",
  ],
  [
    "sha3-512",
    "a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26",
    "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0",
  ],
  [
    "keccak-256",
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
  ],
];

describe("digestsOf", () => {
  it("covers every algorithm exactly once", () => {
    expect(ALGORITHMS.map((a) => a.id)).toEqual(VECTORS.map(([id]) => id));
  });

  it.each(VECTORS)("%s of the empty string and of 'abc'", (id, empty, abc) => {
    expect(digestOf(new Uint8Array(0))[id]).toBe(empty);
    expect(digestOf(utf8.encode("abc"))[id]).toBe(abc);
  });

  it("hashes a large Input (1 MiB)", () => {
    const digests = digestOf(new Uint8Array(1024 * 1024).fill(0x61));
    expect(digests["md5"]).toBe("7202826a7791073fe2787f0c94603278");
    expect(digests["sha-256"]).toBe("9bc1b2a288b26af7257a36277ae3816a7d4f16e89c1e7e77d0a5c48bad62b360");
    expect(digests["sha3-256"]).toBe("5048a5da1f1212329f4b7fbfcae42c03c5378312c643085410661fdb3569b50a");
  });

  it("hashes Unicode text as UTF-8", () => {
    // SHA-256 and SHA3-256 of "Xin chào 🌍" as UTF-8, computed with Node's OpenSSL crypto.
    const digests = digestOf(utf8.encode("Xin chào 🌍"));
    expect(digests["sha-256"]).toBe("c13e47026aa57da52bcf8085268b43cfc785cd1476c3c9a1ea3143d0cf9910d6");
    expect(digests["sha3-256"]).toBe("a5733617a486f64f1e7f7a6bdc1ef37aa4a51e363d61da282379b210cb03983a");
  });
});

describe("digestsOf with a key (HMAC)", () => {
  const hmacOf = (data: string, key: Uint8Array) => digestsOf(utf8.encode(data), key);

  // RFC 4231 test cases 1 and 2 (its SHA variants), plus RFC 2202's HMAC-MD5, whose test case 1 uses a
  // 16-byte key. Verified with Node's OpenSSL crypto, an independent implementation.
  it("RFC 4231 case 1: 0x0b-repeated key over 'Hi There'", () => {
    expect(hmacOf("Hi There", new Uint8Array(20).fill(0x0b))).toMatchObject({
      "sha-1": "b617318655057264e28bc0b6fb378c8ef146be00",
      "sha-224": "896fb1128abbdf196832107cd49df33f47b4b1169912ba4f53684b22",
      "sha-256": "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
      "sha-384": "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6",
      "sha-512":
        "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
      "sha3-256": "ba85192310dffa96e2a3a40e69774351140bb7185e1202cdcc917589f95e16bb",
      "sha3-512": "eb3fbd4b2eaab8f5c504bd3a41465aacec15770a7cabac531e482f860b5ec7ba47ccb2c6f2afce8f88d22b6dc61380f23a668fd3888bb80537c0a0b86407689e",
    });
    expect(hmacOf("Hi There", new Uint8Array(16).fill(0x0b))["md5"]).toBe("9294727a3638bb1c13f48ef8158bfc9d");
  });

  it("RFC 4231 case 2: 'Jefe' over 'what do ya want for nothing?'", () => {
    const key = utf8.encode("Jefe");
    expect(hmacOf("what do ya want for nothing?", key)).toMatchObject({
      md5: "750c783e6ab0b503eaa86e310a5db738",
      "sha-1": "effcdf6ae5eb2fa2d27416d5f184df9c259a7c79",
      "sha-256": "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
      "sha-512":
        "164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737",
    });
  });

  it("hashes a key longer than the block size by hashing it first", () => {
    expect(hmacOf("Test Using Larger Than Block-Size Key - Hash Key First", new Uint8Array(200).fill(0xaa))).toMatchObject({
      md5: "8df98dca2397c5c8399d42a5bcc6e477",
      "sha-1": "f91271dc2fd036f54d74d134ff739fefb59aac86",
      "sha-256": "f84c159648a99f6ace4dc6e293ebc50e9ec6936ebd7022091d9ae0f5cd6693ba",
      "sha3-256": "49ad92b02124fdac9627ae45e008a696182ab6bfb8470457777c744aeb9df06f",
    });
  });

  it("keeps Unicode text and keys as UTF-8", () => {
    expect(hmacOf("Xin chào 🌍", utf8.encode("khóa"))).toMatchObject({
      "sha-256": "f615887b4dc6a8ee2dd1140e8ac49a71fadf25a3be9f452576cd018535b2b983",
      "sha3-256": "454929fbed420692e89badd183866af43e6424cb95b7fe43c07b9e9b082a5734",
    });
  });

  it("treats an empty key as an ordinary key, not as no key", () => {
    const withEmptyKey = digestsOf(utf8.encode("abc"), new Uint8Array(0));
    const plain = digestsOf(utf8.encode("abc"), null);
    expect(withEmptyKey["sha-256"]).not.toBe(plain["sha-256"]);
    // HMAC with an empty key over 'abc', computed with Node's OpenSSL crypto.
    expect(withEmptyKey["sha-256"]).toBe("fd7adb152c05ef80dccf50a1fa4c05d5a3ec6da95575fc312ae7c5d091836351");
  });
});
