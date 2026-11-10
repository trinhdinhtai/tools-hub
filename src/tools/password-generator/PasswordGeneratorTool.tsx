import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { attempt } from "@/lib/attempt";
import { usePreference } from "@/lib/preferences";
import {
  generatePassphrase,
  generatePassword,
  GenerateError,
  passwordEntropyBits,
  passphraseEntropyBits,
  SEPARATORS,
  STRENGTH_LEVELS,
  strengthOf,
  type Group,
  type PassphraseOptions,
  type PasswordOptions,
  type StrengthLevel,
} from "./logic";
import { MODES, type Mode } from "./modes";

/** The separators in the UI as stable Select values; the empty separator runs the words together. */
const SEPARATOR_CHOICES: { value: string; separator: (typeof SEPARATORS)[number] }[] = [
  { value: "hyphen", separator: "-" },
  { value: "dot", separator: "." },
  { value: "underscore", separator: "_" },
  { value: "space", separator: " " },
  { value: "none", separator: "" },
];

const ALL_GROUPS: readonly Group[] = ["lowercase", "uppercase", "digits", "symbols"];

/** How the strength bar paints its filled segments. */
const LEVEL_COLORS: Record<StrengthLevel, string> = {
  "very-weak": "bg-destructive",
  weak: "bg-destructive",
  fair: "bg-amber-500",
  strong: "bg-emerald-500",
  "very-strong": "bg-emerald-500",
};

function StrengthMeter({ bits }: { bits: number }) {
  const { t } = useTranslation("password-generator");
  const level = strengthOf(bits);
  const levelIndex = STRENGTH_LEVELS.indexOf(level);

  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-[13px] font-medium">{t("strength.label")}</span>
      <div
        className="flex min-w-0 flex-1 gap-1"
        role="meter"
        aria-label={t("strength.label")}
        aria-valuemin={0}
        aria-valuemax={STRENGTH_LEVELS.length}
        aria-valuenow={levelIndex + 1}
        aria-valuetext={t(`strength.levels.${level}`)}
      >
        {STRENGTH_LEVELS.map((segment, index) => (
          <span key={segment} className={`h-1.5 flex-1 rounded-full ${index <= levelIndex ? LEVEL_COLORS[level] : "bg-input"}`} />
        ))}
      </div>
      <span className="shrink-0 text-right text-[13px] whitespace-nowrap text-subtle-foreground">
        {t(`strength.levels.${level}`)} · {t("strength.bits", { bits: Math.round(bits) })}
      </span>
    </div>
  );
}

function Output({ result, label, onGenerate }: { result: { output: string; error: string | null }; label: string; onGenerate: () => void }) {
  const { t } = useTranslation("password-generator");

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
        <span className="min-w-0 flex-1 font-mono text-[15px] break-all select-all" aria-label={label}>
          {result.output}
        </span>
        <CopyButton value={result.output} disabled={result.output === ""} />
        <Button type="button" variant="outline" size="sm" onClick={onGenerate}>
          <RefreshCw aria-hidden />
          {t("generate")}
        </Button>
      </div>
    </div>
  );
}

