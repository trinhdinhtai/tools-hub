// Punycode, RFC 3492: Unicode text as the ASCII letters, digits and hyphens a domain label may hold.

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 0x80;
/** Past this the RFC's 32-bit arithmetic would overflow. */
const MAX_INT = 0x7fffffff;

/** Bias adaptation (RFC 3492 §6.1). */
function adapt(delta: number, points: number, first: boolean): number {
  let d = first ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
  d += Math.floor(d / points);
  let k = 0;
  while (d > ((BASE - T_MIN) * T_MAX) / 2) {
    d = Math.floor(d / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * d) / (d + SKEW));
}

const threshold = (k: number, bias: number) => (k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias);

/** 0–25 are a–z, 26–35 are 0–9. */
const digitChar = (digit: number) => String.fromCharCode(digit < 26 ? 97 + digit : 22 + digit);

/** A digit's value whatever its case, or -1 for a character that is not one. */
function digitValue(code: number): number {
  if (code >= 48 && code <= 57) return code - 22;
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97;
  return -1;
}

/** Encodes text as Punycode, without the `xn--` prefix. Basic code points keep their case. */
export function punycodeEncode(input: string): string {
  const points = Array.from(input, (ch) => ch.codePointAt(0)!);
  const basic = points.filter((point) => point < INITIAL_N);
  let output = basic.map((point) => String.fromCharCode(point)).join("");
  if (basic.length > 0) output += "-";

  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;
  for (let handled = basic.length; handled < points.length; ) {
    const next = points.reduce((min, point) => (point >= n && point < min ? point : min), Infinity);
    delta += (next - n) * (handled + 1);
    n = next;
    for (const point of points) {
      if (point < n) delta++;
      if (point !== n) continue;
      let q = delta;
      for (let k = BASE; ; k += BASE) {
        const t = threshold(k, bias);
        if (q < t) break;
        output += digitChar(t + ((q - t) % (BASE - t)));
        q = Math.floor((q - t) / (BASE - t));
      }
      output += digitChar(q);
      bias = adapt(delta, handled + 1, handled === basic.length);
      delta = 0;
      handled++;
    }
    delta++;
    n++;
  }
  return output;
}

/** Decodes Punycode, without the `xn--` prefix. Throws a `RangeError` when it is not valid Punycode. */
export function punycodeDecode(input: string): string {
  const delimiter = input.lastIndexOf("-");
  const output: number[] = [];
  for (let j = 0; j < delimiter; j++) {
    const code = input.charCodeAt(j);
    if (code >= INITIAL_N) throw new RangeError("Punycode: a basic code point is not ASCII");
    output.push(code);
  }

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  for (let pos = delimiter + 1; pos < input.length; ) {
    const oldI = i;
    let weight = 1;
    for (let k = BASE; ; k += BASE) {
      if (pos >= input.length) throw new RangeError("Punycode: ends in the middle of a number");
      const digit = digitValue(input.charCodeAt(pos++));
      if (digit < 0) throw new RangeError("Punycode: not a digit");
      i += digit * weight;
      if (i > MAX_INT) throw new RangeError("Punycode: overflow");
      const t = threshold(k, bias);
      if (digit < t) break;
      weight *= BASE - t;
      if (weight > MAX_INT) throw new RangeError("Punycode: overflow");
    }
    bias = adapt(i - oldI, output.length + 1, oldI === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new RangeError("Punycode: not a Unicode scalar value");
    output.splice(i++, 0, n);
  }
  return output.map((point) => String.fromCodePoint(point)).join("");
}
