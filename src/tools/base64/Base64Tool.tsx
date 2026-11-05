import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePreference } from "@/lib/preferences";
import { DecodeError, decode, encode, type Variant } from "./logic";

type Direction = "encode" | "decode";

const DIRECTIONS: Direction[] = ["encode", "decode"];
const VARIANTS: Variant[] = ["standard", "url-safe", "base32"];
const VARIANT_NAMES: Record<Variant, string> = { standard: "Base64", "url-safe": "Base64 URL-safe", base32: "Base32" };

function convert(input: string, direction: Direction, variant: Variant) {
  if (direction === "encode") return { output: encode(input, variant) };
  try {
    return { output: decode(input, variant) };
  } catch (error) {
    if (error instanceof DecodeError) return { output: "", error: error.reason };
    throw error;
  }
}

const utf8 = new TextEncoder();

function Count({ text }: { text: string }) {
  const { t } = useTranslation("base64");
  return (
    <p className="font-mono text-xs text-muted-foreground tabular-nums">
      {t("count", { chars: [...text].length, bytes: utf8.encode(text).length })}
    </p>
  );
}

export default function Base64Tool() {
  const { t } = useTranslation("base64");
  const id = useId();
  const [direction, setDirection] = useState<Direction>("encode");
  const [storedVariant, setVariant] = usePreference<Variant>("variant");
  const variant = VARIANTS.includes(storedVariant) ? storedVariant : "standard";
  const [input, setInput] = useState("");

  const { output, error } = convert(input, direction, variant);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Single choice: Base UI ToggleGroup values are arrays; pressing the active item again keeps it. */}
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={t("direction.label")}
          value={[direction]}
          onValueChange={([value]) => value && setDirection(value as Direction)}
        >
          {DIRECTIONS.map((d) => (
            <ToggleGroupItem
              key={d}
              value={d}
              className="px-3 text-subtle-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {t(`direction.${d}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={t("variant.label")}
          value={[variant]}
          onValueChange={([value]) => value && setVariant(value as Variant)}
        >
          {VARIANTS.map((v) => (
            <ToggleGroupItem key={v} value={v} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
              {t(`variant.${v}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-input`}>{t("input")}</Label>
          <Textarea
            id={`${id}-input`}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            className="min-h-64 resize-y font-mono text-[13px] leading-5"
          />
          <Count text={input} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-output`}>{t("output")}</Label>
          <Textarea
            id={`${id}-output`}
            value={output}
            readOnly
            spellCheck={false}
            className="min-h-64 resize-y bg-card font-mono text-[13px] leading-5 break-all"
          />
          {error ? (
            <p role="alert" className="text-[13px] text-destructive">
              {t(`errors.${error}`, { variant: VARIANT_NAMES[variant] })}
            </p>
          ) : (
            <Count text={output} />
          )}
        </div>
      </div>
    </div>
  );
}
