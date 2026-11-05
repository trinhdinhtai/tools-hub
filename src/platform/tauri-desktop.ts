import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { register, unregister, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import type { Desktop } from "./types";

/** The desktop through Tauri; the tray, single instance and hide-on-close are set up in `src-tauri/src/lib.rs`. */
export function createTauriDesktop(): Desktop {
  let current: string | null = null;
  let onPressed = () => {};
  // Calls run one at a time: two overlapping registrations of the same combination would collide in the OS.
  let queue: Promise<unknown> = Promise.resolve();

  async function bringForward() {
    const window = getCurrentWindow();
    await window.show();
    await window.unminimize();
    await window.setFocus();
    onPressed();
  }

  async function setGlobalHotkey(accelerator: string, listener: () => void) {
    onPressed = listener;
    if (accelerator === current) return;
    // A reloaded page leaves the old page's hotkey in the OS; nothing else of ours is registered yet.
    if (current === null) await unregisterAll();
    // Register the new one first: if the OS refuses it, the current one keeps working.
    await register(accelerator, (event) => {
      if (event.state === "Pressed") void bringForward();
    });
    if (current !== null) await unregister(current);
    current = accelerator;
  }

  return {
    setGlobalHotkey(accelerator, listener) {
      const run = queue.then(() => setGlobalHotkey(accelerator, listener));
      queue = run.catch(() => {});
      return run;
    },
    setQuitOnClose: (quit) => invoke("set_quit_on_close", { quit }),
    async setAutostart(enabled) {
      if ((await isEnabled()) !== enabled) await (enabled ? enable() : disable());
    },
    setTrayLabels: (labels) => invoke("set_tray_labels", { ...labels }),
  };
}
