import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { builderMax, changeKind, readBuilder, setField, splitFields, type FieldSpec, type Kind } from "./builder";
import { BOUNDS, FIELDS, type FieldName, type Locale } from "./logic";
import { valueName } from "./value-name";

const KINDS: readonly Kind[] = ["every", "step", "range", "values"];

/** Mode Builder: each field picked from choices, written straight into the expression, which stays the one source of truth. */
export function BuilderMode({ text, locale, onChange }: { text: string; locale: Locale; onChange: (text: string) => void }) {
  const { t } = useTranslation("cron");
  const specs = useMemo(() => readBuilder(text), [text]);
  const written = useMemo(() => splitFields(text), [text]);

  const change = (name: FieldName, spec: FieldSpec) => {
    const next = setField(text, name, spec);
    if (next !== null) onChange(next);
  };

  return (
    <section aria-label={t("builder.title")} className="flex max-w-xl flex-col gap-3">
      {specs === null ? (
        <p className="text-[13px] text-muted-foreground">{t("builder.needsFive")}</p>
      ) : (
        FIELDS.map((name, i) => (
          <FieldRow
            key={name}
            name={name}
            spec={specs[name]}
            written={written?.[i] ?? ""}
            locale={locale}
            onChange={(spec) => change(name, spec)}
          />
        ))
      )}
    </section>
  );
}

function FieldRow({
  name,
  spec,
  written,
  locale,
  onChange,
}: {
  name: FieldName;
  spec: FieldSpec | null;
  written: string;
  locale: Locale;
  onChange: (spec: FieldSpec) => void;
}) {
  const { t } = useTranslation("cron");
  const { min } = BOUNDS[name];
  const max = builderMax(name);
  /** Every value the field can be given here; `spec.values` are the ones picked. */
  const choices = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const choiceItems = choices.map((value) => ({ value, label: valueName(name, value, locale) }));
  // A step of 1 is every value: Every N starts at 2, so it does not read back as Any.
  const steps = Array.from({ length: max - min }, (_, i) => i + 1);
  const everySteps = steps.filter((step) => step > 1);

  return (
    <div role="group" aria-label={t(`fields.${name}`)} className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="w-32 text-[13px]">
          {t(`fields.${name}`)}
        </span>
        <Choice
          label={t(`fields.${name}`)}
          value={spec?.kind ?? null}
          items={KINDS.map((kind) => ({ value: kind, label: t(`builder.kinds.${kind}`) }))}
          placeholder={t("builder.pick")}
          onChange={(kind) => onChange(changeKind(name, spec, kind))}
          className="w-40"
        />
        {spec?.kind === "step" && (
          <Choice
            label={t("builder.every")}
            value={spec.step}
            items={withValue(everySteps, spec.step).map((step) => ({ value: step, label: String(step) }))}
            onChange={(step) => onChange({ ...spec, step })}
          />
        )}
        {spec?.kind === "range" && (
          <>
            <Choice
              label={t("builder.from")}
              value={spec.start}
              items={choiceItems}
              onChange={(start) => onChange({ ...spec, start, end: Math.max(spec.end, start) })}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Choice
              label={t("builder.to")}
              value={spec.end}
              items={choiceItems}
              onChange={(end) => onChange({ ...spec, end, start: Math.min(spec.start, end) })}
            />
            <Choice
              label={t("builder.step")}
              value={spec.step}
              items={withValue(steps, spec.step).map((step) => ({ value: step, label: t("builder.everyStep", { step }) }))}
              onChange={(step) => onChange({ ...spec, step })}
            />
          </>
        )}
      </div>
      {spec === null && <p className="text-xs text-muted-foreground">{t("builder.unreadable", { field: t(`fields.${name}`), written })}</p>}
      {spec?.kind === "values" && (
        // Multiple choice; the last value picked cannot be taken away, as a field allows at least one.
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          spacing={1}
          aria-label={t("builder.values")}
          value={spec.values.map(String)}
          onValueChange={(next) => next.length > 0 && onChange({ ...spec, values: next.map(Number) })}
          className="flex-wrap"
        >
          {choiceItems.map(({ value, label }) => (
            <ToggleGroupItem
              key={value}
              value={String(value)}
              className="min-w-9 px-2 font-mono text-xs text-subtle-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}

/** The options, with the current value added when it was typed beyond them, such as `*\/90`. */
const withValue = (options: number[], value: number) => (options.includes(value) ? options : [...options, value].sort((a, b) => a - b));

function Choice<T extends string | number>({
  label,
  value,
  items,
  placeholder,
  onChange,
  className = "w-28",
}: {
  label: string;
  value: T | null;
  items: { value: T; label: string }[];
  placeholder?: string;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    // `items` lets the trigger show an option's label rather than its value.
    <Select items={items} value={value} onValueChange={(next) => next !== null && onChange(next)}>
      <SelectTrigger size="sm" aria-label={label} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
