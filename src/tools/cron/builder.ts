import { attemptError } from "@/lib/attempt";
import { BOUNDS, CronError, FIELDS, parseCron, readField, type Field, type FieldName } from "./logic";

/** What the builder offers for a field: any value, every N, a range (with a step), or values picked one by one. */
export type FieldSpec =
  | { kind: "every" }
  | { kind: "step"; step: number }
  | { kind: "range"; start: number; end: number; step: number }
  | { kind: "values"; values: number[] };

export type Kind = FieldSpec["kind"];

/** The highest value the builder shows: a weekday of 7 is Sunday again, so it stops at 6. */
export const builderMax = (name: FieldName) => (name === "weekday" ? 6 : BOUNDS[name].max);

function specOf(field: Field): FieldSpec {
  if (!field.restricted && field.parts.length === 1) {
    const { step } = field.parts[0]!;
    return step === 1 ? { kind: "every" } : { kind: "step", step };
  }
  if (field.parts.length === 1) {
    const { start, end, step } = field.parts[0]!;
    // `5-5` stays a range, so picking the same From and To in the builder does not swap its controls away.
    if ((start !== end || field.text.includes("-")) && end <= builderMax(field.name)) return { kind: "range", start, end, step };
  }
  // Anything else, such as `1-5,10` or `5-7` for the weekday, as the values it allows.
  return { kind: "values", values: field.values };
}

/**
 * The builder's choice for each field of an expression; a field it cannot read is null. Null as a whole when the
 * expression does not split into five fields. Empty input reads as `* * * * *`.
 */
export function readBuilder(text: string): Record<FieldName, FieldSpec | null> | null {
  const pieces = splitFields(text);
  if (!pieces) return null;
  return Object.fromEntries(
    FIELDS.map((name, i) => [name, attemptError(() => specOf(readField(name, pieces[i]!)), CronError).value]),
  ) as Record<FieldName, FieldSpec | null>;
}

/** The five fields as written (a macro as what it is short for, empty input as `* * * * *`), or null. */
export function splitFields(text: string): string[] | null {
  const trimmed = text.trim();
  if (trimmed === "") return FIELDS.map(() => "*");
  if (trimmed.startsWith("@")) {
    const { value } = attemptError(() => parseCron(trimmed), CronError);
    return value && FIELDS.map((name) => value.fields[name].text);
  }
  const pieces = trimmed.split(/\s+/);
  return pieces.length === FIELDS.length ? pieces : null;
}

/** Picked values, ascending, with runs of three or more written as ranges: `1-3,5`. */
function valuesText(values: number[]): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const pieces: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    if (j - i >= 2) pieces.push(`${sorted[i]}-${sorted[j]}`);
    else pieces.push(...sorted.slice(i, j + 1).map(String));
    i = j + 1;
  }
  return pieces.join(",");
}

function specText(spec: FieldSpec): string {
  switch (spec.kind) {
    case "every":
      return "*";
    case "step":
      return `*/${spec.step}`;
    case "range":
      return `${spec.start}-${spec.end}${spec.step > 1 ? `/${spec.step}` : ""}`;
    case "values":
      return valuesText(spec.values);
  }
}

/**
 * The expression with one field rewritten from the builder; the other fields stay as written. Null when the
 * expression does not split into five fields, so the builder never overwrites what was typed.
 */
export function setField(text: string, name: FieldName, spec: FieldSpec): string | null {
  const pieces = splitFields(text);
  if (!pieces) return null;
  pieces[FIELDS.indexOf(name)] = specText(spec);
  return pieces.join(" ");
}

function expand(start: number, end: number, step: number): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}

/** The field after the builder switches it to another kind, keeping what it can of the choice before (null: unreadable). */
export function changeKind(name: FieldName, from: FieldSpec | null, kind: Kind): FieldSpec {
  const { min } = BOUNDS[name];
  const max = builderMax(name);
  if (from?.kind === kind) return from;
  switch (kind) {
    case "every":
      return { kind };
    // Every 5 minutes, or every other hour, day, month or weekday, until another step is picked.
    case "step":
      return { kind, step: from?.kind === "range" && from.step > 1 ? from.step : name === "minute" ? 5 : 2 };
    case "range":
      if (from?.kind === "step") return { kind, start: min, end: max, step: from.step };
      // Monday through Friday: the weekday range people want most.
      return name === "weekday" ? { kind, start: 1, end: 5, step: 1 } : { kind, start: min, end: max, step: 1 };
    case "values":
      if (from?.kind === "step") return { kind, values: expand(min, max, from.step) };
      if (from?.kind === "range") return { kind, values: expand(from.start, from.end, from.step) };
      return { kind, values: [min] };
  }
}
