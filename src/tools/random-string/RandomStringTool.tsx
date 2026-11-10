import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { attempt } from "@/lib/attempt";
import { usePreference } from "@/lib/preferences";
import { DEFAULT_CUSTOM_ALPHABET, generate, GenerateError } from "./logic";
import { MODES, type Mode } from "./modes";

function Output({ output, label, onGenerate }: { output: string; label: string; onGenerate: () => void }) {
  const { t } = useTranslation("random-string");

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex items-start gap-3 rounded-lg border px-3 py-2">
        <span className="min-w-0 flex-1 font-mono text-[15px] whitespace-pre-wrap break-all select-all" aria-label={label}>
          {output}
        </span>
        <CopyButton value={output} disabled={output === ""} />
        <Button type="button" variant="outline" size="sm" onClick={onGenerate}>
          <RefreshCw aria-hidden />
          {t("generate")}
        </Button>
      </div>
    </div>
  );
}

/** A stored value kept as text, so the user's in-progress typing (even an empty field) survives a restart. */
function useStoredText(key: string, fallback: string): [string, (text: string) => void] {
  const [stored, setStored] = usePreference<string>(key);
  return [typeof stored === "string" ? stored : fallback, setStored];
}

/** Random String: Nano IDs, hex and Base64URL tokens, and strings over a custom alphabet. Results stay in memory. */
export default function RandomStringTool() {
  const { t } = useTranslation("random-string");
  const [mode, setMode] = useState<Mode>("nano");

  const [lengthText, setLengthText] = useStoredText("length", "32");
  const [countText, setCountText] = useStoredText("count", "1");
  const [alphabet, setAlphabet] = useStoredText("alphabet", DEFAULT_CUSTOM_ALPHABET);

  const options = useMemo(
    () => ({
      mode,
      length: Number.parseInt(lengthText, 10),
      count: Number.parseInt(countText, 10),
      alphabet,
    }),
    [mode, lengthText, countText, alphabet],
  );

  // The generated strings live in memory alone: they are remade whenever an option changes or Generate is pressed,
  // and never written to the store (ADR-0004). nonce is the re-roll; it is read only to bust the memo.
  const [nonce, setNonce] = useState(0);
  const result = useMemo<{ output: string; error: string | null }>(() => {
    void nonce;
    const { value, error } = attempt(() => generate(options).join("\n"), GenerateError);
    return { output: value ?? "", error };
  }, [options, nonce]);

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup variant="outline" size="sm" aria-label={t("mode")} value={[mode]} onValueChange={([value]) => value && setMode(value as Mode)}>
        {MODES.map((m) => (
          <ToggleGroupItem key={m} value={m} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
            {t(`modes.${m}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-20">
          <Input
            aria-label={t("length")}
            value={lengthText}
            onChange={(event) => setLengthText(event.target.value)}
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            className="text-[13px]"
          />
        </div>
        <div className="w-20">
          <Input
            aria-label={t("count")}
            value={countText}
            onChange={(event) => setCountText(event.target.value)}
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            className="text-[13px]"
          />
        </div>
        {mode === "custom" && (
          <Input
            aria-label={t("alphabet")}
            value={alphabet}
            onChange={(event) => setAlphabet(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="min-w-40 flex-1 font-mono text-[13px]"
          />
        )}
      </div>

      {result.error && <ErrorMessage>{t(`errors.${result.error}`)}</ErrorMessage>}
      <Output output={result.output} label={t("output")} onGenerate={() => setNonce((n) => n + 1)} />
    </div>
  );
}
