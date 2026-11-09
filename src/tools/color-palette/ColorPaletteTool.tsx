import { useId, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, Check, X } from "lucide-react";
import { ErrorMessage } from "@/components/error-message";
import { ResultRow } from "@/components/result-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaste } from "@/lib/paste";
import { usePreference, useRecent } from "@/lib/preferences";
import { VISION_KINDS, simulateVision } from "./color-vision";
import { CONTRAST_LEVELS, contrastChecks, contrastRatio, formatRatio, suggestText, type ContrastLevel } from "./contrast";
import {
  COLOR_FORMATS,
  ColorError,
  EXPORT_KINDS,
  HARMONIES,
  exportPalette,
  formatColor,
  harmony,
  isInGamut,
  parseColor,
  shades,
  type Color,
  type ColorFormat,
  type ExportKind,
  type Harmony,
  type NamedColor,
} from "./logic";

/** The formats an export can use: every one CSS reads, so not HSV. */
const EXPORT_FORMATS = COLOR_FORMATS.filter((format) => format !== "hsv");

type Parsed = { color: Color; error: null } | { color: null; error: string | null };

/** The Input read as a color, or why it could not be; an empty Input is neither. */
function parse(text: string): Parsed {
  if (text.trim() === "") return { color: null, error: null };
  try {
    return { color: parseColor(text), error: null };
  } catch (error) {
    if (error instanceof ColorError) return { color: null, error: error.reason };
    throw error;
  }
}

/** A color painted over a checkerboard, so its alpha shows. */
function paint(color: Color): CSSProperties {
  const value = formatColor(color, "rgb");
  return {
    backgroundImage: `linear-gradient(${value}, ${value}), repeating-conic-gradient(#d4d4d4 0 25%, #fff 0 50%)`,
    backgroundSize: "auto, 8px 8px",
  };
}

/** A swatch that makes its color the Input when clicked. */
function Swatch({ color, onUse, className }: { color: Color; onUse: (hex: string) => void; className?: string }) {
  const { t } = useTranslation("color-palette");
  const hex = formatColor(color, "hex");
  return (
    <button
      type="button"
      aria-label={t("use", { color: hex })}
      onClick={() => onUse(hex)}
      style={paint(color)}
      className={`rounded-md border border-foreground/10 transition-transform active:scale-95 ${className ?? ""}`}
    />
  );
}

/** A row of swatches, each with its name and hex under it. */
function SwatchStrip({ items, onUse }: { items: NamedColor[]; onUse: (hex: string) => void }) {
  return (
    <div className="flex gap-1">
      {items.map(({ name, color }) => (
        <div key={name} className="flex min-w-0 flex-1 flex-col gap-1">
          <Swatch color={color} onUse={onUse} className="h-14 w-full" />
          <span className="truncate text-xs text-muted-foreground">{name}</span>
          <span className="truncate font-mono text-xs tabular-nums">{formatColor(color, "hex")}</span>
        </div>
      ))}
    </div>
  );
}

/** Color Palette: one CSS color in every format, its shades and harmonies to export. Input stays in memory. */
export default function ColorPaletteTool() {
  const { t } = useTranslation("color-palette");
  const id = useId();
  const [text, setText] = useState("");
  const [background, setBackground] = useState("#ffffff");
  const [recent, addRecent] = useRecent();
  usePaste(setText);
  const parsed = useMemo(() => parse(text), [text]);
  const color = parsed.color;
  /** A color the user copied goes into the Recent, as hex: never the text they typed. */
  const remember = () => color && addRecent(formatColor(color, "hex"));
  const swap = () => {
    setText(background);
    setBackground(text);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{t("color")}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t("picker")}
            value={color ? formatColor({ ...color, alpha: 1 }, "hex") : "#000000"}
            onChange={(event) => setText(event.target.value)}
            className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
          />
          <Input
            id={id}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("placeholder")}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-[13px]"
          />
        </div>
        {recent.length > 0 && (
          <div role="group" aria-label={t("recent")} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("recent")}</span>
            {recent.map((hex) => {
              const item = parse(hex).color;
              return item && <Swatch key={hex} color={item} onUse={setText} className="size-6" />;
            })}
          </div>
        )}
      </div>
      {parsed.error && <ErrorMessage>{t(`errors.${parsed.error}`)}</ErrorMessage>}
      {color && (
        <>
          <Formats color={color} onCopied={remember} />
          <Palettes color={color} onUse={setText} onCopied={remember} />
          <Contrast color={color} background={background} onBackground={setBackground} onSwap={swap} onUse={setText} onCopied={addRecent} />
          <ColorVision color={color} onUse={setText} />
        </>
      )}
    </div>
  );
}

