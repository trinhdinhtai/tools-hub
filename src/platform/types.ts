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
  /** Whether the OS is macOS, where shortcuts use Cmd rather than Ctrl. */
  isMac: boolean;
  /** The window, the tray, the global hotkey and launching with the OS. */
  desktop: Desktop;
  /** Checking for, and installing, a new version: the only network access the app makes (ADR-0001). */
  updater: Updater;
}

/**
 * Updates run in the Rust shell, never in the webview, and only when the user asks: nothing here is called at
 * startup or in the background (ADR-0001).
 */
export interface Updater {
  /** The version of the app that is running, e.g. "0.1.0". */
  currentVersion(): Promise<string>;
  /** Asks the release server for a newer version; null when the app is up to date. Rejects if the check fails. */
  check(): Promise<AvailableUpdate | null>;
  /**
   * Downloads and installs the update the last `check` found, then restarts the app. Rejects, installing nothing, if
   * the download fails or its signature does not match the app's update key.
   */
  install(): Promise<void>;
}

export interface AvailableUpdate {
  version: string;
  /** The changelog, as written in the release notes; null if the release has none. */
  notes: string | null;
}

/** What the app asks of the desktop. The tray, single instance and hiding on close live in the Tauri shell. */
export interface Desktop {
  /**
   * Makes `accelerator` (e.g. "Ctrl+Alt+Space") the global hotkey, replacing the current one. A press brings the
   * window to the front, then calls `onPressed`. Rejects, keeping the current hotkey, if the OS refuses the
   * combination (another app has it, or it cannot be a hotkey).
   */
  setGlobalHotkey(accelerator: string, onPressed: () => void): Promise<void>;
  /** Whether the window's close button quits the app, rather than hiding it to the tray. */
  setQuitOnClose(quit: boolean): Promise<void>;
  /** Whether the app starts, hidden in the tray, when the user logs in to the OS. */
  setAutostart(enabled: boolean): Promise<void>;
  /** The tray menu's labels, in the interface language. */
  setTrayLabels(labels: TrayLabels): Promise<void>;
}

export interface TrayLabels {
  open: string;
  quit: string;
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
