import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import type { PlatformFiles } from "@/platform/types";

/** The Platform's files, provided by the app shell. */
export const FilesContext = createContext<PlatformFiles | null>(null);

/**
 * How a Tool saves a result as a file: `save(name, bytes)` shows the OS save dialog, suggesting `name`, and resolves
 * false if the user cancels. Only ever call it on the user's request (ADR-0004).
 */
export function useSaveFile(): PlatformFiles["save"] {
  const files = useContext(FilesContext);
  if (!files) throw new Error("useSaveFile is used outside a FilesContext provider");
  return files.save;
}

/** A function that renders a byte count in the interface language, e.g. "1.5 megabytes". */
export function useFormatSize() {
  const { i18n } = useTranslation();
  return (bytes: number) => {
    const [value, unit] =
      bytes >= 1e9 ? [bytes / 1e9, "gigabyte"] : bytes >= 1e6 ? [bytes / 1e6, "megabyte"] : bytes >= 1e3 ? [bytes / 1e3, "kilobyte"] : [bytes, "byte"];
    return new Intl.NumberFormat(i18n.language, { style: "unit", unit, maximumFractionDigits: 1 }).format(value);
  };
}
