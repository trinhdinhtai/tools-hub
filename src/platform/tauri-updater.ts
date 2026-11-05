import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import type { AvailableUpdate, Updater } from "./types";

/**
 * The updater through the Rust commands in `src-tauri/src/lib.rs`. The webview never reaches the network itself: the
 * check, the download and the signature check all run in Rust (ADR-0001).
 */
export function createTauriUpdater(): Updater {
  return {
    currentVersion: () => getVersion(),
    check: () => invoke<AvailableUpdate | null>("check_update"),
    install: () => invoke("install_update"),
  };
}
