/**
 * Pure number-base logic for the Number Base Tool: parsing integers in any base into a BigInt, formatting a BigInt in
 * any base up to 36, Roman numerals, two's complement and the bit grid. No DOM, no store (ADR-0003). Everything uses
 * BigInt so numbers beyond 2^53 keep their exact value.
 */

export type NumberBaseErrorReason = "empty" | "invalid" | "no-digits" | "division-by-zero";

export class NumberBaseError extends Error {
  constructor(readonly reason: NumberBaseErrorReason) {
    super(`Invalid number input: ${reason}`);
    this.name = "NumberBaseError";
  }
}

/** The bases 2–36, as `toBase` and `parseNumber` accept them. */
const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Digit value of one character, or -1 when it is not a digit of the base. Underscores never reach this. */
function digitValue(char: string, base: number): number {
  const value = DIGITS.indexOf(char.toLowerCase());
  return 0 <= value && value < base ? value : -1;
}

/** Removes single underscores between digits, so `1_000` and `0xff_ff` parse but `_42`, `42_` and `1__2` do not. */
function stripSeparators(digits: string): string | null {
  if (/^_|_$|[^0-9a-zA-Z]_|_[^0-9a-zA-Z]/.test(digits)) return null;
  return digits.replaceAll("_", "");
}

/**
 * Parses an integer into a BigInt. With `base: "auto"` a `0x`, `0b` or `0o` prefix (after an optional sign) picks
 * hexadecimal, binary or octal, and anything else reads as decimal; an explicit base reads every character as a digit
 * of that base. Single underscores between digits are separators. Anything else throws a `NumberBaseError` whose
 * `reason` the UI translates.
 */
export function parseNumber(text: string, base: number | "auto" = "auto"): bigint {
  const raw = text.trim();
  if (raw === "") throw new NumberBaseError("empty");

  let sign = 1n;
  let body = raw;
  if (body[0] === "+" || body[0] === "-") {
    sign = body[0] === "-" ? -1n : 1n;
    body = body.slice(1);
  }

  let radix: number;
  if (base === "auto") {
    const prefixes = { "0x": 16, "0b": 2, "0o": 8 } as const;
    const prefix = body.slice(0, 2).toLowerCase() as keyof typeof prefixes;
    radix = prefix in prefixes ? prefixes[prefix] : 10;
    if (radix !== 10) body = body.slice(2);
  } else {
    radix = base;
  }

  const digits = stripSeparators(body);
  if (digits === null) throw new NumberBaseError("invalid");
  if (digits === "") throw new NumberBaseError("no-digits");

  let value = 0n;
  for (const char of digits) {
    const digit = digitValue(char, radix);
    if (digit < 0) throw new NumberBaseError("invalid");
    value = value * BigInt(radix) + BigInt(digit);
  }
  return sign * value;
}

/** Formats a BigInt in the given base (2–36), lowercase digits, `-` for negatives. */
export function toBase(value: bigint, base: number): string {
  const radix = BigInt(base);
  let rest = value < 0n ? -value : value;
  let out = "";
  do {
    out = DIGITS[Number(rest % radix)] + out;
    rest /= radix;
  } while (rest > 0n);
  return value < 0n ? `-${out}` : out;
}

/** The bit widths the two's complement and the bit grid offer. */
export const BIT_WIDTHS = [8, 16, 32, 64] as const;
export type BitWidth = (typeof BIT_WIDTHS)[number];

/** The unsigned grid value of `value` at the given width: `value mod 2^width`, like a fixed-width register. */
export function wrapUnsigned(value: bigint, width: number): bigint {
  const size = 1n << BigInt(width);
  return ((value % size) + size) % size;
}

/** The signed two's complement interpretation of an unsigned grid value at the given width. */
export function toSigned(unsigned: bigint, width: number): bigint {
  const signBit = 1n << BigInt(width - 1);
  return unsigned >= signBit ? unsigned - (1n << BigInt(width)) : unsigned;
}

/** The two's complement bits of `value` at the given width, most significant bit first, padded to the full width. */
export function toTwoComplement(value: bigint, width: number): string {
  return toBase(wrapUnsigned(value, width), 2).padStart(width, "0");
}

/** Flips bit `index` (0 = least significant) of an unsigned grid value. */
export function toggleBit(unsigned: bigint, index: number): bigint {
  return unsigned ^ (1n << BigInt(index));
}

type Token = { kind: "number"; value: bigint } | { kind: "operator"; text: string } | { kind: "paren"; open: boolean };

const OPERATORS = ["<<", ">>", "+", "-", "*", "/", "%", "&", "|", "^", "~"];

