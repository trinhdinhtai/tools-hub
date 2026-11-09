import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, CircleX } from "lucide-react";
import { ErrorMessage } from "@/components/error-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { verifyJwt } from "./crypto";
import { errorText } from "./error-text";
import { settle, useSettled } from "./use-settled";

/** The signature checked against a key the user pastes: a secret, PEM, JWK or JWKS. Never fetched (ADR-0001). */
export function Verify({ token, keyText, onKeyText }: { token: string; keyText: string; onKeyText: (text: string) => void }) {
  const { t } = useTranslation("jwt-decoder");
  const id = useId();
  const promise = useMemo(() => (keyText.trim() === "" ? null : settle(verifyJwt(token, keyText))), [token, keyText]);
  const outcome = useSettled(promise);

  return (
    <section aria-label={t("verify.title")} className="flex flex-col gap-2">
      <Label htmlFor={id}>{t("verify.key")}</Label>
      <Textarea
        id={id}
        value={keyText}
        onChange={(event) => onKeyText(event.target.value)}
        placeholder={t("verify.placeholder")}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={outcome && !outcome.ok ? true : undefined}
        className="min-h-20 resize-y font-mono text-[13px] leading-5 break-all"
      />
      {promise === null && <p className="text-xs text-muted-foreground">{t("verify.hint")}</p>}
      {outcome && !outcome.ok && <ErrorMessage>{errorText(t, outcome.error)}</ErrorMessage>}
      {outcome?.ok &&
        (outcome.value.valid ? (
          <p role="status" className="flex items-center gap-1.5 text-sm font-medium">
            <CircleCheck aria-hidden className="size-4 shrink-0" />
            {outcome.value.kid === undefined ? t("verify.valid") : t("verify.validKid", { kid: outcome.value.kid })}
          </p>
        ) : (
          <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <CircleX aria-hidden className="size-4 shrink-0" />
            {t("verify.invalid")}
          </p>
        ))}
    </section>
  );
}
