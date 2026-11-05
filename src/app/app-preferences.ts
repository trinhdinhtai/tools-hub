import type { Locale, ToolMeta } from "@/lib/tool";
import type { ColorScheme } from "@/platform/types";
import { APP_NAMESPACE, toolNamespace } from "@/lib/preferences-context";
import { LOCALES, resolveLocale } from "@/i18n";
import type { Schemas } from "./preferences";

export const LANGUAGES = ["system", "en", "vi"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/**
 * The app's own Preferences: "system" means follow the OS. `openTools` is the tab order of the Open Tools and
 * `activeTool` the one on screen ("" for none): only their ids, never their Input (ADR-0004). `favorites` are the
 * ids of the Tools pinned to the top of the sidebar, in pinning order. The app's Recent is the Tools opened lately.
 */
export const APP_SCHEMA = {
  preferences: {
    version: 1,
    defaults: {
      language: "system" satisfies Language,
      theme: "system" satisfies Theme,
      openTools: [] as string[],
      activeTool: "",
      favorites: [] as string[],
    },
  },
  recent: { version: 1, maxItems: 8 },
};

/** The app's namespace plus `tool/<id>` for every Tool that declares a Preference or Recent schema. */
export function schemasFor(tools: readonly ToolMeta[]): Schemas {
  const schemas: Schemas = { [APP_NAMESPACE]: APP_SCHEMA };
  for (const tool of tools) {
    if (tool.preferences || tool.recent) schemas[toolNamespace(tool.id)] = { preferences: tool.preferences, recent: tool.recent };
  }
  return schemas;
}

/** The locale to show: the chosen language, or the OS language when the choice is "system" (or unknown). */
export function localeFor(language: unknown, osLocale: string | null): Locale {
  return LOCALES.includes(language as Locale) ? (language as Locale) : resolveLocale(osLocale);
}

export function colorSchemeFor(theme: unknown, system: ColorScheme): ColorScheme {
  return theme === "light" || theme === "dark" ? theme : system;
}
