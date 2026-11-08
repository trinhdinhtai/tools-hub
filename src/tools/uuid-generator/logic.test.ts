import { describe, expect, it } from "vitest";
import { detectPaste, generate, generateUlid, GeneratorError, inspect, InspectError, type GenerateOptions, type Version } from "./logic";

/** Randomness that always hands out the same leading bytes (zeros after), so a generated ID matches a fixed vector. */
function fixedBytes(pattern: readonly number[]): (length: number) => Uint8Array {
  return (length: number) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < Math.min(length, pattern.length); i++) bytes[i] = pattern[i]!;
    return bytes;
  };
}

const VECTOR_MS = 1645557742000; // Tuesday, February 22, 2022 2:22:22 PM GMT-05:00, RFC 9562 §A
// clock_seq 0x33C8 and node 9F6BDECED846, the RFC's randomized values (§A.1).
const VECTOR_OPTIONS: GenerateOptions = {
  nowMs: () => VECTOR_MS,
  randomBytes: fixedBytes([0x33, 0xc8, 0x9f, 0x6b, 0xde, 0xce, 0xd8, 0x46]),
};

describe("generate", () => {
  // All UUID vectors are the examples of RFC 9562 Appendix A.
  const VECTORS: readonly [Version, string, GenerateOptions | undefined][] = [
    ["v1", "c232ab00-9414-11ec-b3c8-9f6bdeced846", VECTOR_OPTIONS],
    ["v6", "1ec9414c-232a-6b00-b3c8-9f6bdeced846", VECTOR_OPTIONS],
    [
      "v7",
      "017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
      // The first 6 raw bytes are discarded when the timestamp overwrites them.
      { nowMs: () => VECTOR_MS, randomBytes: fixedBytes([0, 0, 0, 0, 0, 0, 0x7c, 0xc3, 0x98, 0xc4, 0xdc, 0x0c, 0x0c, 0x07, 0x39, 0x8f]) },
    ],
    [
      "v4",
      "919108f7-52d1-4320-9bac-f847db4148a8",
      { randomBytes: fixedBytes([0x91, 0x91, 0x08, 0xf7, 0x52, 0xd1, 0x33, 0x20, 0x5b, 0xac, 0xf8, 0x47, 0xdb, 0x41, 0x48, 0xa8]) },
    ],
    ["v3", "5df41881-3aed-3515-88a7-2f4a814cf09e", undefined],
    ["v5", "2ed6657d-e927-568b-95e1-2665a8aea6a2", undefined],
  ];

  it.each(VECTORS)("%s matches its RFC vector", (version, expected, options) => {
    expect(generate(version, { namespace: "dns", name: "www.example.com" }, options)).toBe(expected);
  });

  it("v3 and v5 of 'python.org' in the DNS namespace match RFC 4122 Appendix B", () => {
    // Cross-checked with Node's crypto (MD5/SHA-1 over namespace ‖ name, an independent computation).
    expect(generate("v3", { namespace: "dns", name: "python.org" }, {})).toBe("6fa459ea-ee8a-3ca4-894e-db77e160355e");
    expect(generate("v5", { namespace: "dns", name: "python.org" }, {})).toBe("886313e1-3b8a-5372-9b90-0c9aee199e5d");
  });

  it("accepts a custom namespace UUID, braced or plain, and treats it like a named one", () => {
    const dns = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    expect(generate("v5", { namespace: `{${dns}}`, name: "www.example.com" }, {})).toBe(
      generate("v5", { namespace: dns, name: "www.example.com" }, {}),
    );
    expect(generate("v5", { namespace: dns, name: "www.example.com" }, {})).toBe(
      generate("v5", { namespace: "dns", name: "www.example.com" }, {}),
    );
  });

  it("stamps the right version on every kind of ID, and stays canonical", () => {
    const expectedVersion = { v1: 1, v3: 3, v4: 4, v5: 5, v6: 6, v7: 7, ulid: null } as Record<Version, number | null>;
    const input = { namespace: "dns", name: "x" };
    for (const version of ["v1", "v3", "v4", "v5", "v6", "v7", "ulid"] as const) {
      const one = generate(version, input, {});
      expect(inspect(one)).toMatchObject({ kind: version === "ulid" ? "ulid" : "uuid", canonical: one, version: expectedVersion[version] });
    }
  });

  it("makes different calls random, except the hash-based v3/v5", () => {
    const input = { namespace: "dns", name: "x" };
    for (const version of ["v1", "v4", "v6", "v7", "ulid"] as const) {
      expect(generate(version, input, {})).not.toBe(generate(version, input, {}));
    }
    for (const version of ["v3", "v5"] as const) {
      expect(generate(version, input, {})).toBe(generate(version, input, {}));
    }
  });

  it("orders time-based IDs lexicographically where the spec promises it", () => {
    // v1 is left out on purpose: it stores the least significant time bits first, so it never sorts by time.
    const at = (ms: number) => ({ nowMs: () => ms });
    for (const version of ["v6", "v7"] as const) {
      const ids = [at(1000), at(2000), at(3000)].map((options) => generate(version, null, options));
      expect([...ids].sort()).toEqual(ids);
    }
    const ulids = [at(1000), at(2000), at(3000)].map((options) => generateUlid(options));
    expect([...ulids].sort()).toEqual(ulids);
  });

  it("throws on an empty name and on a namespace that is neither named nor a UUID", () => {
    expect(() => generate("v5", { namespace: "dns", name: "" }, {})).toThrow(GeneratorError);
    expect(() => generate("v3", null, {})).toThrow(GeneratorError);
    expect(() => generate("v5", { namespace: "not-a-uuid", name: "x" }, {})).toThrow(GeneratorError);
  });

  it("throws on a time out of the 48-bit Unix range", () => {
    expect(() => generate("v7", null, { nowMs: () => -1 })).toThrow(GeneratorError);
    expect(() => generate("v7", null, { nowMs: () => 2 ** 48 })).toThrow(GeneratorError);
    expect(() => generateUlid({ nowMs: () => 2 ** 48 })).toThrow(GeneratorError);
  });

  it("makes many IDs without repeats", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generate("v4", null, {}));
    expect(seen.size).toBe(1000);
  });
});