function Formats({ color, onCopied }: { color: Color; onCopied: () => void }) {
  const { t } = useTranslation("color-palette");
  return (
    <section aria-label={t("formats.title")} className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("formats.title")}</h3>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {COLOR_FORMATS.map((format) => (
          <ResultRow
            key={format}
            label={format.toUpperCase()}
            value={formatColor(color, format)}
            note={format === "hsv" ? t("formats.hsvNote") : undefined}
            onCopied={onCopied}
          />
        ))}
      </div>
      {!isInGamut(color) && <p className="text-xs text-muted-foreground">{t("formats.outOfGamut")}</p>}
    </section>
  );
}

function Palettes({ color, onUse, onCopied }: { color: Color; onUse: (hex: string) => void; onCopied: () => void }) {
  const { t } = useTranslation("color-palette");
  const nameId = useId();
  const [format, setFormat] = usePreference<ColorFormat>("exportFormat");
  const [exportAs, setExportAs] = usePreference<ExportKind>("exportAs");
  const [prefix, setPrefix] = usePreference<string>("exportPrefix");
  const [kind, setKind] = usePreference<Harmony>("harmony");
  const options = { format, as: exportAs, prefix };
  const asLabel = t(`export.${exportAs}`);

  const shadeItems = shades(color).map((shade) => ({ name: String(shade.step), color: shade.color }));
  const harmonyItems = harmony(color, kind).map((item, i) => ({ name: `${kind}-${i + 1}`, color: item }));

  return (
    <>
      <section aria-label={t("shades.title")} className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("shades.title")}</h3>
        <SwatchStrip items={shadeItems} onUse={onUse} />
      </section>

      <section aria-label={t("harmonies.title")} className="flex flex-col gap-3">
        <div className="flex h-7 items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t("harmonies.title")}</h3>
          <Choice label={t("harmonies.kind")} value={kind} options={HARMONIES} name={(h) => t(`harmonies.kinds.${h}`)} onChange={setKind} />
        </div>
        <SwatchStrip items={harmonyItems} onUse={onUse} />
      </section>

      <section aria-label={t("export.title")} className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">{t("export.title")}</h3>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>{t("export.name")}</Label>
            <Input
              id={nameId}
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              className="h-7 w-40 font-mono text-[13px]"
            />
          </div>
          <LabelledChoice label={t("export.format")} value={format} options={EXPORT_FORMATS} name={(f) => f.toUpperCase()} onChange={setFormat} />
          <LabelledChoice label={t("export.as")} value={exportAs} options={EXPORT_KINDS} name={(k) => t(`export.${k}`)} onChange={setExportAs} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultRow label={t("export.shades", { as: asLabel })} value={exportPalette(shadeItems, options)} multiline onCopied={onCopied} />
          <ResultRow label={t("export.harmony", { as: asLabel })} value={exportPalette(harmonyItems, options)} multiline onCopied={onCopied} />
        </div>
      </section>
    </>
  );
}

/** The levels a nearest passing color is offered for: normal text at AA and at AAA. */
const SUGGEST_LEVELS = CONTRAST_LEVELS.filter((level) => level.id === "aa-normal" || level.id === "aaa-normal");

