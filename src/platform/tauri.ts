import { appDataDir, join } from "@tauri-apps/api/path";
import { locale, platform } from "@tauri-apps/plugin-os";
import { LazyStore } from "@tauri-apps/plugin-store";
import { mediaQuerySystemTheme } from "./system-theme";
import type { Platform } from "./types";

/** tauri-plugin-store resolves a relative path against the app data directory. */
const STORE_FILE = "preferences.json";

export function createTauriPlatform(): Platform {
  const store = new LazyStore(STORE_FILE);
  return {
    store: {
      get: (key) => store.get(key),
      async set(key, value) {
        await store.set(key, value);
        await store.save();
      },
      async delete(key) {
        await store.delete(key);
        await store.save();
      },
      keys: () => store.keys(),
      path: async () => join(await appDataDir(), STORE_FILE),
    },
    getOsLocale: () => locale(),
    systemTheme: mediaQuerySystemTheme(),
    isMac: platform() === "macos",
  };
}
