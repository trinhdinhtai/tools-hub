import { mediaQuerySystemTheme } from "./system-theme";
import type {
  AvailableUpdate,
  ColorScheme,
  Desktop,
  Platform,
  PlatformFiles,
  SystemTheme,
  TrayLabels,
  Updater,
} from "./types";

export interface MemoryPlatform extends Platform {
  /** Snapshot of everything written to the store, for assertions in tests. */
  dump(): Record<string, unknown>;
  /** Simulates the user switching the OS theme. */
  setSystemTheme(scheme: ColorScheme): void;
  /** What the app last asked of the desktop. */
  desktopState(): DesktopState;
  /** Simulates the user pressing the global hotkey from another app. */
  pressGlobalHotkey(): void;
  /** How often the app asked for an update, and which version it installed. */
  updaterState(): UpdaterState;
  /** The files the user saved, in order. */
  savedFiles(): SavedFile[];
  /** What the user does in the next save dialogs: pick a file (the default) or cancel. */
  setSaveDialog(answer: "save" | "cancel"): void;
}

export interface SavedFile {
  name: string;
  bytes: Uint8Array;
}

/** A save dialog the user answers at once, picking the suggested name, with the files kept in memory. */
function memoryFiles(): PlatformFiles & { saved: SavedFile[]; answer: "save" | "cancel" } {
  const files = {
    saved: [] as SavedFile[],
    answer: "save" as "save" | "cancel",
    async save(name: string, bytes: Uint8Array) {
      if (files.answer === "cancel") return false;
      files.saved.push({ name, bytes: bytes.slice() });
      return true;
    },
  };
  return files;
}

export interface UpdaterState {
  checks: number;
  installed: string | null;
}

export interface MemoryUpdaterOptions {
  appVersion?: string;
  /** What the release server offers; null (the default) when the app is up to date. */
  update?: AvailableUpdate | null;
  /** Makes the check fail with this message, as when offline. */
  checkError?: string;
  /** Makes the install fail with this message, as when the update's signature does not match. */
  installError?: string;
}

/** An updater that answers from `options` and never touches the network. */
function memoryUpdater(options: MemoryUpdaterOptions): Updater & { state: UpdaterState } {
  const state: UpdaterState = { checks: 0, installed: null };
  let found: AvailableUpdate | null = null;
  return {
    state,
    async currentVersion() {
      return options.appVersion ?? "0.0.0";
    },
    async check() {
      state.checks += 1;
      if (options.checkError) throw new Error(options.checkError);
      found = options.update ?? null;
      return found && { ...found };
    },
    async install() {
      if (!found) throw new Error("No update to install");
      if (options.installError) throw new Error(options.installError);
      state.installed = found.version;
    },
  };
}

export interface DesktopState {
  globalHotkey: string | null;
  quitOnClose: boolean;
  autostart: boolean;
  trayLabels: TrayLabels | null;
}

/** A desktop that remembers what it was asked; `takenHotkeys` are combinations another app already holds. */
function memoryDesktop(takenHotkeys: readonly string[]): Desktop & { state: DesktopState; press(): void } {
  const state: DesktopState = { globalHotkey: null, quitOnClose: false, autostart: false, trayLabels: null };
  let onPressed: (() => void) | null = null;
  return {
    state,
    press: () => onPressed?.(),
    async setGlobalHotkey(accelerator, listener) {
      if (takenHotkeys.includes(accelerator)) throw new Error(`${accelerator} is taken`);
      state.globalHotkey = accelerator;
      onPressed = listener;
    },
    async setQuitOnClose(quit) {
      state.quitOnClose = quit;
    },
    async setAutostart(enabled) {
      state.autostart = enabled;
    },
    async setTrayLabels(labels) {
      state.trayLabels = { ...labels };
    },
  };
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
 * With `systemTheme` given, the OS theme is simulated; otherwise the browser's is used. `isMac` defaults to false.
 * The desktop (hotkey, tray, autostart) is simulated; `takenHotkeys` are combinations another app already holds.
 * The updater answers from the update options and never touches the network. Saved files are kept in memory.
 */
export function createMemoryPlatform(
  options: {
    osLocale?: string | null;
    systemTheme?: ColorScheme;
    isMac?: boolean;
    takenHotkeys?: readonly string[];
  } & MemoryUpdaterOptions = {},
): MemoryPlatform {
  const desktop = memoryDesktop(options.takenHotkeys ?? []);
  const updater = memoryUpdater(options);
  const files = memoryFiles();
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
    isMac: options.isMac ?? false,
    desktop,
    desktopState: () => ({ ...desktop.state }),
    pressGlobalHotkey: desktop.press,
    updater,
    updaterState: () => ({ ...updater.state }),
    files,
    savedFiles: () => [...files.saved],
    setSaveDialog: (answer) => {
      files.answer = answer;
    },
    dump() {
      return Object.fromEntries(data);
    },
    setSystemTheme: simulated.set,
  };
}
