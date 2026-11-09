import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { json } from "@codemirror/lang-json";
import { CircleAlert, CircleCheck, CircleX, Clock, type LucideIcon } from "lucide-react";
import { CodeEditor } from "@/components/code-editor";
import { CopyButton } from "@/components/copy-button";
import { ErrorMessage } from "@/components/error-message";
import { ResultRow } from "@/components/result-row";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePaste } from "@/lib/paste";
import { formatRelative } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { decodeJwt, JwtError, timeClaims, tokenStatus, type DecodedJwt, type TimeClaimValue, type TokenStatus } from "./logic";
import { MODES, type Mode } from "./modes";
import { samplePayload, SignMode, type SignInput } from "./SignMode";
import { Verify } from "./Verify";

const JSON_LANGUAGE = json();

/**
 * JWT Decoder: a token's header, payload and times, whether it works now and whether its signature checks out; or a
 * test token signed with the user's key. Tokens, payloads and keys are Input: they stay in memory (ADR-0004).
 */
export default function JwtDecoderTool() {
  const { t, i18n } = useTranslation("jwt-decoder");
  const inputId = useId();
  const [mode, setMode] = useState<Mode>("decode");
  const [text, setText] = useState("");
  const [verifyKey, setVerifyKey] = useState("");
  const [sign, setSign] = useState<SignInput>(() => ({ alg: "HS256", payload: samplePayload(Date.now()), key: "" }));
  // `now` is read when the Input changes, then every second, so the status turns as the token expires.
  const [now, setNow] = useState(() => Date.now());
  const edit = (next: string) => {
    setText(next);
    setNow(Date.now());
  };
  const decode = (token: string) => {
    setMode("decode");
    edit(token);
  };
  usePaste((pasted) => decode(pasted.trim()));

  const { decoded, error } = useMemo(() => {
    if (text.trim() === "") return { decoded: null, error: null };
    try {
      return { decoded: decodeJwt(text), error: null };
    } catch (error) {
      if (error instanceof JwtError) return { decoded: null, error };
      throw error;
    }
  }, [text]);
  const ticking = mode === "decode" && decoded !== null;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const modes = (
    <div>
      <ToggleGroup variant="outline" size="sm" aria-label={t("mode")} value={[mode]} onValueChange={([value]) => value && setMode(value as Mode)}>
        {MODES.map((m) => (
          <ToggleGroupItem key={m} value={m} className="px-3 text-subtle-foreground aria-pressed:text-foreground">
            {t(`modes.${m}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

  if (mode === "sign") {
    return (
      <div className="flex flex-col gap-4">
        {modes}
        <SignMode input={sign} onInput={setSign} onDecode={decode} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {modes}
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>{t("input")}</Label>
        <Textarea
          id={inputId}
          value={text}
          onChange={(event) => edit(event.target.value)}
          placeholder={t("placeholder")}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          className="min-h-24 resize-y font-mono text-[13px] leading-5 break-all"
        />
        {error && <ErrorMessage>{t(`errors.${error.reason}`, { part: error.part && t(`parts.${error.part}`) })}</ErrorMessage>}
      </div>
      {decoded && (
        <>
          <Decoded decoded={decoded} now={now} locale={i18n.language} keyPasted={verifyKey.trim() !== ""} />
          <Verify token={text} keyText={verifyKey} onKeyText={setVerifyKey} />
        </>
      )}
    </div>
  );
}

/** `keyPasted`: a key is pasted below to check the signature, whose outcome shows there instead of "decoded only". */
function Decoded({ decoded, now, locale, keyPasted }: { decoded: DecodedJwt; now: number; locale: string; keyPasted: boolean }) {
  const { t } = useTranslation("jwt-decoder");
  const header = JSON.stringify(decoded.header, null, 2);
  const payload = JSON.stringify(decoded.payload, null, 2);
  const claims = timeClaims(decoded.payload);
  return (
    <>
      <Status status={tokenStatus(decoded.payload, now)} now={now} locale={locale} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Part label={t("header")} value={header} />
        <Part label={t("payload")} value={payload} />
      </div>
      {claims.length > 0 && (
        <section aria-label={t("claims.title")} className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t("claims.title")}</h3>
          <div className="grid gap-4 lg:grid-cols-3">
            {claims.map((claim) => (
              <ClaimRow key={claim.claim} claim={claim} now={now} locale={locale} />
            ))}
          </div>
        </section>
      )}
      <ResultRow
        label={t("signature")}
        value={decoded.signature === "" ? null : decoded.signature}
        note={decoded.signature === "" ? t("unsigned") : keyPasted ? undefined : t("notVerified")}
        multiline
      />
    </>
  );
}

/** The header or payload as indented JSON, read-only, with its copy button. */
function Part({ label, value }: { label: string; value: string }) {
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-2">
      <div className="flex h-7 items-center justify-between gap-2">
        {/* The editor is named by its own label; this heading is for sight. */}
        <Label aria-hidden>{label}</Label>
        <CopyButton value={value} />
      </div>
      <CodeEditor label={label} value={value} readOnly language={JSON_LANGUAGE} className="max-h-96 min-h-24 bg-card" />
    </section>
  );
}

/** How each status shows: its icon, and whether the token can be used (an unusable one shows as an error). */
const STATUS_LOOK: Record<TokenStatus["state"], { icon: LucideIcon; usable: boolean }> = {
  active: { icon: CircleCheck, usable: true },
  "no-expiry": { icon: CircleCheck, usable: true },
  expired: { icon: CircleX, usable: false },
  "not-yet-valid": { icon: Clock, usable: false },
  invalid: { icon: CircleAlert, usable: false },
};

/** Whether the token works now, and how long until or since that changes. */
function Status({ status, now, locale }: { status: TokenStatus; now: number; locale: string }) {
  const { t } = useTranslation("jwt-decoder");
  const { icon: Icon, usable } = STATUS_LOOK[status.state];
  const text =
    status.state === "invalid"
      ? t("status.invalid", { claim: status.claim })
      : status.state === "no-expiry"
        ? t("status.no-expiry")
        : t(`status.${status.state}`, { relative: formatRelative(status.at, now, locale) });
  return (
    <p className={cn("flex items-center gap-1.5 text-sm font-medium", !usable && "text-destructive")}>
      <Icon aria-hidden className="size-4 shrink-0" />
      {text}
    </p>
  );
}

/** A time claim as ISO 8601 in UTC, spelled out in this computer's zone and from now; as written if it is no date. */
function ClaimRow({ claim, now, locale }: { claim: TimeClaimValue; now: number; locale: string }) {
  const { t } = useTranslation("jwt-decoder");
  if (claim.ms === null) {
    return <ResultRow label={t(`claims.${claim.claim}`)} value={JSON.stringify(claim.value)} note={t("claims.notDate")} />;
  }
  const spelled = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "long" }).format(claim.ms);
  return <ResultRow label={t(`claims.${claim.claim}`)} value={new Date(claim.ms).toISOString()} note={`${spelled} · ${formatRelative(claim.ms, now, locale)}`} />;
}
