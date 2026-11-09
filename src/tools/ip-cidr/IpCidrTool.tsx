import { useDeferredValue, useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaste } from "@/lib/paste";
import {
  CidrError,
  compareNetworks,
  describeNetwork,
  mergeNetworks,
  parseNetwork,
  splitNetwork,
  SPLIT_LIMIT,
  type Network,
} from "./logic";
import { MODES, type Mode } from "./modes";

/** Runs a calculation on the Input: its result, the CidrError that stopped it, or neither while the Input is empty. */
function attempt<T>(text: string, run: () => T): { value: T | null; error: CidrError | null } {
  if (text.trim() === "") return { value: null, error: null };
  try {
    return { value: run(), error: null };
  } catch (error) {
    if (error instanceof CidrError) return { value: null, error };
    throw error;
  }
}

/** The error in the interface language, naming the line when it came from a list. */
function errorText(t: TFunction<"ip-cidr">, error: CidrError): string {
  const message = t(`errors.${error.reason}`);
  return error.line === undefined ? message : t("lineError", { line: error.line, message });
}

/** One labelled, read-only result with its copy button; `value` null shows a dash and nothing to copy. */
function ResultRow({ label, value }: { label: string; value: string | null }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* h-7 keeps the label row the height of the CopyButton, so the fields line up. */}
      <div className="flex h-7 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <CopyButton value={value ?? ""} disabled={value === null} />
      </div>
      <Input id={id} value={value ?? "—"} readOnly spellCheck={false} className="bg-card font-mono text-[13px]" />
    </div>
  );
}

/** A labelled single-line field for a network, with an optional control at the end of the label row. */
function NetworkInput({ label, value, onChange, trailing }: { label: string; value: string; onChange: (text: string) => void; trailing?: ReactNode }) {
  const { t } = useTranslation("ip-cidr");
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex h-7 items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {trailing}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("placeholder")}
        spellCheck={false}
        autoComplete="off"
        className="font-mono text-[13px]"
      />
    </div>
  );
}

