import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorMessage } from "@/components/error-message";
import { ResultRow } from "@/components/result-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { attempt } from "@/lib/attempt";
import {
  BIT_WIDTHS,
  NumberBaseError,
  type BitWidth,
  evaluateExpression,
  parseNumber,
  toBase,
  toRoman,
  toSigned,
  toTwoComplement,
  toggleBit,
  wrapUnsigned,
} from "./logic";
import { MODES, type Mode } from "./modes";

/** The bases 2–36 the Input and the custom output row offer. */
const BASES = Array.from({ length: 35 }, (_, i) => i + 2);

/** What parsing the Input produced: a value, or why it could not. An empty Input is neither a value nor an error. */
interface Parsed {
  value: bigint | null;
  error: string | null;
}

function parse(text: string, evaluate: (text: string) => bigint): Parsed {
  if (text.trim() === "") return { value: null, error: null };
  return attempt(() => evaluate(text), NumberBaseError);
}

/** Every base at once: the four usual ones, a base of the user's choice up to 36, and the Roman numerals. */
function BaseResults({ value }: { value: bigint }) {
  const { t } = useTranslation("number-base");
  const [customBase, setCustomBase] = useState(36);
  const roman = toRoman(value);
  const customSelect = (
    <Select value={String(customBase)} onValueChange={(next) => next !== null && setCustomBase(Number(next))}>
      <SelectTrigger size="sm" aria-label={t("inputBase")} className="w-16">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {BASES.map((base) => (
            <SelectItem key={base} value={String(base)}>
              {base}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ResultRow label={t("outputs.binary")} value={toBase(value, 2)} multiline />
      <ResultRow label={t("outputs.octal")} value={toBase(value, 8)} multiline />
      <ResultRow label={t("outputs.decimal")} value={value.toString()} multiline />
      <ResultRow label={t("outputs.hexadecimal")} value={toBase(value, 16)} multiline />
      <ResultRow label={t("outputs.base", { base: customBase })} value={toBase(value, customBase)} multiline action={customSelect} />
      <ResultRow
        label={t("outputs.roman")}
        value={roman}
        multiline
        note={roman === null ? t("romanUnavailable") : undefined}
      />
    </div>
  );
}

/** The value's two's complement at a fixed width, like a register of 8, 16, 32 or 64 bits. */
function TwoComplement({ value }: { value: bigint }) {
  const { t } = useTranslation("number-base");
  const [width, setWidth] = useState<BitWidth>(32);
  const widthSelect = (
    <Select value={String(width)} onValueChange={(next) => next !== null && setWidth(Number(next) as BitWidth)}>
      <SelectTrigger size="sm" aria-label={t("bitWidth")} className="w-16">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {BIT_WIDTHS.map((w) => (
            <SelectItem key={w} value={String(w)}>
              {w}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <ResultRow label={t("twoComplement", { width })} value={toTwoComplement(value, width)} multiline action={widthSelect} />
    </div>
  );
}

/** One toggleable bit: its value on top, its index (0 = least significant) underneath. */
function BitCell({ index, on, onToggle }: { index: number; on: boolean; onToggle: (index: number) => void }) {
  const { t } = useTranslation("number-base");
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t("bits.bit", { index })}
      onClick={() => onToggle(index)}
      className="flex h-9 w-7 flex-col items-center justify-center gap-0.5 rounded-md border font-mono text-[13px] hover:bg-accent aria-pressed:bg-primary aria-pressed:text-primary-foreground"
    >
      {on ? "1" : "0"}
      <span className="font-sans text-[10px] leading-none text-muted-foreground">{index}</span>
    </button>
  );
}

/** The bit grid: a byte a row, most significant bit first, every bit switched with a click. */
function BitGrid({ unsigned, width, onToggle }: { unsigned: bigint; width: BitWidth; onToggle: (index: number) => void }) {
  const bits = toTwoComplement(unsigned, width);
  return (
    <div className="flex flex-wrap gap-4">
      {Array.from({ length: width / 8 }, (_, byte) => (
        <div key={byte} className="flex gap-0.5">
          {Array.from({ length: 8 }, (_, bitInByte) => {
            const index = width - 1 - (byte * 8 + bitInByte);
            return <BitCell key={index} index={index} on={bits[byte * 8 + bitInByte] === "1"} onToggle={onToggle} />;
          })}
        </div>
      ))}
    </div>
  );
}

/** What a mode's parse produced: the base grid and two's complement, the translated error, or nothing for empty Input. */
function ParsedResults({ parsed }: { parsed: Parsed }) {
  const { t } = useTranslation("number-base");
  if (parsed.error) return <ErrorMessage>{t(`errors.${parsed.error}`)}</ErrorMessage>;
  if (parsed.value === null) return null;
  return (
    <>
      <BaseResults value={parsed.value} />
      <TwoComplement value={parsed.value} />
    </>
  );
}

/** The input row shared by the modes: a label, an optional trailing control, and a single-line field. */
function InputRow({ label, value, onChange, placeholder, trailing }: { label: string; value: string; onChange: (text: string) => void; placeholder?: string; trailing?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-7 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {trailing}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="font-mono text-[13px]"
      />
    </div>
  );
}

/** Number Base: an integer in every base as it is typed, integer expressions, and a bit grid. Input stays in memory. */
export default function NumberBaseTool() {
  const { t } = useTranslation("number-base");
  const [mode, setMode] = useState<Mode>("convert");

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label={t("mode")}
        value={[mode]}
        onValueChange={([value]) => value && setMode(value as Mode)}
      >
        {MODES.map((m) => (
          <ToggleGroupItem key={m} value={m} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
            {t(`modes.${m}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {mode === "convert" ? <ConvertMode /> : mode === "expression" ? <ExpressionMode /> : <BitsMode />}
    </div>
  );
}

function ConvertMode() {
  const { t } = useTranslation("number-base");
  const [text, setText] = useState("");
  const [inputBase, setInputBase] = useState<string>("auto");
  const parsed = useMemo(
    () => parse(text, (value) => parseNumber(value, inputBase === "auto" ? "auto" : Number(inputBase))),
    [text, inputBase],
  );
  const baseSelect = (
    <Select value={inputBase} onValueChange={(next) => next !== null && setInputBase(next)}>
      <SelectTrigger size="sm" aria-label={t("inputBase")} className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="auto">{t("autoBase")}</SelectItem>
          {BASES.map((base) => (
            <SelectItem key={base} value={String(base)}>
              {t("outputs.base", { base })}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
  return (
    <div className="flex flex-col gap-4">
      <InputRow label={t("input")} value={text} onChange={setText} placeholder="2026" trailing={baseSelect} />
      <ParsedResults parsed={parsed} />
    </div>
  );
}

function ExpressionMode() {
  const { t } = useTranslation("number-base");
  const [text, setText] = useState("");
  const parsed = useMemo(() => parse(text, evaluateExpression), [text]);
  return (
    <div className="flex flex-col gap-4">
      <InputRow label={t("input")} value={text} onChange={setText} placeholder={t("expressionPlaceholder")} />
      <ParsedResults parsed={parsed} />
    </div>
  );
}

function BitsMode() {
  const { t } = useTranslation("number-base");
  const [text, setText] = useState("0");
  const [width, setWidth] = useState<BitWidth>(8);
  const parsed = useMemo(() => parse(text, (value) => parseNumber(value, "auto")), [text]);
  const unsigned = parsed.value !== null ? wrapUnsigned(parsed.value, width) : 0n;
  const widthGroup = (
    <ToggleGroup
      variant="outline"
      size="sm"
      aria-label={t("bitWidth")}
      value={[String(width)]}
      onValueChange={([value]) => value && setWidth(Number(value) as BitWidth)}
    >
      {BIT_WIDTHS.map((w) => (
        <ToggleGroupItem key={w} value={String(w)} className="px-2.5 text-subtle-foreground aria-pressed:text-foreground">
          {w}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
  return (
    <div className="flex flex-col gap-4">
      <InputRow label={t("bits.value")} value={text} onChange={setText} placeholder="0" trailing={widthGroup} />
      {parsed.error ? (
        <ErrorMessage>{t(`errors.${parsed.error}`)}</ErrorMessage>
      ) : (
        <>
          <BitGrid
            unsigned={unsigned}
            width={width}
            onToggle={(index) => setText(toSigned(toggleBit(unsigned, index), width).toString())}
          />
          <div className="grid gap-4 lg:grid-cols-3">
            <ResultRow label={t("bits.signed")} value={toSigned(unsigned, width).toString()} multiline />
            <ResultRow label={t("bits.unsigned")} value={unsigned.toString()} multiline />
            <ResultRow label={t("outputs.hexadecimal")} value={toBase(unsigned, 16)} multiline />
          </div>
        </>
      )}
    </div>
  );
}
