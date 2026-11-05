import type { Platform } from "./types";

export interface MemoryPlatform extends Platform {
  /** Snapshot of everything written to the store, for assertions in tests. */
  dump(): Record<string, unknown>;
}

/** In-memory Platform for tests and for running the app in a plain browser. */
export function createMemoryPlatform(options: { osLocale?: string | null } = {}): MemoryPlatform {
  const data = new Map<string, unknown>();
  return {
    store: {
      async get<T>(key: string) {
        return data.get(key) as T | undefined;
      },
      async set(key, value) {
        data.set(key, structuredClone(value));
      },
      async delete(key) {
        data.delete(key);
      },
    },
    async getOsLocale() {
      return options.osLocale === undefined ? (navigator.language ?? null) : options.osLocale;
    },
    dump() {
      return Object.fromEntries(data);
    },
  };
}
