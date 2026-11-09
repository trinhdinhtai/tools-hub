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

export type TimestampErrorReason = "empty" | "invalid" | "invalid-date" | "out-of-range";

/** Why a text is not an instant. */
export class TimestampError extends Error {
  constructor(readonly reason: TimestampErrorReason) {
    super(reason);
    this.name = "TimestampError";
  }
}

const NS_PER: Record<Unit, bigint> = { s: 1_000_000_000n, ms: 1_000_000n, us: 1_000n, ns: 1n };
const NS_PER_MS = 1_000_000n;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** The furthest an instant goes either side of 1970: 100 million days, as far as a calendar date (and `Date`) reaches. */
const MAX_MS = 8_640_000_000_000_000;
const LIMIT: Instant = BigInt(MAX_MS) * NS_PER_MS;

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
  const plain = digits!.replace(/[,_]/g, "").replace(/^0+(?=.)/, "");
  // Past 25 digits even nanoseconds are beyond the limit: no need to read a huge number in full.
  if (plain.length > 25) throw new TimestampError("out-of-range");
  const whole = BigInt(plain);
  const picked = unit === "auto" ? guessUnit(whole) : unit;
  const scale = NS_PER[picked];
  // The fraction counts in the unit's own nanoseconds; digits finer than a nanosecond are dropped.
  const places = scale.toString().length - 1;
  const part = places === 0 ? 0n : BigInt(fraction.slice(0, places).padEnd(places, "0"));
  const magnitude = whole * scale + part;
  return { instant: sign === "-" ? -magnitude : magnitude, source: "unix", unit: picked };
}

/** Floor division: the instant's millisecond, also for instants before 1970. */
export function toMilliseconds(instant: Instant): number {
  const ms = instant / NS_PER_MS;
  return Number(instant % NS_PER_MS < 0n ? ms - 1n : ms);
}

const OFFSET_FORMATS = new Map<string, Intl.DateTimeFormat>();

/** The zone's offset from UTC at an instant, in minutes east (Ho Chi Minh City +420). */
export function zoneOffset(zone: string, ms: number): number {
  let format = OFFSET_FORMATS.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" });
    OFFSET_FORMATS.set(zone, format);
  }
  // Clamped: a wall-clock time at the very edge can step just past the range while it is being placed.
  const name = format.formatToParts(Math.min(Math.max(ms, -MAX_MS), MAX_MS)).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  // "GMT" at UTC itself, else "GMT+07:00"; historic local mean times can add seconds, which are dropped.
  const match = /^GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
}

/**
 * The instant a wall-clock time in a zone stands for. A time skipped by a daylight-saving jump reads as if the clock
 * had not jumped (02:30 becomes 03:30); a time that happens twice reads as the first. Same as Temporal's "compatible".
 */
function fromWallClock(wall: number, zone: string): number {
  // The zone's offsets either side of any change near this time: one if none happens, two at a jump.
  const earlier = zoneOffset(zone, wall - MS_PER_DAY);
  const later = zoneOffset(zone, wall + MS_PER_DAY);
  const offsets = [earlier, later];
  const readings = offsets.map((offset) => wall - offset * MS_PER_MINUTE).filter((ms, i) => zoneOffset(zone, ms) === offsets[i]);
  // A repeated time has two readings: the first is taken. A skipped one has none: read it with the offset before.
  return readings.length > 0 ? Math.min(...readings) : wall - earlier * MS_PER_MINUTE;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** ISO 8601 extended format: a date, then optionally a time (T or space) with a fraction (. or ,) and an offset. */
const ISO =
  /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?\s*(?:(Z)|([+-])(\d{2})(?::?(\d{2}))?)?)?$/i;
/** RFC 2822 / RFC 7231 dates: an optional weekday, then `14 Nov 2023 22:13:20` and GMT, UT, UTC, Z or a ±hhmm offset. */
const RFC_2822 = /^(?:[a-z]{3},?\s+)?(\d{1,2})\s+([a-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+(?:(GMT|UTC?|Z)|([+-])(\d{2})(\d{2}))$/i;

interface Fields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Nanoseconds within the second. */
  fraction: bigint;
  /** Minutes east of UTC, or null when the text gives none. */
  offset: number | null;
}

function readFields(text: string): Fields | null {
  const iso = ISO.exec(text);
  if (iso) {
    const [, year, month, day, hour = "0", minute = "0", second = "0", fraction = "", z, sign, oh, om = "0"] = iso;
    return {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
      fraction: BigInt(fraction.slice(0, 9).padEnd(9, "0")),
      offset: z ? 0 : sign ? (sign === "-" ? -1 : 1) * offsetMinutes(oh!, om) : null,
    };
  }
  const rfc = RFC_2822.exec(text);
  if (rfc) {
    const [, day, monthName, year, hour, minute, second = "0", named, sign, oh, om] = rfc;
    const month = MONTHS.indexOf(monthName!.toLowerCase()) + 1;
    if (month === 0) return null;
    return {
      year: Number(year),
      month,
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
      fraction: 0n,
      offset: named ? 0 : (sign === "-" ? -1 : 1) * offsetMinutes(oh!, om!),
    };
  }
  return null;
}

/** An offset's minutes, or NaN past ±23:59 so the date is refused. */
function offsetMinutes(hours: string, minutes: string): number {
  const h = Number(hours);
  const m = Number(minutes);
  return h > 23 || m > 59 ? NaN : h * 60 + m;
}

function parseDate(text: string, zone: string): Parsed | null {
  const fields = readFields(text);
  if (!fields) return null;
  const { year, month, day, hour, minute, second, fraction, offset } = fields;
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || Number.isNaN(offset)) {
    throw new TimestampError("invalid");
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  const wall = date.getTime();
  if (Number.isNaN(wall)) throw new TimestampError("out-of-range");
  if (date.getUTCDate() !== day) throw new TimestampError("invalid-date");
  const ms = offset === null ? fromWallClock(wall, zone) : wall - offset * MS_PER_MINUTE;
  return { instant: checked(BigInt(ms) * NS_PER_MS + fraction), source: "date" };
}

function checked(instant: Instant): Instant {
  if (instant > LIMIT || instant < -LIMIT) throw new TimestampError("out-of-range");
  return instant;
}

/** Reads a Unix timestamp or a date string as an instant; throws a TimestampError saying why it cannot. */
export function parseInstant(text: string, options: ParseOptions): Parsed {
  const trimmed = text.trim();
  if (trimmed === "") throw new TimestampError("empty");
  // Nothing valid is this long; refusing early keeps a huge paste from going through the patterns.
  if (trimmed.length > 100) throw new TimestampError(/^[\d,_.+-]+$/.test(trimmed.slice(0, 100)) ? "out-of-range" : "invalid");
  const unix = parseUnix(trimmed, options.unit ?? "auto");
  if (unix) return { ...unix, instant: checked(unix.instant) };
  const date = parseDate(trimmed, options.zone);
  if (date) return date;
  throw new TimestampError("invalid");
}
