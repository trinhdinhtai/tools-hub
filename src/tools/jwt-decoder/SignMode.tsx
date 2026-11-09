import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { json } from "@codemirror/lang-json";
import { CodeEditor } from "@/components/code-editor";
import { ErrorMessage } from "@/components/error-message";
import { ResultRow } from "@/components/result-row";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ALGORITHMS, JwsError, signJwt, type Algorithm } from "./crypto";
import { errorText } from "./error-text";
import { settle, useSettled } from "./use-settled";

const JSON_LANGUAGE = json();

/** What the Sign Mode is given. Input: it lives in the Tool's memory only, like the token. */
export interface SignInput {
  alg: Algorithm;
  payload: string;
  key: string;
}

/** A payload to start from: a subject, a name, and issued now. */
export function samplePayload(now: number): string {
  return JSON.stringify({ sub: "1234567890", name: "Dev", iat: Math.floor(now / 1000) }, null, 2);
}

/** Whether signing failed on the payload rather than the key: only then is the payload editor marked invalid. */
const isPayloadError = (error: unknown) => error instanceof JwsError && error.reason.startsWith("payload-");

/** Sign Mode: a test token from a payload, an alg and the user's own key. */
export function SignMode({ input, onInput, onDecode }: { input: SignInput; onInput: (input: SignInput) => void; onDecode: (token: string) => void }) {
  const { t } = useTranslation("jwt-decoder");
  const keyId = useId();
  const secret = input.alg.startsWith("HS");
  const promise = useMemo(
    () => (input.key.trim() === "" ? null : settle(signJwt(input.alg, input.payload, input.key))),
    [input.alg, input.payload, input.key],
  );
  const outcome = useSettled(promise);
  const token = outcome?.ok ? outcome.value : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex h-7 items-center">
            <Label aria-hidden>{t("sign.payload")}</Label>
          </div>
          <CodeEditor
            label={t("sign.payload")}
            value={input.payload}
            onChange={(payload) => onInput({ ...input, payload })}
            language={JSON_LANGUAGE}
            invalid={outcome !== null && !outcome.ok && isPayloadError(outcome.error)}
            className="h-56"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex h-7 items-center justify-between gap-2">
            <Label htmlFor={keyId}>{secret ? t("sign.secret") : t("sign.privateKey")}</Label>
            <Select value={input.alg} onValueChange={(alg) => alg !== null && onInput({ ...input, alg: alg as Algorithm })}>
              <SelectTrigger size="sm" aria-label={t("sign.alg")} className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {ALGORITHMS.map((alg) => (
                    <SelectItem key={alg} value={alg}>
                      {alg}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            id={keyId}
            value={input.key}
            onChange={(event) => onInput({ ...input, key: event.target.value })}
            placeholder={secret ? t("sign.secretPlaceholder") : t("sign.privateKeyPlaceholder")}
            spellCheck={false}
            autoComplete="off"
            className="h-56 resize-none font-mono text-[13px] leading-5 break-all"
          />
        </div>
      </div>
      {promise === null && <p className="text-xs text-muted-foreground">{t("sign.hint")}</p>}
      {outcome && !outcome.ok && <ErrorMessage>{errorText(t, outcome.error)}</ErrorMessage>}
      {token && (
        <ResultRow
          label={t("sign.token")}
          value={token}
          multiline
          action={
            <Button variant="ghost" size="sm" onClick={() => onDecode(token)}>
              {t("sign.decode")}
            </Button>
          }
        />
      )}
    </div>
  );
}
