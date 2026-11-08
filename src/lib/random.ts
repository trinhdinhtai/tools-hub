/** Cryptographic randomness for Tools that draw secrets: the only source is `crypto.getRandomValues` (ADR-0001). */

/** A source of cryptographic random bytes; injectable so tests are reproducible. */
export type RandomBytes = (length: number) => Uint8Array;

/** The default randomness source: `crypto.getRandomValues`. */
export const cryptoRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/** A uniform integer in [0, max) out of the random bytes, by rejection sampling: no modulo bias. */
export function randomInt(max: number, randomBytes: RandomBytes): number {
  if (max <= 1) return 0;
  const bytesPerDraw = Math.max(Math.ceil(Math.log2(max) / 8), 1);
  const drawSize = 256 ** bytesPerDraw;
  const limit = drawSize - (drawSize % max);
  for (;;) {
    const bytes = randomBytes(bytesPerDraw);
    let value = 0;
    for (const byte of bytes) value = value * 256 + byte;
    if (value < limit) return value % max;
  }
}
