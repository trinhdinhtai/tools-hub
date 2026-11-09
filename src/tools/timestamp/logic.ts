/** A Unix timestamp unit: seconds, milliseconds, microseconds or nanoseconds. */
export type Unit = "s" | "ms" | "us" | "ns";

/** An instant: nanoseconds since 1970-01-01T00:00:00Z. */
export type Instant = bigint;

export interface ParseOptions {
  /** The current time, milliseconds since the epoch. */
  now: number;
  /** IANA zone a date string without an offset is read in. */
  zone: string;
  /** Unit of a Unix timestamp; `auto` (the default) tells it from the size. */
  unit?: Unit | "auto";
}

export interface Parsed {
  instant: Instant;
  /** `unix` for a timestamp (with the unit it was read in), `date` for a date string, `now` for the current time. */
  source: "unix" | "date" | "now";
  unit?: Unit;
}

const NS_PER: Record<Unit, bigint> = { s: 1_000_000_000n, ms: 1_000_000n, us: 1_000n, ns: 1n };

/** A decimal number, ASCII digits only: digits grouped by commas in threes or split by underscores, then a fraction. */
const NUMBER = /^([+-]?)(\d{1,3}(?:,\d{3})+|\d+(?:_\d+)*)(?:\.(\d+))?$/;

/**
 * The unit a timestamp most likely is, by the size of its whole part: below 10^11 seconds (up to the year 5138), then
 * milliseconds, microseconds and nanoseconds each three digits on. Values from 1973 on have 10, 13, 16 and 19 digits.
 */
function guessUnit(whole: bigint): Unit {
  const size = whole < 0n ? -whole : whole;
  if (size < 100_000_000_000n) return "s";
  if (size < 100_000_000_000_000n) return "ms";
  if (size < 100_000_000_000_000_000n) return "us";
  return "ns";
}

function parseUnix(text: string, unit: Unit | "auto"): Parsed | null {
  const match = NUMBER.exec(text);
  if (!match) return null;
  const [, sign, digits, fraction = ""] = match;
  const whole = BigInt(digits!.replace(/[,_]/g, ""));
  const picked = unit === "auto" ? guessUnit(whole) : unit;
  const scale = NS_PER[picked];
  // The fraction counts in the unit's own nanoseconds; digits finer than a nanosecond are dropped.
  const places = scale.toString().length - 1;
  const part = places === 0 ? 0n : BigInt(fraction.slice(0, places).padEnd(places, "0"));
  const magnitude = whole * scale + part;
  return { instant: sign === "-" ? -magnitude : magnitude, source: "unix", unit: picked };
}

export function parseInstant(text: string, options: ParseOptions): Parsed {
  const trimmed = text.trim();
  const unix = parseUnix(trimmed, options.unit ?? "auto");
  if (unix) return unix;
  throw new Error("not yet");
}
