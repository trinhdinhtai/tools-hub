import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { attempt } from "@/lib/attempt";
import { usePaste } from "@/lib/paste";
import {
  generate,
  GeneratorError,
  inspect,
  InspectError,
  isNamedVersion,
  NAMED_NAMESPACES,
  VERSIONS,
  type IdDetails,
  type Version,
} from "./logic";
import { MODES, type Mode } from "./modes";

const MAX_COUNT = 100;

/** What live generation produced: the IDs, or why it could not. */
interface GenerateResult {
  ids: string[];
  error: string | null;
}

/** One fact about the inspected ID: its translated label on the left, the value on the right. */
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-3 px-3 py-2">
      <span className="w-28 shrink-0 text-[13px] font-medium">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] break-all">{value}</span>
    </li>
  );
}

function DetailsCard({ details }: { details: IdDetails }) {
  const { t, i18n } = useTranslation("uuid-generator");
  const when = useMemo(
    () =>
      details.timestampMs === null
        ? null
        : new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "long" }).format(
            new Date(details.timestampMs),
          ),
    [details.timestampMs, i18n.language],
  );

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("inspect.details")}</Label>
      <ul aria-label={t("inspect.details")} className="divide-y rounded-lg border">
        <DetailRow label={t("inspect.kind")} value={t(`inspect.kinds.${details.kind}`)} />
        <li className="flex items-center gap-3 px-3 py-2">
          <span className="w-28 shrink-0 text-[13px] font-medium">{t("inspect.canonical")}</span>
          <span className="min-w-0 flex-1 font-mono text-[13px] break-all">{details.canonical}</span>
          <CopyButton value={details.canonical} />
        </li>
        <DetailRow label={t("inspect.version")} value={details.version === null ? "—" : `v${details.version}`} />
        <DetailRow label={t("inspect.variant")} value={details.variant === null ? "—" : t(`inspect.variants.${details.variant}`)} />
        <DetailRow
          label={t("inspect.timestamp")}
          value={
            details.timestampMs === null ? (
              <span className="text-subtle-foreground">{t("inspect.noTimestamp")}</span>
            ) : (
              <>
                {when}
                <span className="ml-2 font-mono text-xs text-subtle-foreground tabular-nums">{details.timestampMs} ms</span>
              </>
            )
          }
        />
      </ul>
    </div>
  );
}

function InspectMode({ text, onText }: { text: string; onText: (text: string) => void }) {
  const { t } = useTranslation("uuid-generator");
  const details = useMemo(() => {
    try {
      return text.trim() ? inspect(text) : null;
    } catch (error) {
      if (error instanceof InspectError) return "not-an-id" as const;
      throw error;
    }
  }, [text]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="uuid-inspect-input">{t("inspect.input")}</Label>
        <Textarea
          id="uuid-inspect-input"
          value={text}
          onChange={(event) => onText(event.target.value)}
          placeholder={t("inspect.placeholder")}
          spellCheck={false}
          autoComplete="off"
          className="min-h-20 resize-none font-mono text-[13px] leading-5"
        />
      </div>
      {details === "not-an-id" ? (
        <ErrorMessage>{t("inspect.error")}</ErrorMessage>
      ) : (
        details && <DetailsCard details={details} />
      )}
    </div>
  );
}

/** Everything Generate takes; held at the Tool level so it survives a Mode switch. */
interface GenerateInputs {
  version: Version;
  countText: string;
  namespace: string;
  customNamespace: string;
  name: string;
}

function GenerateMode({ inputs, onInputs, result }: { inputs: GenerateInputs; onInputs: (inputs: GenerateInputs) => void; result: GenerateResult }) {
  const { t } = useTranslation("uuid-generator");
  const { version, countText, namespace, customNamespace, name } = inputs;
  const named = isNamedVersion(version);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label={t("generate.version")}
          value={[version]}
          onValueChange={([v]) => v && onInputs({ ...inputs, version: v as Version })}
        >
          {VERSIONS.map((v) => (
            <ToggleGroupItem key={v} value={v} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
              {v.toUpperCase()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="w-16">
          <Input
            aria-label={t("generate.count")}
            value={countText}
            onChange={(event) => onInputs({ ...inputs, countText: event.target.value })}
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            className="text-[13px]"
          />
        </div>
      </div>

      {named && (
        <div className="flex flex-wrap items-center gap-3">
          <Select value={namespace} onValueChange={(next) => next !== null && onInputs({ ...inputs, namespace: next })}>
            <SelectTrigger size="sm" aria-label={t("generate.namespace")} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {NAMED_NAMESPACES.map((ns) => (
                  <SelectItem key={ns} value={ns}>
                    {ns.toUpperCase()}
                  </SelectItem>
                ))}
                <SelectItem value="custom">{t("generate.customNamespace")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {namespace === "custom" && (
            <div className="w-72">
              <Input
                aria-label={t("generate.customNamespace")}
                value={customNamespace}
                onChange={(event) => onInputs({ ...inputs, customNamespace: event.target.value })}
                placeholder="6ba7b810-9dad-11d1-80b4-00c04fd430c8"
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-[13px]"
              />
            </div>
          )}
          <div className="w-72">
            <Input
              aria-label={t("generate.name")}
              value={name}
              onChange={(event) => onInputs({ ...inputs, name: event.target.value })}
              placeholder={t("generate.name")}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-[13px]"
            />
          </div>
          <p className="text-xs text-subtle-foreground">{t("generate.nameHint")}</p>
        </div>
      )}

      {result.error && <ErrorMessage>{t(`generate.errors.${result.error}`)}</ErrorMessage>}

      {result.ids.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>{t("generate.output")}</Label>
          <ul aria-label={t("generate.output")} className="divide-y rounded-lg border">
            {result.ids.map((id, index) => (
              <li key={`${id}-${index}`} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 font-mono text-[13px] break-all">{id}</span>
                <CopyButton value={id} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** UUID Generator: makes UUID v1/v3/v4/v5/v6/v7 and ULID, and shows what is inside a pasted one. */
export default function UuidGeneratorTool() {
  const { t } = useTranslation("uuid-generator");
  const [mode, setMode] = useState<Mode>("generate");
  const [inspectText, setInspectText] = useState("");
  const [inputs, setInputs] = useState<GenerateInputs>({ version: "v4", countText: "1", namespace: "dns", customNamespace: "", name: "" });

  // Generation is live, like every other Tool's output: it remakes the IDs whenever an Input changes.
  const result = useMemo<GenerateResult>(() => {
    const count = Math.min(Math.max(Number.parseInt(inputs.countText, 10) || 1, 1), MAX_COUNT);
    const input = isNamedVersion(inputs.version)
      ? { namespace: inputs.namespace === "custom" ? inputs.customNamespace : inputs.namespace, name: inputs.name }
      : null;
    const { value, error } = attempt(() => Array.from({ length: count }, () => generate(inputs.version, input, {})), GeneratorError);
    return { ids: value ?? [], error };
  }, [inputs]);

  // Paste Detection opens this Tool with a pasted ID: inspect it right away.
  usePaste((text) => {
    setMode("inspect");
    setInspectText(text);
  });

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup variant="outline" size="sm" aria-label={t("mode")} value={[mode]} onValueChange={([m]) => m && setMode(m as Mode)}>
        {MODES.map((m) => (
          <ToggleGroupItem key={m} value={m} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
            {t(`modes.${m}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {mode === "generate" ? <GenerateMode inputs={inputs} onInputs={setInputs} result={result} /> : <InspectMode text={inspectText} onText={setInspectText} />}
    </div>
  );
}
