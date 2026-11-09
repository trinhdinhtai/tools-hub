import type { TFunction } from "i18next";
import { JwsError } from "./crypto";

/** What went wrong verifying or signing, in the interface language. */
export function errorText(t: TFunction<"jwt-decoder">, error: unknown): string {
  if (error instanceof JwsError) return t(`jws.${error.reason}`, { detail: error.detail });
  return t("jws.failed", { message: error instanceof Error ? error.message : String(error) });
}
