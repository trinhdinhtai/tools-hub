import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CASES, SlugError, slugify, toCase } from "./logic";
import { MODES, type Mode } from "./modes";

/** One converted result: a labelled, read-only copy of the Input in a single style. */
function Result({ label, value }: { label: string; value: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      {/* h-7 keeps the label row the height of the CopyButton, so the textareas line up. */}
      <div className="flex h-7 items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <CopyButton value={value} disabled={value === ""} />
      </div>
      <Textarea
        id={id}
        value={value}
        readOnly
        spellCheck={false}
        className="min-h-16 resize-y bg-card font-mono text-[13px] leading-5 break-all"
      />
    </div>
  );
}

/** Case Converter: names converted to every case style as they are typed, and a URL slug per line. Input stays in memory. */
export default function CaseConverterTool() {
  const { t } = useTranslation("case-converter");
  const [mode, setMode] = useState<Mode>("convert");
  const [text, setText] = useState("");
  const id = useId();

  const cases = useMemo(() => CASES.map((style) => [style, toCase(text, style)] as const), [text]);
  const slug = useMemo(() => {
    try {
      return { slug: slugify(text), error: null };
    } catch (error) {
      if (error instanceof SlugError) return { slug: "", error: error.reason };
      throw error;
    }
  }, [text]);

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
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-input`}>{t("input")}</Label>
        <Textarea
          id={`${id}-input`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="min-h-20 resize-y font-mono text-[13px] leading-5"
        />
      </div>

      {mode === "convert" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {cases.map(([style, value]) => (
            <Result key={style} label={t(`cases.${style}`)} value={value} />
          ))}
        </div>
      ) : (
        <div className="flex max-w-xl flex-col gap-2">
          <Result label={t("output")} value={slug.slug} />
          {slug.error && <ErrorMessage>{t(`errors.${slug.error}`)}</ErrorMessage>}
        </div>
      )}
    </div>
  );
}
