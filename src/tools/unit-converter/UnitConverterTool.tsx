import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorMessage } from "@/components/error-message";
import { ResultRow } from "@/components/result-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { attempt } from "@/lib/attempt";
import { QUANTITIES, UnitError, convert, quantityOf, unitsOf, type Converted, type Quantity, type UnitErrorReason, type UnitId } from "./logic";

/** The unit a quantity starts in when the user picks it. */
const DEFAULT_UNIT: Record<Quantity, UnitId> = { length: "m", mass: "kg", temperature: "c", data: "MB" };

/** Every unit's value, or why the Input could not be converted. An empty Input is neither. */
function run(text: string, from: UnitId): { value: Converted[] | null; error: Exclude<UnitErrorReason, "empty"> | null } {
  const { value, error } = attempt(() => convert(text, from), UnitError);
  return error === "empty" ? { value: null, error: null } : { value, error };
}

/** Unit Converter: a value in one unit shown in every other unit of its quantity as it is typed. Input stays in memory. */
export default function UnitConverterTool() {
  const { t } = useTranslation("unit-converter");
  const id = useId();
  // The unit names its quantity, so the two can never disagree.
  const [from, setFrom] = useState<UnitId>(DEFAULT_UNIT.length);
  const quantity = quantityOf(from);
  const [text, setText] = useState("");
  const result = useMemo(() => run(text, from), [text, from]);

  const units = unitsOf(quantity).map((unit) => ({ value: unit, label: t(`units.${unit}`) }));
  const unitSelect = (
    <Select items={units} value={from} onValueChange={(next) => next !== null && setFrom(next)}>
      <SelectTrigger size="sm" aria-label={t("fromUnit")} className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {units.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label={t("quantity")}
        value={[quantity]}
        onValueChange={([value]) => {
          const next = QUANTITIES.find((q) => q === value);
          if (next) setFrom(DEFAULT_UNIT[next]);
        }}
      >
        {QUANTITIES.map((q) => (
          <ToggleGroupItem key={q} value={q} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
            {t(`quantities.${q}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex max-w-xl flex-col gap-2">
        <div className="flex h-7 items-center justify-between gap-2">
          <Label htmlFor={id}>{t("value")}</Label>
          {unitSelect}
        </div>
        <Input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="1"
          inputMode="decimal"
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-[13px]"
        />
      </div>
      {result.error && <ErrorMessage>{t(`errors.${result.error}`)}</ErrorMessage>}
      {result.value && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.value
            .filter(({ unit }) => unit !== from)
            .map(({ unit, value }) => (
              <ResultRow key={unit} label={t(`units.${unit}`)} value={value} />
            ))}
        </div>
      )}
    </div>
  );
}