function PasswordMode({
  lengthText,
  onLengthText,
  groups,
  onGroups,
  excludeAmbiguous,
  onExcludeAmbiguous,
  result,
  bits,
  onGenerate,
}: {
  lengthText: string;
  onLengthText: (text: string) => void;
  groups: readonly Group[];
  onGroups: (groups: readonly Group[]) => void;
  excludeAmbiguous: boolean;
  onExcludeAmbiguous: (value: boolean) => void;
  result: { output: string; error: string | null };
  bits: number;
  onGenerate: () => void;
}) {
  const { t } = useTranslation("password-generator");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-20">
          <Input
            aria-label={t("password.length")}
            value={lengthText}
            onChange={(event) => onLengthText(event.target.value)}
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            className="text-[13px]"
          />
        </div>
        <ToggleGroup
          multiple
          variant="outline"
          size="sm"
          aria-label={t("password.groups")}
          value={[...groups]}
          onValueChange={(values) => onGroups(ALL_GROUPS.filter((group) => values.includes(group)))}
        >
          {ALL_GROUPS.map((group) => (
            <ToggleGroupItem key={group} value={group} className="px-3 font-mono text-subtle-foreground aria-pressed:text-foreground">
              {t(`password.${group}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="password-ambiguous" checked={excludeAmbiguous} onCheckedChange={(checked) => onExcludeAmbiguous(checked)} />
        <Label htmlFor="password-ambiguous">{t("password.excludeAmbiguous")}</Label>
      </div>

      {result.error && <ErrorMessage>{t(`errors.${result.error}`)}</ErrorMessage>}
      <Output result={result} label={t("password.output")} onGenerate={onGenerate} />
      {!result.error && <StrengthMeter bits={bits} />}
    </div>
  );
}

function PassphraseMode({
  wordCountText,
  onWordCountText,
  separatorValue,
  onSeparatorValue,
  capitalize,
  onCapitalize,
  includeNumber,
  onIncludeNumber,
  result,
  bits,
  onGenerate,
}: {
  wordCountText: string;
  onWordCountText: (text: string) => void;
  separatorValue: string;
  onSeparatorValue: (value: string) => void;
  capitalize: boolean;
  onCapitalize: (value: boolean) => void;
  includeNumber: boolean;
  onIncludeNumber: (value: boolean) => void;
  result: { output: string; error: string | null };
  bits: number;
  onGenerate: () => void;
}) {
  const { t } = useTranslation("password-generator");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-20">
          <Input
            aria-label={t("passphrase.wordCount")}
            value={wordCountText}
            onChange={(event) => onWordCountText(event.target.value)}
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            className="text-[13px]"
          />
        </div>
        <Select value={separatorValue} onValueChange={(value) => value !== null && onSeparatorValue(value)}>
          <SelectTrigger size="sm" aria-label={t("passphrase.separator")} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {SEPARATOR_CHOICES.map(({ value }) => (
                <SelectItem key={value} value={value}>
                  {t(`passphrase.separators.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="passphrase-capitalize" checked={capitalize} onCheckedChange={(checked) => onCapitalize(checked)} />
          <Label htmlFor="passphrase-capitalize">{t("passphrase.capitalize")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="passphrase-number" checked={includeNumber} onCheckedChange={(checked) => onIncludeNumber(checked)} />
          <Label htmlFor="passphrase-number">{t("passphrase.includeNumber")}</Label>
        </div>
      </div>

      {result.error && <ErrorMessage>{t(`errors.${result.error}`)}</ErrorMessage>}
      <Output result={result} label={t("passphrase.output")} onGenerate={onGenerate} />
      {!result.error && <StrengthMeter bits={bits} />}
    </div>
  );
}

/** A stored number kept as text, so the user's in-progress typing (even an empty field) survives a restart. */
function useNumberText(key: string, fallback: string): [string, (text: string) => void] {
  const [stored, setStored] = usePreference<string>(key);
  return [typeof stored === "string" ? stored : fallback, setStored];
}

function useBoolean(key: string, fallback = false): [boolean, (value: boolean) => void] {
  const [stored, setStored] = usePreference<boolean>(key);
  return [typeof stored === "boolean" ? stored : fallback, setStored];
}

/** Password Generator: random passwords and passphrases with a strength estimate. Passwords are never stored. */
export default function PasswordGeneratorTool() {
  const { t } = useTranslation("password-generator");
  const [mode, setMode] = useState<Mode>("password");

  const [lengthText, setLengthText] = useNumberText("length", "20");
  const [storedGroups, setGroups] = usePreference<string[]>("groups");
  const groups = Array.isArray(storedGroups) ? ALL_GROUPS.filter((group) => storedGroups.includes(group)) : ALL_GROUPS;
  const [excludeAmbiguous, setExcludeAmbiguous] = useBoolean("excludeAmbiguous");
  const [wordCountText, setWordCountText] = useNumberText("wordCount", "5");
  const [storedSeparator, setSeparator] = usePreference<string>("separator");
  const separatorValue = SEPARATOR_CHOICES.some(({ value }) => value === storedSeparator) ? storedSeparator : "hyphen";
  const separator = SEPARATOR_CHOICES.find(({ value }) => value === separatorValue)!.separator;
  const [capitalize, setCapitalize] = useBoolean("capitalize");
  const [includeNumber, setIncludeNumber] = useBoolean("includeNumber");

  const options = useMemo<PasswordOptions & PassphraseOptions>(
    () => ({
      length: Number.parseInt(lengthText, 10),
      lowercase: groups.includes("lowercase"),
      uppercase: groups.includes("uppercase"),
      digits: groups.includes("digits"),
      symbols: groups.includes("symbols"),
      excludeAmbiguous,
      wordCount: Number.parseInt(wordCountText, 10),
      separator,
      capitalize,
      includeNumber,
    }),
    [lengthText, groups, excludeAmbiguous, wordCountText, separator, capitalize, includeNumber],
  );

  // The generated password lives in memory alone: it is remade whenever an option changes or Generate is pressed,
  // and never written to the store (ADR-0004). nonce is the re-roll; it is read only to bust the memo.
  const [nonce, setNonce] = useState(0);
  const result = useMemo<{ output: string; error: string | null }>(() => {
    void nonce;
    const { value, error } = attempt(() => (mode === "password" ? generatePassword(options) : generatePassphrase(options)), GenerateError);
    return { output: value ?? "", error };
  }, [mode, options, nonce]);

  const bits = mode === "password" ? passwordEntropyBits(options) : passphraseEntropyBits(options);

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup variant="outline" size="sm" aria-label={t("mode")} value={[mode]} onValueChange={([value]) => value && setMode(value as Mode)}>
        {MODES.map((m) => (
          <ToggleGroupItem key={m} value={m} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
            {t(`modes.${m}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {mode === "password" ? (
        <PasswordMode
          lengthText={lengthText}
          onLengthText={setLengthText}
          groups={groups}
          onGroups={(next) => setGroups([...next])}
          excludeAmbiguous={excludeAmbiguous}
          onExcludeAmbiguous={setExcludeAmbiguous}
          result={result}
          bits={bits}
          onGenerate={() => setNonce((n) => n + 1)}
        />
      ) : (
        <PassphraseMode
          wordCountText={wordCountText}
          onWordCountText={setWordCountText}
          separatorValue={separatorValue}
          onSeparatorValue={setSeparator}
          capitalize={capitalize}
          onCapitalize={setCapitalize}
          includeNumber={includeNumber}
          onIncludeNumber={setIncludeNumber}
          result={result}
          bits={bits}
          onGenerate={() => setNonce((n) => n + 1)}
        />
      )}
    </div>
  );
}
