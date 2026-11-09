import type { FieldName, Locale } from "./logic";

const formats = new Map<string, Intl.DateTimeFormat>();

function format(locale: Locale, part: "month" | "weekday"): Intl.DateTimeFormat {
  const key = `${locale}:${part}`;
  let found = formats.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(locale, { [part]: "short", timeZone: "UTC" });
    formats.set(key, found);
  }
  return found;
}

/** A field's value for people: months and weekdays by their short name in the language given, the rest as numbers. */
export function valueName(field: FieldName, value: number, locale: Locale): string {
  if (field === "month") return format(locale, "month").format(Date.UTC(2000, value - 1, 1));
  // 2000-01-02 was a Sunday.
  if (field === "weekday") return format(locale, "weekday").format(Date.UTC(2000, 0, 2 + value));
  return String(value);
}