/** Splits the expression into number literals (base prefixes and underscores allowed) and operators. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let rest = text;
  while (rest !== "") {
    const char = rest[0]!;
    if (char === " " || char === "\t" || char === "\n") {
      rest = rest.slice(1);
    } else if (char === "(" || char === ")") {
      tokens.push({ kind: "paren", open: char === "(" });
      rest = rest.slice(1);
    } else if (char === "+" || char === "-" || (char >= "0" && char <= "9")) {
      // A number, or a unary +/- glued to it: the longest run of digits with base prefix and separators.
      const match = /^[-+]?(?:0[xXoObB])?[0-9a-fA-F]?(?:_?[0-9a-fA-F])*/.exec(rest);
      const literal = match?.[0] ?? "";
      if (literal === "" || literal === "+" || literal === "-") {
        tokens.push({ kind: "operator", text: char });
        rest = rest.slice(1);
      } else {
        tokens.push({ kind: "number", value: parseNumber(literal, "auto") });
        rest = rest.slice(literal.length);
      }
    } else {
      const operator = OPERATORS.find((candidate) => rest.startsWith(candidate));
      if (!operator) throw new NumberBaseError("invalid");
      tokens.push({ kind: "operator", text: operator });
      rest = rest.slice(operator.length);
    }
  }
  return tokens;
}

/**
 * Evaluates an integer expression into a BigInt. Operators, loosest first: `|`, `^`, `&`, `<<` and `>>`, `+` and `-`,
 * `*`, `/` and `%`, then unary `-` and `~`. Division and modulo truncate toward zero and divide by zero throws; `>>`
 * is an arithmetic shift. Literals accept the `0x`, `0b` and `0o` prefixes and underscore separators.
 */
export function evaluateExpression(text: string): bigint {
  const tokens = tokenize(text);
  if (tokens.length === 0) throw new NumberBaseError("empty");

  let position = 0;
  const peek = () => tokens[position];

  function expectNumber(): bigint {
    const token = peek();
    if (token?.kind !== "number") throw new NumberBaseError("invalid");
    position += 1;
    return token.value;
  }

  function parseBinary(minPrecedence: number): bigint {
    let left = parseUnary();
    for (;;) {
      const token = peek();
      if (token?.kind !== "operator") return left;
      const precedence = PRECEDENCES[token.text];
      if (precedence === undefined || precedence < minPrecedence) return left;
      position += 1;
      left = apply(token.text, left, parseBinary(precedence + 1));
    }
  }

  function parseUnary(): bigint {
    const token = peek();
    if (token?.kind === "operator" && (token.text === "-" || token.text === "~")) {
      position += 1;
      const value = parseUnary();
      return token.text === "-" ? -value : ~value;
    }
    return parsePrimary();
  }

  function parsePrimary(): bigint {
    const token = peek();
    if (token?.kind === "paren") {
      if (!token.open) throw new NumberBaseError("invalid");
      position += 1;
      const value = parseBinary(0);
      const closing = peek();
      if (closing?.kind !== "paren" || closing.open) throw new NumberBaseError("invalid");
      position += 1;
      return value;
    }
    return expectNumber();
  }

  const value = parseBinary(0);
  if (position !== tokens.length) throw new NumberBaseError("invalid");
  return value;
}

const PRECEDENCES: Record<string, number> = { "|": 1, "^": 2, "&": 3, "<<": 4, ">>": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 };

/** The widest shift the expression evaluator accepts; larger counts would try to materialize a gigantic integer. */
const MAX_SHIFT = 1024;

function apply(operator: string, left: bigint, right: bigint): bigint {
  switch (operator) {
    case "|":
      return left | right;
    case "^":
      return left ^ right;
    case "&":
      return left & right;
    case "<<":
    case ">>":
      if (right < 0n || right > MAX_SHIFT) throw new NumberBaseError("invalid");
      return operator === "<<" ? left << right : left >> right;
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
    case "%":
      if (right === 0n) throw new NumberBaseError("division-by-zero");
      return operator === "/" ? left / right : left % right;
    default:
      throw new NumberBaseError("invalid");
  }
}

/** The largest value Roman numerals can write; `toRoman` returns null outside 1–3999. */
export const ROMAN_MAX = 3999n;

const ROMAN_DIGITS: readonly [string, bigint][] = [
  ["M", 1000n],
  ["CM", 900n],
  ["D", 500n],
  ["CD", 400n],
  ["C", 100n],
  ["XC", 90n],
  ["L", 50n],
  ["XL", 40n],
  ["X", 10n],
  ["IX", 9n],
  ["V", 5n],
  ["IV", 4n],
  ["I", 1n],
];

/** Writes `value` as an uppercase Roman numeral with the subtractive notation, or null outside 1–3999. */
export function toRoman(value: bigint): string | null {
  if (value < 1n || value > ROMAN_MAX) return null;
  let rest = value;
  let out = "";
  for (const [numeral, weight] of ROMAN_DIGITS) {
    while (rest >= weight) {
      out += numeral;
      rest -= weight;
    }
  }
  return out;
}