describe("generateUlid", () => {
  it("encodes its timestamp first, then its randomness, in Crockford Base32", () => {
    // Computed independently with plain Node (Crockford Base32 over 48-bit ms ‖ 80 zero bits).
    expect(generateUlid({ nowMs: () => 0, randomBytes: () => new Uint8Array(10) })).toBe("00000000000000000000000000");
    expect(generateUlid({ nowMs: () => VECTOR_MS, randomBytes: () => new Uint8Array(10) })).toBe("01FWHE4YDG0000000000000000");
  });

  it("is random in the last 80 bits, so two at the same ms differ", () => {
    const one = generateUlid({ nowMs: () => VECTOR_MS });
    expect(generateUlid({ nowMs: () => VECTOR_MS })).not.toBe(one);
  });
});

describe("inspect", () => {
  it("reads back every RFC vector's version and variant", () => {
    const cases = [
      ["c232ab00-9414-11ec-b3c8-9f6bdeced846", 1],
      ["5df41881-3aed-3515-88a7-2f4a814cf09e", 3],
      ["919108f7-52d1-4320-9bac-f847db4148a8", 4],
      ["2ed6657d-e927-568b-95e1-2665a8aea6a2", 5],
      ["1ec9414c-232a-6b00-b3c8-9f6bdeced846", 6],
      ["017f22e2-79b0-7cc3-98c4-dc0c0c07398f", 7],
    ] as const;
    for (const [uuid, version] of cases) {
      expect(inspect(uuid)).toMatchObject({ kind: "uuid", canonical: uuid, version, variant: "rfc4122" });
    }
  });

  it("accepts braced, urn-prefixed and uppercase UUIDs, and canonicalizes them", () => {
    const shapes = ["{C232AB00-9414-11EC-B3C8-9F6BDECED846}", "urn:uuid:C232AB00-9414-11EC-B3C8-9F6BDECED846"];
    for (const shape of shapes) {
      expect(inspect(shape).canonical).toBe("c232ab00-9414-11ec-b3c8-9f6bdeced846");
    }
  });

  it("reads the Gregorian timestamp of v1 and v6, and the Unix one of v7", () => {
    expect(inspect("c232ab00-9414-11ec-b3c8-9f6bdeced846").timestampMs).toBe(VECTOR_MS);
    expect(inspect("1ec9414c-232a-6b00-b3c8-9f6bdeced846").timestampMs).toBe(VECTOR_MS);
    expect(inspect("017f22e2-79b0-7cc3-98c4-dc0c0c07398f").timestampMs).toBe(VECTOR_MS);
    // The hash and random versions carry no time.
    expect(inspect("919108f7-52d1-4320-9bac-f847db4148a8").timestampMs).toBeNull();
    expect(inspect("5df41881-3aed-3515-88a7-2f4a814cf09e").timestampMs).toBeNull();
  });

  it("reaches back to the UUID epoch: an all-zero v1 is 1582-10-15", () => {
    expect(inspect("00000000-0000-1000-8000-000000000000").timestampMs).toBe(-12219292800000);
  });

  it("reads the other variants, and an out-of-range version field as-is", () => {
    expect(inspect("00000000-0000-0000-0000-000000000000").variant).toBe("ncs");
    expect(inspect("00000000-0000-0000-c000-000000000000").variant).toBe("microsoft");
    expect(inspect("00000000-0000-0000-f000-000000000000").variant).toBe("reserved");
    expect(inspect("00000000-0000-c000-8000-000000000000").version).toBe(12);
  });

  it("reads a ULID and its timestamp", () => {
    // Timestamp decoded independently with plain Node (Crockford Base32 over the 128 bits, timestamp on top).
    expect(inspect("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toMatchObject({
      kind: "ulid",
      canonical: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      version: null,
      variant: null,
      timestampMs: 1469922850259,
    });
    // Case-insensitive; the canonical form is uppercase.
    expect(inspect("01arz3ndektsv4rrffq69g5fav").canonical).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });

  it.each([
    "",
    "   ",
    "hello world 🌍",
    "0".repeat(33),
    "01ARZ3NDEKTSV4RRFFQ69G5FAU" /* U is not in the Crockford alphabet */,
    "0".repeat(25) /* too short */,
    "0".repeat(27) /* too long */,
  ])("throws InspectError on %j", (text) => {
    expect(() => inspect(text)).toThrow(InspectError);
  });

  it("rejects a large Input in one anchored pass", () => {
    expect(() => inspect(`x${"0".repeat(1024 * 1024)}x`)).toThrow(InspectError);
  });

  it("round-trips what generate made, with the timestamp kind of each version", () => {
    const input = { namespace: "url", name: "Xin chào 🌍" };
    for (const version of ["v1", "v3", "v4", "v5", "v6", "v7", "ulid"] as const) {
      const id = generate(version, input, {});
      const details = inspect(id);
      expect(details.canonical).toBe(id);
      expect(details.timestampMs === null).toBe(version === "v3" || version === "v4" || version === "v5");
    }
  });
});

describe("detectPaste", () => {
  it.each([
    "c232ab00-9414-11ec-b3c8-9f6bdeced846",
    "{C232AB00-9414-11EC-B3C8-9F6BDECED846}",
    "urn:uuid:c232ab00-9414-11ec-b3c8-9f6bdeced846",
    "  c232ab00-9414-11ec-b3c8-9f6bdeced846\n",
    "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    "01arz3ndektsv4rrffq69g5fav",
  ])("recognizes %j", (text) => {
    expect(detectPaste(text)).toBe(0.9);
  });

  it.each(["", "hello", "c232ab00-9414-11ec-b3c8-", "01ARZ3NDEKTSV4RRFFQ69G5FAU", `${"0".repeat(1000)}`])("scores 0 for %j", (text) => {
    expect(detectPaste(text)).toBe(0);
  });

  it("scores 0 for a huge pasted block", () => {
    expect(detectPaste(`x${"c232ab00-9414-11ec-b3c8-9f6bdeced846\n".repeat(10_000)}`)).toBe(0);
  });
});
