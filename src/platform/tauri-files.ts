import { invoke } from "@tauri-apps/api/core";
import type { PlatformFiles } from "./types";

/**
 * Files through the `save_file` command in `src-tauri/src/lib.rs`, which shows the save dialog and writes the file.
 * The bytes go as the raw request body, not JSON, so a file of hundreds of MB is not inflated on the way.
 */
export function createTauriFiles(): PlatformFiles {
  return {
    save: (name, bytes) => invoke<boolean>("save_file", bytes, { headers: { "x-file-name": encodeURIComponent(name) } }),
  };
}
