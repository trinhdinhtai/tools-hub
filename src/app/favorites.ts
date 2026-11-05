import { useCallback } from "react";
import { usePreference } from "@/lib/preferences";

/**
 * The favorite Tools (a Preference), in pinning order, and a function to pin or unpin one. Saved ids of Tools that
 * no longer exist are skipped. Only for the app shell: it reads the app namespace.
 */
export function useFavorites(known: readonly string[]): [readonly string[], (id: string) => void] {
  const [saved, save] = usePreference<string[]>("favorites");
  const toggle = useCallback(
    (id: string) => save(saved.includes(id) ? saved.filter((other) => other !== id) : [...saved, id]),
    [saved, save],
  );
  return [saved.filter((id) => known.includes(id)), toggle];
}
