import { createContext, useContext } from "react";

export const APP_NAMESPACE = "app";
export const toolNamespace = (toolId: string) => `tool/${toolId}`;

/**
 * The only way anything reaches the store (ADR-0004): Preference values of declared keys, and declared Recent lists.
 * Every write is checked against the namespace's schema; what was stored under another schema version is discarded.
 */
export interface Preferences {
  /** Current Preference values of a namespace, defaults filled in. Same object until the namespace changes. */
  get(namespace: string): Readonly<Record<string, unknown>>;
  set(namespace: string, key: string, value: unknown): Promise<void>;
  /** Every Preference back to its declared default. */
  resetAll(): Promise<void>;
  /** A namespace's Recent items, newest first. Same array until it changes. */
  recent(namespace: string): readonly string[];
  addRecent(namespace: string, item: string): Promise<void>;
  /** Empties every Recent. */
  clearRecent(): Promise<void>;
  /** Called after any change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

/** The app's Preferences. App-shell only: Tools use the hooks in `@/lib/preferences`, scoped to their own namespace. */
export const PreferencesContext = createContext<Preferences | null>(null);
/** Namespace of the component tree: `app`, or `tool/<id>` inside a Tool. */
export const NamespaceContext = createContext(APP_NAMESPACE);

export function usePreferences(): Preferences {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error("Preferences are used outside a PreferencesContext provider");
  return preferences;
}
