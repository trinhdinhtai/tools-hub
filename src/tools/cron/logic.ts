export const FIELDS = ["minute", "hour", "day", "month", "weekday"] as const;
export type FieldName = (typeof FIELDS)[number];

/** One comma-separated piece of a field: a single value is a range from it to itself with a step of 1. */
export interface Part {
  start: number;
  end: number;
  step: number;
  /** Written as `*`: the field's whole range. */
  all: boolean;
}

export interface Field {
  name: FieldName;
  /** The field as written. */
  text: string;
  parts: Part[];
  /** Every value the field allows, ascending; a weekday of 7 is Sunday, 0. */
  values: number[];
  /**
   * False when the field starts with `*` or is `?`. When the day of the month and the weekday are both restricted, a
   * day matches if either does (as in Vixie cron and cronie).
   */
  restricted: boolean;
}

export interface Cron {
  fields: Record<FieldName, Field>;
  /** The macro it was written as, in lower case, e.g. `@daily`. */
  macro?: string;
}

export type CronErrorReason = "empty" | "field-count" | "invalid" | "out-of-range" | "backwards" | "zero-step" | "reboot" | "unknown-macro" | "unknown-zone";

export interface CronErrorDetails {
  field?: FieldName;
  value?: string;
  count?: number;
  min?: number;
  max?: number;
}

/** Input that is not a cron expression; `reason` and `details` pick and fill the message shown. */
export class CronError extends Error {
  constructor(
    readonly reason: CronErrorReason,
    readonly details: CronErrorDetails = {},
  ) {
    super(reason);
    this.name = "CronError";
  }
}

export const BOUNDS: Record<FieldName, { min: number; max: number }> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  day: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  weekday: { min: 0, max: 7 },
};

const NAMES: Partial<Record<FieldName, readonly string[]>> = {
  month: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
  weekday: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
};

