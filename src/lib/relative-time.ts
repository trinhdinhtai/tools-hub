const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 1],
  ["minute", 60],
  ["hour", 3_600],
  ["day", 86_400],
  ["week", 604_800],
  ["month", 2_629_746],
  ["year", 31_556_952],
];
/** Where each unit stops fitting, in seconds: a minute, an hour, a day, a week, 30 days, 365 days. */
const RELATIVE_LIMITS = [60, 3_600, 86_400, 604_800, 2_592_000, 31_536_000];

/** How far an instant (milliseconds) is from now, in the largest unit that fits, for `Intl.RelativeTimeFormat`. */
export function relativeTime(ms: number, now: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const seconds = (ms - now) / 1000;
  const index = RELATIVE_LIMITS.findIndex((limit) => Math.abs(seconds) < limit);
  const [unit, size] = RELATIVE_STEPS[index === -1 ? RELATIVE_STEPS.length - 1 : index]!;
  // `|| 0` turns -0 into 0, which RelativeTimeFormat would write as "0 seconds ago".
  return { value: Math.round(seconds / size) || 0, unit };
}

/** How far an instant (milliseconds) is from now, written for people in a locale: "in 2 hours", "3 days ago". */
export function formatRelative(ms: number, now: number, locale: string): string {
  const { value, unit } = relativeTime(ms, now);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
}
