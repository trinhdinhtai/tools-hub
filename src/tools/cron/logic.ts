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

export type CronErrorReason = "empty" | "field-count" | "invalid" | "out-of-range" | "backwards" | "zero-step" | "reboot" | "unknown-macro";

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

const BOUNDS: Record<FieldName, { min: number; max: number }> = {
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

function readField(name: FieldName, text: string): Field {
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
