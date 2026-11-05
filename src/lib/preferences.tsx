import { useCallback, useContext, useSyncExternalStore } from "react";
import { NamespaceContext, usePreferences } from "./preferences-context";

// How Tools persist anything (ADR-0004): only the Preference keys and Recent their `meta.ts` declares, and only in
// their own namespace. Tools never see the store itself, nor `./preferences-context` (lint enforces it).

/** A declared Preference of the current namespace and its setter; the value is remembered between app runs. */
export function usePreference<T>(key: string): [T, (value: T) => void] {
  const preferences = usePreferences();
  const namespace = useContext(NamespaceContext);
  const values = useSyncExternalStore(preferences.subscribe, () => preferences.get(namespace));
  const set = useCallback((value: T) => void preferences.set(namespace, key, value), [preferences, namespace, key]);
  return [values[key] as T, set];
}

/** The current namespace's declared Recent, newest first, and a function to add an item to it. */
export function useRecent(): [readonly string[], (item: string) => void] {
  const preferences = usePreferences();
  const namespace = useContext(NamespaceContext);
  const items = useSyncExternalStore(preferences.subscribe, () => preferences.recent(namespace));
  const add = useCallback((item: string) => void preferences.addRecent(namespace, item), [preferences, namespace]);
  return [items, add];
}
