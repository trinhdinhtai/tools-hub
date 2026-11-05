import { createContext, useContext } from "react";
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
