import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { attempt } from "@/lib/attempt";
import { usePaste } from "@/lib/paste";
import { usePreference } from "@/lib/preferences";
import { DataUriSwitch, FileMode } from "./FileMode";
import { DecodeError, VARIANT_NAMES, decode, encode, isDataUri, type Variant } from "./logic";
import { MODES, type Mode } from "./modes";

type Direction = "encode" | "decode";

const DIRECTIONS: Direction[] = ["encode", "decode"];
const VARIANTS: Variant[] = ["standard", "url-safe", "base32"];

function convert(input: string, direction: Direction, variant: Variant) {
  if (direction === "encode") return { output: encode(input, variant) };
  const { value, error } = attempt(() => decode(input, variant), DecodeError);
  return { output: value ?? "", error };
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

function TextMode({ input, onInput, direction, variant }: { input: string; onInput: (text: string) => void; direction: Direction; variant: Variant }) {
  const { t } = useTranslation("base64");
  const id = useId();
  const { output, error } = convert(input, direction, variant);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-input`}>{t("input")}</Label>
        <Textarea
          id={`${id}-input`}
          value={input}
          onChange={(event) => onInput(event.target.value)}
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
        {error ? <ErrorMessage>{t(`errors.${error}`, { variant: VARIANT_NAMES[variant] })}</ErrorMessage> : <Count text={output} />}
      </div>
    </div>
  );
}

export default function Base64Tool() {
  const { t } = useTranslation("base64");
  const [mode, setMode] = useState<Mode>("text");
  const [direction, setDirection] = useState<Direction>("encode");
  const [storedVariant, setVariant] = usePreference<Variant>("variant");
  const variant = VARIANTS.includes(storedVariant) ? storedVariant : "standard";
  const [dataUri, setDataUri] = usePreference<boolean>("dataUri");
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState("");
  // Pasted Base64 is there to be decoded; a pasted data URI is a file.
  usePaste((text) => {
    setDirection("decode");
    if (isDataUri(text)) {
      setMode("file");
      setFileText(text);
    } else {
      setMode("text");
      setInput(text);
    }
  });

  const encodingDataUri = mode === "file" && direction === "encode" && dataUri;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
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
        {/* A data URI is always standard Base64. */}
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={t("variant.label")}
          value={[encodingDataUri ? "standard" : variant]}
          disabled={encodingDataUri}
          onValueChange={([value]) => value && setVariant(value as Variant)}
        >
          {VARIANTS.map((v) => (
            <ToggleGroupItem key={v} value={v} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
              {t(`variant.${v}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {mode === "file" && direction === "encode" && <DataUriSwitch checked={dataUri} onChange={setDataUri} />}
      </div>

      {mode === "text" ? (
        <TextMode input={input} onInput={setInput} direction={direction} variant={variant} />
      ) : (
        <FileMode
          direction={direction}
          variant={variant}
          dataUri={dataUri}
          file={file}
          onFile={setFile}
          text={fileText}
          onText={setFileText}
        />
      )}
    </div>
  );
}
