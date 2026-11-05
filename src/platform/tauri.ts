import { locale } from "@tauri-apps/plugin-os";
import { LazyStore } from "@tauri-apps/plugin-store";
import type { Platform } from "./types";

export function createTauriPlatform(): Platform {
  const store = new LazyStore("preferences.json");
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
    },
    getOsLocale: () => locale(),
  };
}
