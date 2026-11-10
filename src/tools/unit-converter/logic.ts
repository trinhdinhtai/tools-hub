/**
 * Pure unit conversion for the Unit Converter Tool: length, mass, temperature and data size, decimal (kB) and binary
 * (KiB) alike. No currency, which needs exchange rates from the network (ADR-0001). No DOM, no store (ADR-0003).
 */

export const QUANTITIES = ["length", "mass", "temperature", "data"] as const;
export type Quantity = (typeof QUANTITIES)[number];

export type UnitErrorReason = "empty" | "invalid" | "comma" | "negative" | "too-large" | "too-small" | "below-absolute-zero";

export class UnitError extends Error {
  constructor(readonly reason: UnitErrorReason) {
    super(`Invalid unit input: ${reason}`);
    this.name = "UnitError";
  }
}

/**
 * A unit as a step from its quantity's base unit: base = (value + offset) × factor. Only temperatures have an offset,
 * which puts absolute zero at base 0.
 */
interface Unit {
  readonly factor: number;
  readonly offset?: number;
}

interface QuantitySpec {
  /** Why a value below the base unit's zero is refused: nothing has a negative length, and nothing is below 0 K. */
  readonly belowZero: UnitErrorReason;
  /** Every unit of the quantity, in the order the UI lists them. */
  readonly units: Readonly<Record<string, Unit>>;
}

/** The bases are metres, grams, kelvins and bits. Unit ids are unique across quantities, so a unit names its quantity. */
const SPECS = {
  length: {
    belowZero: "negative",
    units: {
      nm: { factor: 1e-9 },
      um: { factor: 1e-6 },
      mm: { factor: 1e-3 },
      cm: { factor: 1e-2 },
      m: { factor: 1 },
      km: { factor: 1e3 },
      in: { factor: 0.0254 },
      ft: { factor: 0.3048 },
      yd: { factor: 0.9144 },
      mi: { factor: 1609.344 },
      nmi: { factor: 1852 },
    },
  },
  mass: {
    belowZero: "negative",
    units: {
      mg: { factor: 1e-3 },
      g: { factor: 1 },
      kg: { factor: 1e3 },
      t: { factor: 1e6 },
      oz: { factor: 28.349523125 },
      lb: { factor: 453.59237 },
      st: { factor: 6350.29318 },
    },
  },
  temperature: {
    belowZero: "below-absolute-zero",
    units: {
      c: { factor: 1, offset: 273.15 },
      f: { factor: 5 / 9, offset: 459.67 },
      k: { factor: 1 },
    },
  },
  // In bits, so a bit and a byte are both whole; kB is 1000 bytes and KiB 1024.
  data: {
    belowZero: "negative",
    units: {
      bit: { factor: 1 },
      kbit: { factor: 1e3 },
      Mbit: { factor: 1e6 },
      Gbit: { factor: 1e9 },
      B: { factor: 8 },
      kB: { factor: 8e3 },
      MB: { factor: 8e6 },
      GB: { factor: 8e9 },
      TB: { factor: 8e12 },
      PB: { factor: 8e15 },
      KiB: { factor: 8 * 2 ** 10 },
      MiB: { factor: 8 * 2 ** 20 },
      GiB: { factor: 8 * 2 ** 30 },
      TiB: { factor: 8 * 2 ** 40 },
      PiB: { factor: 8 * 2 ** 50 },
    },
  },
} as const satisfies Record<Quantity, QuantitySpec>;

export type UnitId = { [Q in Quantity]: keyof (typeof SPECS)[Q]["units"] }[Quantity];

/** Each unit with its quantity, looked up by id. */
const UNITS = Object.fromEntries(
  QUANTITIES.flatMap((quantity) => Object.entries(SPECS[quantity].units).map(([id, unit]) => [id, { quantity, unit }])),
) as Record<UnitId, { quantity: Quantity; unit: Unit }>;

/** The base unit every quantity converts through: factor 1, no offset. */
const BASE: Unit = { factor: 1 };

