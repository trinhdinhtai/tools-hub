import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaste } from "@/lib/paste";
import { usePreference } from "@/lib/preferences";
import {
  DecodeError,
  EncodeError,
  SplitError,
  buildUrl,
  decodeText,
  encodeParam,
  encodeText,
  detectPaste,
  splitUrl,
  type EncodeErrorReason,
  type DecodeErrorReason,
  type QueryParam,
  type Scope,
  type SplitErrorReason,
  type UrlParts,
} from "./logic";
import { MODES, type Mode } from "./modes";

type Direction = "encode" | "decode";

const DIRECTIONS: Direction[] = ["encode", "decode"];
const SCOPES: Scope[] = ["full", "component"];

function convert(text: string, direction: Direction, scope: Scope): { output: string; error: EncodeErrorReason | DecodeErrorReason | null } {
  try {
    return { output: direction === "encode" ? encodeText(text, scope) : decodeText(text, scope), error: null };
  } catch (error) {
    if (error instanceof EncodeError || error instanceof DecodeError) return { output: "", error: error.reason };
    throw error;
  }
}

function ConvertMode({
  text,
  onText,
  direction,
  scope,
}: {
  text: string;
  onText: (text: string) => void;
  direction: Direction;
  scope: Scope;
}) {
  const { t } = useTranslation("url-encoder");
  const id = useId();
  const result = useMemo(() => convert(text, direction, scope), [text, direction, scope]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-2">
        {/* h-7 keeps both label rows the height of the CopyButton, so the two textareas line up. */}
        <div className="flex h-7 items-center justify-between">
          <Label htmlFor={`${id}-input`}>{t("input")}</Label>
        </div>
        <Textarea
          id={`${id}-input`}
          value={text}
          onChange={(event) => onText(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={result.error ? true : undefined}
          className="min-h-64 resize-y font-mono text-[13px] leading-5"
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex h-7 items-center justify-between">
          <Label htmlFor={`${id}-output`}>{t("output")}</Label>
          <CopyButton value={result.output} disabled={result.error !== null || result.output === ""} />
        </div>
        <Textarea
          id={`${id}-output`}
          value={result.output}
          readOnly
          spellCheck={false}
          className="min-h-64 resize-y bg-card font-mono text-[13px] leading-5 break-all"
        />
        {result.error && <ErrorMessage>{t(`errors.${result.error}`)}</ErrorMessage>}
      </div>
    </div>
  );
}

/** One editable URL part, e.g. the host or the fragment. */
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        className="font-mono text-[13px]"
      />
    </div>
  );
}

