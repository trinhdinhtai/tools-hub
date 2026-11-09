import { memo, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorMessage } from "@/components/error-message";
import { ResultRow } from "@/components/result-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePaste } from "@/lib/paste";
import { usePreference } from "@/lib/preferences";
import { CronError, explain, FIELDS, nextRuns, parseCron, type Cron, type Field, type Locale, type Run } from "./logic";
import { valueName } from "./value-name";

/** How many runs are listed. */
const RUN_COUNT = 10;
/** The zone this computer is set to. */
const LOCAL_ZONE = new Intl.DateTimeFormat().resolvedOptions().timeZone;
const KNOWN_ZONES: readonly string[] = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
/** A value in an error longer than this is cut short, so ten thousand digits do not fill the screen. */
const SHOWN_VALUE_MAX = 24;

/** Cron Calculator: a cron expression in words, field by field, and its next runs. Input stays in memory. */
export default function CronTool() {
  const { t, i18n } = useTranslation("cron");
  const locale: Locale = i18n.language === "vi" ? "vi" : "en";
  const inputId = useId();
  const [text, setText] = useState("");
  // `now` is read when the Input changes, so the runs hold still while they are being copied.
  const [now, setNow] = useState(() => Date.now());
  const edit = (next: string) => {
    setText(next);
    setNow(Date.now());
  };

  usePaste((pasted) => edit(pasted.trim()));

  const { cron, error } = useMemo(() => {
    if (text.trim() === "") return { cron: null, error: null };
    try {
      return { cron: parseCron(text), error: null };
    } catch (error) {
      if (error instanceof CronError) return { cron: null, error };
      throw error;
    }
  }, [text]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-xl flex-col gap-2">
        <Label htmlFor={inputId}>{t("input")}</Label>
        <Input
          id={inputId}
          value={text}
          onChange={(event) => edit(event.target.value)}
          placeholder={t("placeholder")}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className="font-mono text-[13px]"
        />
        {cron?.macro && (
          <p className="text-xs text-muted-foreground">
            {t("macro", { macro: cron.macro, expression: FIELDS.map((name) => cron.fields[name].text).join(" ") })}
          </p>
        )}
      </div>
      {error && <ErrorMessage>{errorText(t, error)}</ErrorMessage>}
      {cron && (
        <>
          <div className="max-w-xl">
            <ResultRow label={t("explanation")} value={explain(cron, locale)} multiline />
          </div>
          <Fields cron={cron} locale={locale} />
          <Runs cron={cron} now={now} locale={locale} />
        </>
      )}
    </div>
  );
}

type T = ReturnType<typeof useTranslation<"cron">>["t"];

function errorText(t: T, error: CronError): string {
  const { field, value, ...rest } = error.details;
  const shown = value !== undefined && value.length > SHOWN_VALUE_MAX ? `${value.slice(0, SHOWN_VALUE_MAX)}…` : value;
  return t(`errors.${error.reason}`, { ...rest, value: shown, field: field && t(`fields.${field}`) });
}

/** A field's values for people: runs of three or more as ranges, months and weekdays by name. */
function valuesText(field: Field, locale: Locale): string {
  const name = (value: number) => valueName(field.name, value, locale);
  const pieces: string[] = [];
  const values = field.values;
  for (let i = 0; i < values.length; ) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j]! + 1) j++;
    if (j - i >= 2) pieces.push(`${name(values[i]!)}–${name(values[j]!)}`);
    else for (let k = i; k <= j; k++) pieces.push(name(values[k]!));
    i = j + 1;
  }
  return pieces.join(", ");
}

function Fields({ cron, locale }: { cron: Cron; locale: Locale }) {
  const { t } = useTranslation("cron");
  return (
    <section aria-label={t("fields.title")} className="flex max-w-xl flex-col gap-3">
      <h3 className="text-sm font-medium">{t("fields.title")}</h3>
      <table className="w-full text-[13px]">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="pb-1.5 font-normal">
              {t("fields.field")}
            </th>
            <th scope="col" className="pb-1.5 font-normal">
              {t("fields.written")}
            </th>
            <th scope="col" className="pb-1.5 font-normal">
              {t("fields.values")}
            </th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map((name) => {
            const field = cron.fields[name];
            const any = field.text === "*" || field.text === "?";
            return (
              <tr key={name} className="border-t align-top">
                <th scope="row" className="py-1.5 pr-4 text-left font-normal whitespace-nowrap">
                  {t(`fields.${name}`)}
                </th>
                <td className="py-1.5 pr-4 font-mono">{field.text}</td>
                <td className="py-1.5 font-mono break-all">{any ? t("fields.any") : valuesText(field, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const offsetText = (minutes: number) =>
  `${minutes < 0 ? "-" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;

function runText(run: Run, zone: string, locale: Locale): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: zone }).format(run.at);
  return `${run.wall} ${offsetText(run.offset)} ${weekday}`;
}

/** Suggestions for the zone field: some 400 zones, so it renders once rather than on every keystroke. */
const ZoneList = memo(function ZoneList({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {KNOWN_ZONES.map((zone) => (
        <option key={zone} value={zone} />
      ))}
    </datalist>
  );
});

function Runs({ cron, now, locale }: { cron: Cron; now: number; locale: Locale }) {
  const { t } = useTranslation("cron");
  const zoneId = useId();
  const listId = useId();
  const [saved, setSaved] = usePreference<string>("zone");
  const [draft, setDraft] = useState(saved);
  const zone = draft.trim() === "" ? LOCAL_ZONE : draft.trim();

  const runs = useMemo(() => {
    try {
      return nextRuns(cron, now, zone, RUN_COUNT);
    } catch (error) {
      if (error instanceof CronError) return null;
      throw error;
    }
  }, [cron, now, zone]);

  const changeZone = (next: string) => {
    setDraft(next);
    // Only a zone that works is kept for next time; one half typed is not.
    if (next.trim() === "") setSaved("");
    else if (isZone(next.trim())) setSaved(next.trim());
  };

  return (
    <section aria-label={t("runs.title")} className="flex max-w-xl flex-col gap-3">
      <h3 className="text-sm font-medium">{t("runs.title")}</h3>
      <div className="flex flex-col gap-2">
        <Label htmlFor={zoneId}>{t("runs.zone")}</Label>
        <Input
          id={zoneId}
          value={draft}
          onChange={(event) => changeZone(event.target.value)}
          placeholder={LOCAL_ZONE}
          list={listId}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={runs === null ? true : undefined}
          className="font-mono text-[13px]"
        />
        <ZoneList id={listId} />
        {runs === null ? (
          <ErrorMessage>{t("runs.unknownZone", { zone: draft.trim() })}</ErrorMessage>
        ) : (
          <p className="text-xs text-muted-foreground">{t("runs.local", { zone: LOCAL_ZONE })}</p>
        )}
      </div>
      {runs !== null &&
        (runs.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("runs.none")}</p>
        ) : (
          <ResultRow label={t("runs.list", { count: runs.length })} value={runs.map((run) => runText(run, zone, locale)).join("\n")} multiline />
        ))}
    </section>
  );
}

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
