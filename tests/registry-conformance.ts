import { CATEGORIES, type Locale, type ToolMeta } from "@/lib/tool";

type Json = Record<string, unknown>;

export interface ToolEntry {
  folder: string;
  meta: ToolMeta;
  locales: Record<Locale, Json | undefined>;
}

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LOCALES: Locale[] = ["en", "vi"];

/** Dotted paths of every string leaf, e.g. `meta.name`. */
function leafKeys(value: Json, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" ? leafKeys(child as Json, path) : [path];
  });
}

function compareLocales(scope: string, locales: Record<Locale, Json>): string[] {
  const [en, vi] = [new Set(leafKeys(locales.en)), new Set(leafKeys(locales.vi))];
  return [
    ...[...en].filter((key) => !vi.has(key)).map((key) => `${scope}: key "${key}" is missing in vi`),
    ...[...vi].filter((key) => !en.has(key)).map((key) => `${scope}: key "${key}" is missing in en`),
  ];
}

/** Returns one human-readable problem per violation; an empty list means the registry conforms. */
export function checkRegistry(entries: ToolEntry[], shell: Record<Locale, Json>): string[] {
  const problems = compareLocales("app", shell);
  const seen = new Set<string>();

  for (const { folder, meta, locales } of entries) {
    const scope = `Tool "${meta.id}"`;
    if (seen.has(meta.id)) problems.push(`${scope}: duplicate id`);
    seen.add(meta.id);
    if (!KEBAB_CASE.test(meta.id)) problems.push(`${scope}: id must be kebab-case`);
    if (meta.id !== folder) problems.push(`${scope}: id must equal its folder name "${folder}"`);
    if (!(CATEGORIES as readonly string[]).includes(meta.category)) {
      problems.push(`${scope}: unknown category "${meta.category}"`);
    }
    for (const locale of LOCALES) {
      if (!meta.aliases[locale]?.length) problems.push(`${scope}: needs at least one ${locale} alias`);
    }
    if (meta.preferences && (typeof meta.preferences.defaults !== "object" || meta.preferences.defaults === null)) {
      problems.push(`${scope}: Preference schema needs default values`);
    }

    const missing = LOCALES.filter((locale) => !locales[locale]);
    if (missing.length) {
      problems.push(...missing.map((locale) => `${scope}: missing locales/${locale}.json or locales/${locale}.meta.json`));
      continue;
    }
    const complete = locales as Record<Locale, Json>;
    const required = ["meta.name", "meta.description", ...(meta.modes ?? []).map((mode) => `modes.${mode}`)];
    for (const locale of LOCALES) {
      const keys = new Set(leafKeys(complete[locale]));
      for (const key of required) {
        if (!keys.has(key)) problems.push(`${scope}: key "${key}" is missing in ${locale}`);
      }
    }
    problems.push(...compareLocales(scope, complete));
  }
  return problems;
}