/** IP / CIDR Calculator: a network in detail, split, merged or compared as it is typed. Input stays in memory. */
export default function IpCidrTool() {
  const { t } = useTranslation("ip-cidr");
  const [mode, setMode] = useState<Mode>("calculate");
  const [text, setText] = useState("");

  usePaste((pasted) => {
    setMode("calculate");
    setText(pasted.trim());
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Single choice: Base UI ToggleGroup values are arrays; pressing the active item again keeps it. */}
      <ToggleGroup variant="outline" size="sm" aria-label={t("mode")} value={[mode]} onValueChange={([value]) => value && setMode(value as Mode)}>
        {MODES.map((m) => (
          <ToggleGroupItem key={m} value={m} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
            {t(`modes.${m}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {mode === "calculate" ? (
        <CalculateMode text={text} onChange={setText} />
      ) : mode === "split" ? (
        <SplitMode />
      ) : mode === "merge" ? (
        <MergeMode />
      ) : (
        <CompareMode />
      )}
    </div>
  );
}

function CalculateMode({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const { t } = useTranslation("ip-cidr");
  const { value: details, error } = useMemo(() => attempt(text, () => describeNetwork(parseNetwork(text))), [text]);
  // IPv6 has no broadcast and every address is a host: name the range by its addresses instead.
  const v6 = details?.version === 6;
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xl">
        <NetworkInput label={t("input")} value={text} onChange={onChange} />
      </div>
      {error && <ErrorMessage>{errorText(t, error)}</ErrorMessage>}
      {details && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultRow label={t("fields.cidr")} value={details.cidr} />
          <ResultRow label={t("fields.type")} value={t(`types.${details.type}`)} />
          <ResultRow label={t("fields.network")} value={details.network} />
          {!v6 && <ResultRow label={t("fields.broadcast")} value={details.broadcast} />}
          <ResultRow label={t(v6 ? "fields.firstAddress" : "fields.firstHost")} value={details.firstHost} />
          <ResultRow label={t(v6 ? "fields.lastAddress" : "fields.lastHost")} value={details.lastHost} />
          {!v6 && <ResultRow label={t("fields.hostCount")} value={details.hostCount.toString()} />}
          <ResultRow label={t("fields.addressCount")} value={details.addressCount.toString()} />
          <ResultRow label={t("fields.mask")} value={details.mask} />
          <ResultRow label={t("fields.wildcard")} value={details.wildcard} />
        </div>
      )}
    </div>
  );
}

/** The prefix the split uses: the one picked if the network allows it, else one bit longer than the network's own. */
function splitPrefix(network: Network, picked: number | null): number {
  const bits = network.version === 4 ? 32 : 128;
  if (picked !== null && picked >= network.prefix && picked <= bits) return picked;
  return Math.min(network.prefix + 1, bits);
}

function SplitMode() {
  const { t } = useTranslation("ip-cidr");
  const id = useId();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const parsed = useMemo(() => attempt(text, () => parseNetwork(text)), [text]);
  const network = parsed.value;
  const prefix = network ? splitPrefix(network, picked) : null;
  const split = useMemo(() => (network && prefix !== null ? splitNetwork(network, prefix) : null), [network, prefix]);
  const listed = split?.subnets.join("\n") ?? "";

  const prefixSelect = network && prefix !== null && (
    <Select value={String(prefix)} onValueChange={(next) => next !== null && setPicked(Number(next))}>
      <SelectTrigger size="sm" aria-label={t("split.prefix")} className="w-20">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {Array.from({ length: (network.version === 4 ? 32 : 128) - network.prefix + 1 }, (_, i) => network.prefix + i).map((p) => (
            <SelectItem key={p} value={String(p)}>
              /{p}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xl">
        <NetworkInput label={t("input")} value={text} onChange={setText} trailing={prefixSelect} />
      </div>
      {parsed.error && <ErrorMessage>{errorText(t, parsed.error)}</ErrorMessage>}
      {split && (
        <div className="flex flex-col gap-2">
          <div className="flex h-7 items-center justify-between gap-2">
            <Label htmlFor={id}>{t("split.subnets")}</Label>
            <CopyButton value={listed} />
          </div>
          <Textarea id={id} value={listed} readOnly spellCheck={false} className="min-h-64 resize-y bg-card font-mono text-[13px] leading-5" />
          <p className="text-xs text-muted-foreground">
            {split.count > BigInt(SPLIT_LIMIT)
              ? t("split.truncated", { shown: SPLIT_LIMIT, total: split.count.toString() })
              : t("split.count", { total: split.count.toString(), prefix })}
          </p>
        </div>
      )}
    </div>
  );
}

function MergeMode() {
  const { t } = useTranslation("ip-cidr");
  const id = useId();
  const [text, setText] = useState("");
  // Typing stays responsive on a long list: the merge catches up when React has time.
  const deferred = useDeferredValue(text);
  const { value: merged, error } = useMemo(() => attempt(deferred, () => mergeNetworks(deferred)), [deferred]);
  const entries = useMemo(() => deferred.split(/[\n,]/).filter((item) => item.trim() !== "").length, [deferred]);
  const output = merged?.join("\n") ?? "";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${id}-input`}>{t("input")}</Label>
        <Textarea
          id={`${id}-input`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("mergePlaceholder")}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className="min-h-64 resize-y font-mono text-[13px] leading-5"
        />
        {error && <ErrorMessage>{errorText(t, error)}</ErrorMessage>}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex h-7 items-center justify-between gap-2">
          <Label htmlFor={`${id}-output`}>{t("merge.result")}</Label>
          <CopyButton value={output} disabled={!merged} />
        </div>
        <Textarea id={`${id}-output`} value={output} readOnly spellCheck={false} className="min-h-64 resize-y bg-card font-mono text-[13px] leading-5" />
        {merged && <p className="text-xs text-muted-foreground">{t("merge.count", { from: entries, to: merged.length })}</p>}
      </div>
    </div>
  );
}

function CompareMode() {
  const { t } = useTranslation("ip-cidr");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const first = useMemo(() => attempt(a, () => parseNetwork(a)), [a]);
  const second = useMemo(() => attempt(b, () => parseNetwork(b)), [b]);
  let sentence: string | null = null;
  let mixed: CidrError | null = null;
  if (first.value && second.value) {
    const cidr = (network: Network) => describeNetwork(network).cidr;
    try {
      const relation = compareNetworks(first.value, second.value);
      sentence = t(`compare.${relation}`, { a: cidr(first.value), b: cidr(second.value) });
    } catch (error) {
      if (!(error instanceof CidrError)) throw error;
      mixed = error;
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <NetworkInput label={t("compare.a")} value={a} onChange={setA} />
        <NetworkInput label={t("compare.b")} value={b} onChange={setB} />
      </div>
      {first.error && <ErrorMessage>{`${t("compare.a")}: ${errorText(t, first.error)}`}</ErrorMessage>}
      {second.error && <ErrorMessage>{`${t("compare.b")}: ${errorText(t, second.error)}`}</ErrorMessage>}
      {mixed && <ErrorMessage>{errorText(t, mixed)}</ErrorMessage>}
      {sentence && (
        <div className="max-w-xl">
          <ResultRow label={t("compare.result")} value={sentence} />
        </div>
      )}
    </div>
  );
}