const MACROS: Record<string, string> = {
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const PART = /^(?:(\*)|([0-9a-z]+)(?:-([0-9a-z]+))?)(?:\/([0-9]+))?$/i;

/** Digits as a number; leading zeros are dropped and the rest compared as text, so ten thousand digits stay cheap. */
function readNumber(digits: string): number {
  const significant = digits.replace(/^0+(?=\d)/, "");
  return significant.length > 3 ? Infinity : Number(significant);
}

function readValue(name: FieldName, token: string, field: string): number {
  const { min, max } = BOUNDS[name];
  if (/^[0-9]+$/.test(token)) {
    const value = readNumber(token);
    if (value < min || value > max) throw new CronError("out-of-range", { field: name, value: token, min, max });
    return value;
  }
  const index = NAMES[name]?.indexOf(token.toLowerCase()) ?? -1;
  if (index === -1) throw new CronError("invalid", { field: name, value: field });
  return name === "month" ? index + 1 : index;
}

/** Reads one field as written, e.g. `9-17` for the hour. */
export function readField(name: FieldName, text: string): Field {
  const { min, max } = BOUNDS[name];
  const unrestricted = text === "?" && (name === "day" || name === "weekday");
  const parts = (unrestricted ? ["*"] : text.split(",")).map((piece): Part => {
    const match = PART.exec(piece);
    if (!match) throw new CronError("invalid", { field: name, value: text });
    const [, star, from, to, stepText] = match;
    const step = stepText === undefined ? 1 : readNumber(stepText);
    if (step === 0) throw new CronError("zero-step", { field: name, value: text });
    if (star) return { start: min, end: max, step, all: true };
    const start = readValue(name, from!, text);
    // `5/20` runs from 5 to the end of the field.
    const end = to !== undefined ? readValue(name, to, text) : stepText !== undefined ? max : start;
    if (end < start) throw new CronError("backwards", { field: name, value: text });
    return { start, end, step, all: false };
  });
  const values = new Set<number>();
  for (const { start, end, step } of parts) {
    for (let value = start; value <= end; value += step) values.add(name === "weekday" && value === 7 ? 0 : value);
  }
  return { name, text, parts, values: [...values].sort((a, b) => a - b), restricted: !unrestricted && !text.startsWith("*") };
}

/** Reads a five-field cron expression (minute, hour, day of month, month, weekday) or a macro such as `@daily`. */
export function parseCron(text: string): Cron {
  const trimmed = text.trim();
  if (trimmed === "") throw new CronError("empty");
  if (trimmed.startsWith("@")) {
    const macro = trimmed.toLowerCase();
    if (macro === "@reboot") throw new CronError("reboot");
    const expanded = MACROS[macro];
    if (!expanded) throw new CronError("unknown-macro", { value: trimmed });
    return { ...parseCron(expanded), macro };
  }
  const pieces = trimmed.split(/\s+/);
  if (pieces.length !== FIELDS.length) throw new CronError("field-count", { count: pieces.length });
  const fields = Object.fromEntries(FIELDS.map((name, i) => [name, readField(name, pieces[i]!)])) as Record<FieldName, Field>;
  return { fields };
}

export type Locale = "en" | "vi";

const pad = (n: number) => String(n).padStart(2, "0");

interface Words {
  and: string;
  or: string;
  through: (from: string, to: string) => string;
  between: (from: string, to: string) => string;
  /** The span a step runs over, e.g. "from 8 through 18". */
  span: (from: string, to: string) => string;
  at: string;
  everyMinute: string;
  ofEveryHour: string;
  every: (n: number, field: FieldName) => string;
  /** Wraps a field's listed values, e.g. "on days 1 and 15 of the month". */
  label: (field: FieldName, list: string, plural: boolean) => string;
  name: (field: FieldName, value: number) => string;
}

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EN_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const VI_WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];
const EN_UNITS: Record<FieldName, [string, string]> = {
  minute: ["minute", "minutes"],
  hour: ["hour", "hours"],
  day: ["day", "days"],
  month: ["month", "months"],
  weekday: ["day of the week", "days of the week"],
};
const VI_UNITS: Record<FieldName, string> = { minute: "phút", hour: "giờ", day: "ngày", month: "tháng", weekday: "ngày trong tuần" };

const WORDS: Record<Locale, Words> = {
  en: {
    and: "and",
    or: "or",
    through: (from, to) => `${from} through ${to}`,
    between: (from, to) => `between ${from} and ${to}`,
    span: (from, to) => `from ${from} through ${to}`,
    at: "at",
    everyMinute: "every minute",
    ofEveryHour: "of every hour",
    every: (n, field) => (n === 1 ? `every ${EN_UNITS[field][0]}` : `every ${n} ${EN_UNITS[field][1]}`),
    label: (field, list, plural) => {
      switch (field) {
        case "minute":
          return `at ${plural ? "minutes" : "minute"} ${list}`;
        case "hour":
          return `during ${plural ? "hours" : "hour"} ${list}`;
        case "day":
          return `on ${plural ? "days" : "day"} ${list} of the month`;
        case "month":
          return `in ${list}`;
        case "weekday":
          return `on ${list}`;
      }
    },
    name: (field, value) => (field === "month" ? EN_MONTHS[value - 1]! : field === "weekday" ? EN_WEEKDAYS[value]! : String(value)),
  },
  vi: {
    and: "và",
    or: "hoặc",
    through: (from, to) => `từ ${from} đến ${to}`,
    between: (from, to) => `từ ${from} đến ${to}`,
    span: (from, to) => `từ ${from} đến ${to}`,
    at: "lúc",
    everyMinute: "mỗi phút",
    ofEveryHour: "của mỗi giờ",
    every: (n, field) => (n === 1 ? `mỗi ${VI_UNITS[field]}` : `mỗi ${n} ${VI_UNITS[field]}`),
    label: (field, list) => {
      switch (field) {
        case "minute":
          return `vào phút ${list}`;
        case "hour":
          return `trong giờ ${list}`;
        case "day":
          return `vào ngày ${list} của tháng`;
        case "month":
        case "weekday":
          return `vào ${list}`;
      }
    },
    name: (field, value) => (field === "month" ? `tháng ${value}` : field === "weekday" ? VI_WEEKDAYS[value]! : String(value)),
  },
};

