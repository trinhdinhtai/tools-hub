/**
 * Everything that touches Tauri or the OS goes through this interface.
 * Only the Platform writes to disk (ADR-0004).
 */
export interface Platform {
  store: PlatformStore;
  /** BCP-47 tag of the OS language, e.g. "vi-VN", or null if unknown. */
  getOsLocale(): Promise<string | null>;
}

/** Persistent key-value store for Preference and Recent data. Never Input. */
export interface PlatformStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}
