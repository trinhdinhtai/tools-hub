import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePreference } from "@/lib/preferences";
import type { Platform } from "@/platform/types";

/** The global hotkey, the combination the OS last refused (null if none) and how to ask for another. */
export interface GlobalHotkey {
  hotkey: string;
  failed: string | null;
  change: (accelerator: string) => void;
}

/**
 * Keeps the OS global hotkey in step with its Preference. A press brings the window forward and calls `onPressed`.
 * `failed` is the combination the OS last refused (null when the hotkey works); `change` registers a new combination
 * and saves it only if the OS accepts it, so a refused one never replaces a working one.
 */
export function useGlobalHotkey(platform: Platform, onPressed: () => void): GlobalHotkey {
  const [hotkey, setHotkey] = usePreference<string>("globalHotkey");
  const [failed, setFailed] = useState<string | null>(null);
  const pressed = useRef(onPressed);
  useEffect(() => {
    pressed.current = onPressed;
  });

  const register = useCallback(
    (accelerator: string) =>
      platform.desktop.setGlobalHotkey(accelerator, () => pressed.current()).then(
        () => {
          setFailed(null);
          return true;
        },
        () => {
          setFailed(accelerator);
          return false;
        },
      ),
    [platform],
  );

  useEffect(() => {
    void register(hotkey);
  }, [register, hotkey]);

  const change = useCallback(
    async (accelerator: string) => {
      if (await register(accelerator)) setHotkey(accelerator);
    },
    [register, setHotkey],
  );

  return { hotkey, failed, change };
}

/** Hands the close-button, autostart and tray Preferences to the desktop. Failures are logged, never fatal. */
export function useDesktopPreferences(platform: Platform) {
  const { t } = useTranslation();
  const [quitOnClose] = usePreference<boolean>("quitOnClose");
  const [autostart] = usePreference<boolean>("autostart");
  const open = t("tray.open");
  const quit = t("tray.quit");
  const { desktop } = platform;
  useEffect(() => void desktop.setQuitOnClose(quitOnClose).catch(warn), [desktop, quitOnClose]);
  useEffect(() => void desktop.setAutostart(autostart).catch(warn), [desktop, autostart]);
  useEffect(() => void desktop.setTrayLabels({ open, quit }).catch(warn), [desktop, open, quit]);
}

const warn = (error: unknown) => console.warn(error);
