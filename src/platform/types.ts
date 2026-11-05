/**
 * Everything that touches Tauri or the OS goes through this interface.
 * Only the Platform writes to disk (ADR-0004).
 */
export interface Platform {
  store: PlatformStore;
  /** BCP-47 tag of the OS language, e.g. "vi-VN", or null if unknown. */
  getOsLocale(): Promise<string | null>;
  /** The OS light/dark setting, live. */
  systemTheme: SystemTheme;
}

/** Persistent key-value store for Preference and Recent data. Never Input. */
export interface PlatformStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  /** Absolute path of the file the store is saved to, shown to the user. */
  path(): Promise<string>;
}

export type ColorScheme = "light" | "dark";

export interface SystemTheme {
  get(): ColorScheme;
  /** Calls the listener whenever the OS theme changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