/** WCAG contrast of the color, as text, on a second color: the ratio, the levels it passes, and colors that pass. */
function Contrast({
  color,
  background,
  onBackground,
  onSwap,
  onUse,
  onCopied,
}: {
  color: Color;
  background: string;
  onBackground: (text: string) => void;
  onSwap: () => void;
  onUse: (hex: string) => void;
  /** Called with the hex of a color the user copied. */
  onCopied: (hex: string) => void;
}) {
  const { t } = useTranslation("color-palette");
  const id = useId();
  const parsed = parse(background);
  const bg = parsed.color;

  return (
    <section aria-label={t("contrast.title")} className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("contrast.title")}</h3>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{t("contrast.background")}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={t("contrast.backgroundPicker")}
            value={bg ? formatColor({ ...bg, alpha: 1 }, "hex") : "#ffffff"}
            onChange={(event) => onBackground(event.target.value)}
            className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
          />
          <Input
            id={id}
            value={background}
            onChange={(event) => onBackground(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="font-mono text-[13px]"
          />
          <Button variant="outline" size="sm" onClick={onSwap}>
            <ArrowUpDown aria-hidden />
            {t("contrast.swap")}
          </Button>
        </div>
      </div>
      {parsed.error && <ErrorMessage>{t(`errors.${parsed.error}`)}</ErrorMessage>}
      {bg && <ContrastResult color={color} background={bg} onUse={onUse} onCopied={onCopied} />}
    </section>
  );
}

function ContrastResult({
  color,
  background,
  onUse,
  onCopied,
}: {
  color: Color;
  background: Color;
  onUse: (hex: string) => void;
  onCopied: (hex: string) => void;
}) {
  const { t } = useTranslation("color-palette");
  const ratio = contrastRatio(color, background);
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <div
          aria-hidden
          style={{ ...paint(background), color: formatColor(color, "rgb") }}
          className="flex flex-col justify-center gap-1 rounded-md border border-foreground/10 px-4 py-3"
        >
          <span className="text-2xl font-semibold">{t("contrast.sampleLarge")}</span>
          <span className="text-sm">{t("contrast.sample")}</span>
        </div>
        <div className="flex flex-col gap-3">
          <ResultRow label={t("contrast.ratio")} value={formatRatio(ratio)} />
          <ul aria-label={t("contrast.levels")} className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
            {contrastChecks(ratio).map((check) => (
              <li key={check.id} className={`flex items-center gap-1.5 ${check.pass ? "" : "text-destructive"}`}>
                {check.pass ? <Check aria-hidden className="size-3.5" /> : <X aria-hidden className="size-3.5" />}
                {t(`contrast.checks.${check.id}`, { min: check.min })} · {t(check.pass ? "contrast.pass" : "contrast.fail")}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {SUGGEST_LEVELS.map(({ id, min }) => (
          <Suggestion key={id} level={id} min={min} color={color} background={background} onUse={onUse} onCopied={onCopied} />
        ))}
      </div>
    </>
  );
}

/** The nearest text color that reaches one level, to copy or use; or why there is none. */
function Suggestion({
  level,
  min,
  color,
  background,
  onUse,
  onCopied,
}: {
  level: ContrastLevel;
  min: number;
  color: Color;
  background: Color;
  onUse: (hex: string) => void;
  onCopied: (hex: string) => void;
}) {
  const { t } = useTranslation("color-palette");
  const found = suggestText(color, background, min);
  const passes = contrastRatio(color, background) >= min;
  const hex = found && formatColor(found, "hex");
  const note = passes
    ? t("contrast.passes")
    : found
      ? t("contrast.reaches", { ratio: formatRatio(contrastRatio(found, background)) })
      : t(color.alpha < 1 ? "contrast.noneTranslucent" : "contrast.none");
  return (
    <ResultRow
      label={t(`contrast.suggest.${level}`)}
      value={hex}
      note={note}
      onCopied={() => hex && onCopied(hex)}
      action={
        hex &&
        !passes && (
          <Button variant="ghost" size="sm" onClick={() => onUse(hex)}>
            {t("contrast.useSuggestion")}
          </Button>
        )
      }
    />
  );
}

/** The color as people with each kind of color blindness see it. */
function ColorVision({ color, onUse }: { color: Color; onUse: (hex: string) => void }) {
  const { t } = useTranslation("color-palette");
  const items = [
    { name: t("vision.kinds.normal"), color },
    ...VISION_KINDS.map((kind) => ({ name: t(`vision.kinds.${kind}`), color: simulateVision(color, kind) })),
  ];
  return (
    <section aria-label={t("vision.title")} className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("vision.title")}</h3>
      <SwatchStrip items={items} onUse={onUse} />
      <p className="text-xs text-muted-foreground">{t("vision.note")}</p>
    </section>
  );
}

/** One choice out of a few, as a row of toggle buttons. */
function Choice<T extends string>({
  label,
  value,
  options,
  name,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  name: (option: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup variant="outline" size="sm" aria-label={label} value={[value]} onValueChange={([next]) => next && onChange(next as T)}>
      {options.map((option) => (
        <ToggleGroupItem key={option} value={option} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
          {name(option)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** A `Choice` with its label shown above it. */
function LabelledChoice<T extends string>(props: Parameters<typeof Choice<T>>[0]) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">{props.label}</span>
      <Choice {...props} />
    </div>
  );
}
