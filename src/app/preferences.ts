import type { Preferences } from "@/lib/preferences-context";
import type { PreferenceSchema, RecentSchema } from "@/lib/tool";
import type { PlatformStore } from "@/platform/types";

export type { Preferences };

/** Namespace id (`app` or `tool/<id>`) → what that namespace may persist. */
export type Schemas = Record<string, { preferences?: PreferenceSchema; recent?: RecentSchema }>;

/** What is written to the store under each key: the data plus the schema version it was written with. */
interface Stored<T> {
  version: number;
  data: T;
}

const PREFERENCES = "preferences/";
const RECENT = "recent/";
const EMPTY_VALUES: Readonly<Record<string, unknown>> = Object.freeze({});
const EMPTY_RECENT: readonly string[] = Object.freeze([]);

/** Deletes every stored key under a prefix, including those of namespaces that are no longer declared. */
async function deleteAll(store: PlatformStore, prefix: string) {
  for (const key of await store.keys()) {
    if (key.startsWith(prefix)) await store.delete(key);
  }
}

/** Same JSON kind as the default: a stored or set value of another shape is not a value of this Preference. */
function sameKind(value: unknown, fallback: unknown): boolean {
  if (Array.isArray(fallback)) return Array.isArray(value);
  if (fallback === null) return value === null;
  return typeof value === typeof fallback && value !== null && !Array.isArray(value);
}

/** Only declared keys whose stored value has the default's kind survive; everything else falls back to the default. */
function readValues(schema: PreferenceSchema, stored: Stored<Record<string, unknown>> | undefined) {
  const data = stored?.version === schema.version && stored.data && typeof stored.data === "object" ? stored.data : {};
  return Object.fromEntries(
    Object.entries(schema.defaults).map(([key, fallback]) => [key, sameKind(data[key], fallback) ? data[key] : fallback]),
  );
}

function readRecent(schema: RecentSchema, stored: Stored<unknown> | undefined): readonly string[] {
  if (stored?.version !== schema.version || !Array.isArray(stored.data)) return EMPTY_RECENT;
  return stored.data.filter((item): item is string => typeof item === "string").slice(0, schema.maxItems);
}

export async function loadPreferences(store: PlatformStore, schemas: Schemas): Promise<Preferences> {
  const values = new Map<string, Readonly<Record<string, unknown>>>();
  const recents = new Map<string, readonly string[]>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  for (const [namespace, schema] of Object.entries(schemas)) {
    if (schema.preferences) {
      values.set(namespace, readValues(schema.preferences, await store.get(PREFERENCES + namespace)));
    }
    if (schema.recent) recents.set(namespace, readRecent(schema.recent, await store.get(RECENT + namespace)));
  }

  return {
    get: (namespace) => values.get(namespace) ?? EMPTY_VALUES,
    async set(namespace, key, value) {
      const schema = schemas[namespace]?.preferences;
      if (!schema) throw new Error(`No Preference schema for "${namespace}"`);
      if (!Object.hasOwn(schema.defaults, key)) throw new Error(`Preference "${key}" is not declared by "${namespace}"`);
      if (!sameKind(value, schema.defaults[key])) {
        throw new Error(`Preference "${namespace}.${key}" has the wrong type: expected that of ${JSON.stringify(schema.defaults[key])}`);
      }
      const next = { ...values.get(namespace), [key]: value };
      values.set(namespace, next);
      notify();
      await store.set(PREFERENCES + namespace, { version: schema.version, data: next } satisfies Stored<unknown>);
    },
    async resetAll() {
      // Clear the store before telling anyone: a listener that writes a Preference back must not be wiped out.
      await deleteAll(store, PREFERENCES);
      for (const [namespace, schema] of Object.entries(schemas)) {
        if (schema.preferences) values.set(namespace, { ...schema.preferences.defaults });
      }
      notify();
    },
    recent: (namespace) => recents.get(namespace) ?? EMPTY_RECENT,
    async addRecent(namespace, item) {
      const schema = schemas[namespace]?.recent;
      if (!schema) throw new Error(`"${namespace}" declares no Recent`);
      const next = [item, ...(recents.get(namespace) ?? []).filter((existing) => existing !== item)].slice(0, schema.maxItems);
      recents.set(namespace, next);
      notify();
      await store.set(RECENT + namespace, { version: schema.version, data: next } satisfies Stored<unknown>);
    },
    async clearRecent() {
      for (const namespace of recents.keys()) recents.set(namespace, EMPTY_RECENT);
      notify();
      await deleteAll(store, RECENT);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