function join(items: string[], word: string): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}`;
}

/** `*` with no step: the field allows every value. */
const isAll = (field: Field) => field.parts.length === 1 && field.parts[0]!.all && field.parts[0]!.step === 1;
/** Only single values, such as `0,30`. */
const isSimple = (field: Field) => field.parts.every((part) => !part.all && part.start === part.end);
/** One stepped piece, such as `*\/15` or `8-18/2`. */
const stepped = (field: Field) => (field.parts.length === 1 && field.parts[0]!.step > 1 ? field.parts[0]! : null);

/** Times are listed in full, "at 08:30 and 17:30", only while there are this few. */
const MAX_LISTED_TIMES = 6;

function every(field: Field, part: Part, w: Words): string {
  const every = w.every(part.step, field.name);
  return part.all ? every : `${every} ${w.span(w.name(field.name, part.start), w.name(field.name, part.end))}`;
}

/** The field as its listed values, ranges kept as ranges unless a step makes them read better expanded. */
function listed(field: Field, w: Words): string {
  const name = (value: number) => w.name(field.name, value);
  if (field.parts.some((part) => part.step > 1)) return w.label(field.name, join(field.values.map(name), w.and), field.values.length > 1);
  const items = field.parts.map((part) => (part.start === part.end ? name(part.start) : w.through(name(part.start), name(part.end))));
  return w.label(field.name, join(items, w.and), field.parts.length > 1 || field.parts[0]!.start !== field.parts[0]!.end);
}

/** Every phrase of a field other than `*`. */
function phrase(field: Field, w: Words): string {
  const step = stepped(field);
  if (step) return every(field, step, w);
  const only = field.parts.length === 1 ? field.parts[0]! : null;
  // "Monday through Friday" reads better without "on".
  if (field.name === "weekday" && only && only.start !== only.end) return w.through(w.name("weekday", only.start), w.name("weekday", only.end));
  return listed(field, w);
}

function time(minute: Field, hour: Field, w: Words): string {
  if (isSimple(minute) && isSimple(hour) && minute.values.length * hour.values.length <= MAX_LISTED_TIMES) {
    return `${w.at} ${join(
      hour.values.flatMap((h) => minute.values.map((m) => `${pad(h)}:${pad(m)}`)),
      w.and,
    )}`;
  }
  const minuteText = isAll(minute) ? w.everyMinute : phrase(minute, w);
  if (isAll(hour)) return stepped(minute) || isAll(minute) ? minuteText : `${minuteText} ${w.ofEveryHour}`;
  const only = hour.parts.length === 1 ? hour.parts[0]! : null;
  if (only && only.step === 1) return `${minuteText}, ${w.between(`${pad(only.start)}:00`, `${pad(only.end)}:59`)}`;
  return `${minuteText}, ${phrase(hour, w)}`;
}

/** The schedule in words, in English or Vietnamese, e.g. "Every 15 minutes, between 09:00 and 17:59, Monday through Friday". */
export function explain(cron: Cron, locale: Locale): string {
  const w = WORDS[locale];
  const { minute, hour, day, month, weekday } = cron.fields;
  const clauses = [time(minute, hour, w)];
  const dayText = isAll(day) ? null : phrase(day, w);
  const weekdayText = isAll(weekday) ? null : phrase(weekday, w);
  if (dayText && weekdayText && day.restricted && weekday.restricted) clauses.push(`${dayText} ${w.or} ${weekdayText}`);
  else clauses.push(...[dayText, weekdayText].filter((text) => text !== null));
  if (!isAll(month)) clauses.push(phrase(month, w));
  const sentence = clauses.join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** One run of the schedule: the instant, and the wall time, weekday (0 is Sunday) and UTC offset in minutes in its zone. */
export interface Run {
  at: number;
  /** `YYYY-MM-DD HH:MM` on the zone's clock. */
  wall: string;
  weekday: number;
  offset: number;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
/** How far ahead runs are looked for: past the longest wait a schedule can have, a leap day on given weekdays across 2100. */
const SEARCH_DAYS = 366 * 50;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let format = formatters.get(zone);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
      });
    } catch {
      throw new CronError("unknown-zone", { value: zone });
    }
    formatters.set(zone, format);
  }
  return format;
}

/** The zone's wall clock at an instant, as if that clock were UTC, to the minute. */
function wallClock(at: number, zone: string): number {
  const parts: Record<string, number> = {};
  for (const { type, value } of formatter(zone).formatToParts(at)) parts[type] = Number(value);
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!);
}

const offsetAt = (at: number, zone: string) => (wallClock(at, zone) - Math.floor(at / MS_PER_MINUTE) * MS_PER_MINUTE) / MS_PER_MINUTE;

/**
 * The instant the zone's clock shows a wall time (given as if it were UTC), or null when the clocks skip it. Of a time
 * that happens twice, the first.
 */
function instantOf(wall: number, zone: string): number | null {
  const guess = wall - offsetAt(wall, zone) * MS_PER_MINUTE;
  const at = wall - offsetAt(guess, zone) * MS_PER_MINUTE;
  return wallClock(at, zone) === wall ? at : null;
}

const allows = (field: Field) => {
  const allowed = new Set(field.values);
  return (value: number) => allowed.has(value);
};

/** The next `count` runs strictly after `from` (milliseconds since 1970), on the clock of the IANA zone given. */
export function nextRuns(cron: Cron, from: number, zone: string, count: number): Run[] {
  const runs: Run[] = [];
  if (count <= 0) return runs;
  const { minute, hour, day, month, weekday } = cron.fields;
  const [inMonth, onDay, onWeekday] = [allows(month), allows(day), allows(weekday)];
  const either = day.restricted && weekday.restricted;
  const start = wallClock(from, zone);
  const firstDay = Math.floor(start / MS_PER_DAY) * MS_PER_DAY;

  for (let i = 0; i < SEARCH_DAYS; i++) {
    const date = new Date(firstDay + i * MS_PER_DAY);
    if (!inMonth(date.getUTCMonth() + 1)) continue;
    const [dayOk, weekdayOk] = [onDay(date.getUTCDate()), onWeekday(date.getUTCDay())];
    if (either ? !dayOk && !weekdayOk : !dayOk || !weekdayOk) continue;
    for (const h of hour.values) {
      for (const m of minute.values) {
        const wall = date.getTime() + (h * 60 + m) * MS_PER_MINUTE;
        // Earlier the first day is long past; the instant check below settles the minute itself.
        if (wall < start) continue;
        const at = instantOf(wall, zone);
        if (at === null || at <= from || at <= (runs.at(-1)?.at ?? -Infinity)) continue;
        const iso = new Date(wall).toISOString();
        runs.push({ at, wall: `${iso.slice(0, 10)} ${iso.slice(11, 16)}`, weekday: date.getUTCDay(), offset: offsetAt(at, zone) });
        if (runs.length === count) return runs;
      }
    }
  }
  return runs;
}

/** Longer than any cron line written by hand; a longer paste is something else. */
const PASTE_MAX = 120;

/**
 * Paste Detection: one line that reads as a cron expression. Near certain with a `*`, `?`, `/`, a name or a macro; five
 * plain numbers only maybe, as they could be anything.
 */
export function detectPaste(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length > PASTE_MAX || trimmed.includes("\n")) return 0;
  try {
    parseCron(trimmed);
  } catch {
    return 0;
  }
  return /^[\d\s,-]+$/.test(trimmed) ? 0.4 : 0.9;
}
