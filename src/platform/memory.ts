import { mediaQuerySystemTheme } from "./system-theme";
import type { ColorScheme, Platform, SystemTheme } from "./types";

export interface MemoryPlatform extends Platform {
  /** Snapshot of everything written to the store, for assertions in tests. */
  dump(): Record<string, unknown>;
  /** Simulates the user switching the OS theme. */
  setSystemTheme(scheme: ColorScheme): void;
}

export const MEMORY_STORE_PATH = "(in memory, not saved)";

function fixedSystemTheme(initial: ColorScheme): SystemTheme & { set(scheme: ColorScheme): void } {
  let scheme = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => scheme,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      scheme = next;
      listeners.forEach((listener) => listener());
    },
  };
}

/**
 * In-memory Platform for tests and for running the app in a plain browser.
 * With `systemTheme` given, the OS theme is simulated; otherwise the browser's is used.
 */
export function createMemoryPlatform(options: { osLocale?: string | null; systemTheme?: ColorScheme } = {}): MemoryPlatform {
  const data = new Map<string, unknown>();
  const simulated = fixedSystemTheme(options.systemTheme ?? "light");
  const useBrowserTheme = options.systemTheme === undefined && typeof window.matchMedia === "function";
  return {
    store: {
      async get<T>(key: string) {
        return structuredClone(data.get(key)) as T | undefined;
      },
      async set(key, value) {
        data.set(key, structuredClone(value));
      },
      async delete(key) {
        data.delete(key);
      },
      async keys() {
        return [...data.keys()];
      },
      async path() {
        return MEMORY_STORE_PATH;
      },
    },
    async getOsLocale() {
      return options.osLocale === undefined ? (navigator.language ?? null) : options.osLocale;
    },
    systemTheme: useBrowserTheme ? mediaQuerySystemTheme() : simulated,
    dump() {
      return Object.fromEntries(data);
    },
    setSystemTheme: simulated.set,
  };
}
