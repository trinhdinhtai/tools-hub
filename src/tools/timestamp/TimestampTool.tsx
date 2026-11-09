import { memo, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaste } from "@/lib/paste";
import { usePreference } from "@/lib/preferences";
import {
  canonicalZone,
  formatIso,
  KNOWN_ZONES,
  parseInstant,
  relativeTime,
  TimestampError,
  toMilliseconds,
  unixValues,
  type Instant,
  type Parsed,
  type Unit,
} from "./logic";

const UNITS = ["auto", "s", "ms", "us", "ns"] as const;
const UNIX_FIELDS: readonly Unit[] = ["s", "ms", "us", "ns"];

/** The zone this computer is set to. */
const LOCAL_ZONE = new Intl.DateTimeFormat().resolvedOptions().timeZone;

/** One labelled, read-only result with its copy button, and an optional line under it. */
function ResultRow({ label, value, note, action }: { label: string; value: string | null; note?: string; action?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* h-7 keeps the label row the height of the CopyButton, so the fields line up. */}
      <div className="flex h-7 items-center justify-between gap-2">
        <Label htmlFor={id} className="min-w-0 truncate">
          {label}
        </Label>
        <div className="flex items-center gap-1">
          {action}
          <CopyButton value={value ?? ""} disabled={value === null} />
        </div>
      </div>
      <Input id={id} value={value ?? "—"} readOnly spellCheck={false} className="bg-card font-mono text-[13px]" />
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Timestamp Converter: a timestamp, date or `now - 1d` in every form and zone. Input stays in memory. */
export default function TimestampTool() {
  const { t, i18n } = useTranslation("timestamp");
  const inputId = useId();
  const [text, setText] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]>("auto");
  // `now` is read when the Input changes, so a result holds still while it is being copied.
  const [now, setNow] = useState(() => Date.now());
  const edit = (next: string) => {
    setText(next);
    setNow(Date.now());
  };
  const [zones, setZones] = usePreference<string[]>("zones");

  usePaste((pasted) => edit(pasted.trim()));

  const { parsed, error } = useMemo(() => {
    if (text.trim() === "") return { parsed: null, error: null };
    try {
      return { parsed: parseInstant(text, { now, zone: LOCAL_ZONE, unit }), error: null };
    } catch (error) {
      if (error instanceof TimestampError) return { parsed: null, error };
      throw error;
    }
  }, [text, unit, now]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-xl flex-col gap-2">
        <div className="flex h-7 items-center justify-between gap-2">
          <Label htmlFor={inputId}>{t("input")}</Label>
          <div className="flex items-center gap-1">
            {/* `items` lets the trigger show the unit's name rather than its id. */}
            <Select items={UNITS.map((u) => ({ value: u, label: t(`units.${u}`) }))} value={unit} onValueChange={(next) => next !== null && setUnit(next as (typeof UNITS)[number])}>
              <SelectTrigger size="sm" aria-label={t("unit")} className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {t(`units.${u}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => edit(String(Math.floor(Date.now() / 1000)))}>
              {t("now")}
            </Button>
          </div>
        </div>
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
        {parsed && <p className="text-xs text-muted-foreground">{readAs(t, parsed)}</p>}
      </div>
      {error && <ErrorMessage>{t(`errors.${error.reason}`)}</ErrorMessage>}
      {parsed && <Results instant={parsed.instant} now={now} locale={i18n.language} />}
      {parsed && <Zones instant={parsed.instant} zones={zones} onZones={setZones} locale={i18n.language} />}
    </div>
  );
}

function readAs(t: ReturnType<typeof useTranslation<"timestamp">>["t"], parsed: Parsed): string {
  if (parsed.source !== "unix") return t(`readAs.${parsed.source}`);
  return t("readAs.unix", { unit: t(`units.${parsed.unit!}`).toLowerCase() });
}

function Results({ instant, now, locale }: { instant: Instant; now: number; locale: string }) {
  const { t } = useTranslation("timestamp");
  const values = unixValues(instant);
  const { value, unit } = relativeTime(instant, now);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {UNIX_FIELDS.map((u) => (
        <ResultRow key={u} label={t(`fields.${u}`)} value={values[u]} />
      ))}
      <ResultRow label={t("fields.iso")} value={formatIso(instant, "UTC")} />
      <ResultRow label={t("fields.relative")} value={relative} />
    </div>
  );
}

/** The instant written out in a zone for people, e.g. "Wednesday, November 15, 2023 at 5:13:20 AM GMT+7". */
function spelledOut(instant: Instant, zone: string, locale: string): string | undefined {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "long", timeZone: zone }).format(toMilliseconds(instant));
  } catch {
    return undefined;
  }
}

/** Suggestions for the add field: some 400 zones, so it renders once rather than on every keystroke. */
const ZoneList = memo(function ZoneList({ id }: { id: string }) {
  return (
    <datalist id={id}>
      {KNOWN_ZONES.map((zone) => (
        <option key={zone} value={zone} />
      ))}
    </datalist>
  );
});

function Zones({ instant, zones, onZones, locale }: { instant: Instant; zones: string[]; onZones: (zones: string[]) => void; locale: string }) {
  const { t } = useTranslation("timestamp");
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [unknown, setUnknown] = useState<string | null>(null);

  const add = (event: FormEvent) => {
    event.preventDefault();
    const zone = draft.trim();
    if (zone === "") return;
    // Spelled as the runtime lists it (asia/tokyo becomes Asia/Tokyo), so the same zone is not added twice.
    const known = canonicalZone(zone);
    if (!known) {
      setUnknown(zone);
      return;
    }
    setUnknown(null);
    setDraft("");
    if (known !== LOCAL_ZONE && !zones.includes(known)) onZones([...zones, known]);
  };

  const row = (zone: string, label: string, removable: boolean) => {
    const iso = formatIso(instant, zone);
    return (
      <ResultRow
        key={zone}
        label={label}
        value={iso}
        note={iso === null ? t("zones.outOfRange") : spelledOut(instant, zone, locale)}
        action={
          removable && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("zones.remove", { zone })} onClick={() => onZones(zones.filter((z) => z !== zone))}>
              <X aria-hidden />
            </Button>
          )
        }
      />
    );
  };

  return (
    <section aria-label={t("zones.title")} className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("zones.title")}</h3>
      <div className="grid gap-4 lg:grid-cols-2">
        {row(LOCAL_ZONE, t("zones.local", { zone: LOCAL_ZONE }), false)}
        {/* A stored zone the runtime no longer knows (after an update, say) is skipped rather than crashing the Tool. */}
        {zones.filter((zone) => zone !== LOCAL_ZONE && canonicalZone(zone) !== null).map((zone) => row(zone, zone, true))}
      </div>
      <form onSubmit={add} className="flex max-w-xl items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            aria-label={t("zones.addLabel")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("zones.addPlaceholder")}
            list={listId}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={unknown ? true : undefined}
            className="font-mono text-[13px]"
          />
          {unknown && <ErrorMessage>{t("zones.unknown", { zone: unknown })}</ErrorMessage>}
        </div>
        <ZoneList id={listId} />
        <Button type="submit" variant="outline">
          {t("zones.add")}
        </Button>
      </form>
    </section>
  );
}
