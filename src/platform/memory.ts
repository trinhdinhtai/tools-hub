import { mediaQuerySystemTheme } from "./system-theme";
import type { ColorScheme, Desktop, Platform, SystemTheme, TrayLabels } from "./types";

export interface MemoryPlatform extends Platform {
  /** Snapshot of everything written to the store, for assertions in tests. */
  dump(): Record<string, unknown>;
  /** Simulates the user switching the OS theme. */
  setSystemTheme(scheme: ColorScheme): void;
  /** What the app last asked of the desktop. */
  desktopState(): DesktopState;
  /** Simulates the user pressing the global hotkey from another app. */
  pressGlobalHotkey(): void;
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
 */
export function createMemoryPlatform(
  options: { osLocale?: string | null; systemTheme?: ColorScheme; isMac?: boolean; takenHotkeys?: readonly string[] } = {},
): MemoryPlatform {
  const desktop = memoryDesktop(options.takenHotkeys ?? []);
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
    dump() {
      return Object.fromEntries(data);
    },
    setSystemTheme: simulated.set,
  };
}
