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
    FIELDS.map((name, i) => {
      try {
        return [name, specOf(readField(name, pieces[i]!))];
      } catch (error) {
        if (error instanceof CronError) return [name, null];
        throw error;
      }
    }),
  ) as Record<FieldName, FieldSpec | null>;
}

/** The five fields as written (a macro as what it is short for, empty input as `* * * * *`), or null. */
export function splitFields(text: string): string[] | null {
  const trimmed = text.trim();
  if (trimmed === "") return FIELDS.map(() => "*");
  if (trimmed.startsWith("@")) {
    try {
      const { fields } = parseCron(trimmed);
      return FIELDS.map((name) => fields[name].text);
    } catch (error) {
      if (error instanceof CronError) return null;
      throw error;
    }
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
