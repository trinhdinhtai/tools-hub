import { useCallback } from "react";
import { usePreference } from "@/lib/preferences";
import { APP_NAMESPACE, usePreferences } from "@/lib/preferences-context";

/**
 * The favorite Tools (a Preference), in pinning order, and a function to pin or unpin one. Saved ids of Tools that
 * no longer exist are skipped. Only for the app shell: it reads the app namespace.
 */
export function useFavorites(known: readonly string[]): [readonly string[], (id: string) => void] {
  const preferences = usePreferences();
  const [saved] = usePreference<string[]>("favorites");
  // Reads the current list at click time, not the one last rendered, so two quick clicks both count.
  const toggle = useCallback(
    (id: string) => {
      const current = preferences.get(APP_NAMESPACE).favorites as string[];
      const next = current.includes(id) ? current.filter((other) => other !== id) : [...current, id];
      void preferences.set(APP_NAMESPACE, "favorites", next);
    },
    [preferences],
  );
  return [saved.filter((id) => known.includes(id)), toggle];
}