/** The quantity a unit measures. */
export function quantityOf(unit: UnitId): Quantity {
  return UNITS[unit].quantity;
}

/** Every unit of a quantity, in the order the UI lists them. */
export function unitsOf(quantity: Quantity): UnitId[] {
  return Object.keys(SPECS[quantity].units) as UnitId[];
}

/** The smallest number a double holds at full precision; below it digits are lost. */
const MIN_NORMAL = 2 ** -1022;

/**
 * A value in another unit, through the base unit. When the base value would overflow or lose digits, the ratio of the
 * two factors is applied in one step instead, so a tiny or huge value still converts. Adding and taking away a
 * temperature offset cancels digits: the result is rounded at the 15th significant digit of the larger term, so
 * rounding noise never shows as digits.
 */
function inUnit(value: number, source: Unit, target: Unit): number {
  const shifted = value + (source.offset ?? 0);
  const base = shifted * source.factor;
  const ratio = source.factor / target.factor;
  const scaled = Number.isFinite(base) && (base === 0 || Math.abs(base) >= MIN_NORMAL) ? base / target.factor : shifted * ratio;
  const converted = scaled - (target.offset ?? 0);
  if (!source.offset && !target.offset) return converted;
  const largest = Math.max(Math.abs(value) * ratio, (source.offset ?? 0) * ratio, target.offset ?? 0);
  const decimals = largest === 0 ? 100 : Math.min(100, Math.max(0, 14 - Math.floor(Math.log10(largest))));
  return Number(converted.toFixed(decimals));
}

/**
 * A converted value to show: the exact integer while it is safe, otherwise 15 significant digits. Beyond 2^53 the
 * digits are written in exponent form, so trailing zeros never pass for exact ones.
 */
function format(value: number): string {
  if (Number.isSafeInteger(value)) return String(value);
  const rounded = Number(value.toPrecision(15));
  return Math.abs(rounded) >= 2 ** 53 ? rounded.toExponential() : String(rounded);
}

/** A plain decimal number, with an optional sign, fraction and exponent; no hex, no Infinity. */
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Reads a typed value. Full-width digits and the Unicode minus sign read as their ASCII forms, and single spaces or
 * underscores between digits are separators (`1 000`, `1_000`). A comma is refused rather than guessed, since it is
 * the decimal mark in Vietnamese but a thousands separator in English. A value too small for full precision is
 * refused rather than read as fewer digits or as 0.
 */
function parseValue(text: string): number {
  const raw = text.normalize("NFKC").replaceAll("\u2212", "-").trim();
  if (raw === "") throw new UnitError("empty");
  if (raw.includes(",")) throw new UnitError("comma");
  const digits = raw.replace(/(?<=\d)[ _](?=\d)/g, "");
  if (!NUMBER.test(digits)) throw new UnitError("invalid");
  const value = Number(digits);
  if (!Number.isFinite(value)) throw new UnitError("too-large");
  const mantissa = digits.split(/e/i)[0]!;
  if (Math.abs(value) < MIN_NORMAL && /[1-9]/.test(mantissa)) throw new UnitError("too-small");
  return value;
}

export interface Converted {
  unit: UnitId;
  /** Null when the value is too large or too small to write in this unit, while other units still can. */
  value: string | null;
}

/** Converts a value typed in one unit into every unit of its quantity, the typed unit included. */
export function convert(text: string, from: UnitId): Converted[] {
  const { quantity, unit: source } = UNITS[from];
  const value = parseValue(text);
  if (inUnit(value, source, BASE) < 0) throw new UnitError(SPECS[quantity].belowZero);
  return unitsOf(quantity).map((unit) => {
    const converted = inUnit(value, source, UNITS[unit].unit);
    const writable = Number.isFinite(converted) && (converted === 0 || Math.abs(converted) >= MIN_NORMAL);
    return { unit, value: writable ? format(converted) : null };
  });
}