/** One editable `name=value` row of the query string. */
function ParamRow({
  index,
  param,
  onName,
  onValue,
  onRemove,
}: {
  index: number;
  param: QueryParam;
  onName: (name: string) => void;
  onValue: (value: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("url-encoder");
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={`${t("parts.name")} ${index + 1}`}
        value={param.name}
        onChange={(event) => onName(event.target.value)}
        placeholder={t("parts.name")}
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 font-mono text-[13px]"
      />
      <Input
        aria-label={`${t("parts.value")} ${index + 1}`}
        value={param.value}
        onChange={(event) => onValue(event.target.value)}
        placeholder={t("parts.value")}
        spellCheck={false}
        autoComplete="off"
        className="min-w-0 flex-1 font-mono text-[13px]"
      />
      <Button type="button" variant="outline" size="sm" aria-label={t("parts.remove")} onClick={onRemove}>
        <X aria-hidden />
      </Button>
    </div>
  );
}

/** Parses the Input into parts; a non-empty invalid Input gives the reason, an empty one gives nothing. */
function parseUrl(text: string): { parts: UrlParts | null; reason: SplitErrorReason | null } {
  const trimmed = text.trim();
  if (trimmed === "") return { parts: null, reason: null };
  try {
    return { parts: splitUrl(trimmed), reason: null };
  } catch (error) {
    if (error instanceof SplitError) return { parts: null, reason: error.reason };
    throw error;
  }
}

/** Split: a URL taken apart into editable parts, reassembled into the Output. Part edits keep the Input as written. */
function SplitMode({ text, onText }: { text: string; onText: (text: string) => void }) {
  const { t } = useTranslation("url-encoder");
  const id = useId();
  const [prevText, setPrevText] = useState(text);
  const [parsed, setParsed] = useState<{ parts: UrlParts | null; reason: SplitErrorReason | null }>(() => parseUrl(text));
  // The Input is the source: retyping or pasting it re-parses the parts (React's derive-state-during-render pattern).
  if (prevText !== text) {
    setPrevText(text);
    setParsed(parseUrl(text));
  }
  const { parts, reason } = parsed;

  const edit = (patch: Partial<UrlParts>) => void setParsed(({ parts, reason }) => ({ parts: parts ? { ...parts, ...patch } : parts, reason }));
  const editParam = (index: number, patch: { name?: string; value?: string }) =>
    void setParsed(({ parts, reason }) => ({
      parts: parts
        ? {
            ...parts,
            params: parts.params.map((param, i) => {
              if (i !== index) return param;
              const name = patch.name ?? param.name;
              const value = patch.value ?? param.value;
              return { name, value, raw: encodeParam(name, value) };
            }),
          }
        : parts,
      reason,
    }));

  const output = parts ? buildUrl(parts) : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-input`}>{t("input")}</Label>
        <Textarea
          id={`${id}-input`}
          value={text}
          onChange={(event) => onText(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={reason ? true : undefined}
          className="min-h-20 resize-y font-mono text-[13px] leading-5"
        />
      </div>

      {reason && <ErrorMessage>{t(`errors.${reason}`)}</ErrorMessage>}

      {parts && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t("parts.scheme")} value={parts.scheme} onChange={(scheme) => edit({ scheme })} />
            <Field label={t("parts.host")} value={parts.host} onChange={(host) => edit({ host })} />
            <Field label={t("parts.port")} value={parts.port} onChange={(port) => edit({ port })} />
            <Field label={t("parts.path")} value={parts.path} onChange={(path) => edit({ path })} />
            <Field label={t("parts.fragment")} value={parts.fragment} onChange={(fragment) => edit({ fragment })} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("parts.params")}</Label>
            {parts.params.map((param, index) => (
              <ParamRow
                key={index}
                index={index}
                param={param}
                onName={(name) => editParam(index, { name })}
                onValue={(value) => editParam(index, { value })}
                onRemove={() => edit({ params: parts.params.filter((_, i) => i !== index) })}
              />
            ))}
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => edit({ params: [...parts.params, { name: "", value: "", raw: "" }] })}>
              <Plus aria-hidden />
              {t("parts.add")}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex h-7 items-center justify-between">
              <Label htmlFor={`${id}-output`}>{t("output")}</Label>
              <CopyButton value={output} disabled={output === ""} />
            </div>
            <Textarea
              id={`${id}-output`}
              value={output}
              readOnly
              spellCheck={false}
              className="min-h-20 resize-y bg-card font-mono text-[13px] leading-5 break-all"
            />
          </div>
        </>
      )}
    </div>
  );
}

/** URL Encoder: percent-encode and decode whole URLs or components, and split a URL into editable parts. Input stays in memory. */
export default function UrlEncoderTool() {
  const { t } = useTranslation("url-encoder");
  const [mode, setMode] = useState<Mode>("convert");
  const [direction, setDirection] = useState<Direction>("encode");
  const [storedScope, setScope] = usePreference<Scope>("scope");
  const scope = SCOPES.includes(storedScope) ? storedScope : "full";
  const [text, setText] = useState("");

  // A pasted URL is there to be taken apart; anything else is there to be decoded.
  usePaste((pasted) => {
    setText(pasted);
    if (detectPaste(pasted) > 0) setMode("split");
    else {
      setMode("convert");
      setDirection("decode");
    }
  });

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
        {mode === "convert" && (
          <>
            {/* Single choice: Base UI ToggleGroup values are arrays; pressing the active item again keeps it. */}
            <ToggleGroup
              variant="outline"
              size="sm"
              aria-label={t("direction.label")}
              value={[direction]}
              onValueChange={([value]) => value && setDirection(value as Direction)}
            >
              {DIRECTIONS.map((d) => (
                <ToggleGroupItem key={d} value={d} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
                  {t(`direction.${d}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              variant="outline"
              size="sm"
              aria-label={t("scope.label")}
              value={[scope]}
              onValueChange={([value]) => value && setScope(value as Scope)}
            >
              {SCOPES.map((s) => (
                <ToggleGroupItem key={s} value={s} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
                  {t(`scope.${s}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        )}
      </div>

      {mode === "convert" ? <ConvertMode text={text} onText={setText} direction={direction} scope={scope} /> : <SplitMode text={text} onText={setText} />}
    </div>
  );
}
