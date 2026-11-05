import i18next, { type BackendModule, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import type { Locale } from "@/lib/tool";
import appEn from "./locales/en.json";
import appVi from "./locales/vi.json";

export const LOCALES: readonly Locale[] = ["en", "vi"];

/** Namespace of app-shell strings. */
export const APP_NS = "app";
/** Namespace holding every Tool's `meta` (name, description), keyed by Tool id. Loaded up front for navigation. */
export const TOOLS_NS = "tools";

type ToolLocaleMeta = { name: string; description: string };

const META_PATH = /tools\/([^/]+)\/locales\/(en|vi)\.meta\.json$/;

// A Tool's name and description (`locales/<lng>.meta.json`) are bundled up front for navigation;
// the rest of its namespace (`locales/<lng>.json`) is lazy-loaded with the Tool.
const toolMetaFiles = import.meta.glob<ToolLocaleMeta>("../tools/*/locales/*.meta.json", {
  import: "default",
  eager: true,
});
const toolLocaleFiles = import.meta.glob<Record<string, unknown>>("../tools/*/locales/{en,vi}.json", {
  import: "default",
});

/** OS language decides the default locale: Vietnamese → vi, anything else → en. */
export function resolveLocale(osLocale: string | null): Locale {
  return osLocale?.toLowerCase().startsWith("vi") ? "vi" : "en";
}

function toolMetaResources(): Record<Locale, Record<string, ToolLocaleMeta>> {
  const out: Record<Locale, Record<string, ToolLocaleMeta>> = { en: {}, vi: {} };
  for (const [path, meta] of Object.entries(toolMetaFiles)) {
    const match = META_PATH.exec(path);
    if (match) out[match[2] as Locale][match[1]!] = meta;
  }
  return out;
}

const toolNamespaceBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language, namespace, callback) {
    const load = toolLocaleFiles[`../tools/${namespace}/locales/${language}.json`];
    if (!load) return callback(new Error(`No locale ${language} for namespace ${namespace}`), null);
    load().then(
      (data) => callback(null, data),
      (error: Error) => callback(error, null),
    );
  },
};

export async function createI18n(locale: Locale): Promise<i18n> {
  const toolMeta = toolMetaResources();
  const instance = i18next.createInstance();
  await instance
    .use(toolNamespaceBackend)
    .use(initReactI18next)
    .init({
      lng: locale,
      fallbackLng: "en",
      supportedLngs: LOCALES,
      ns: [APP_NS, TOOLS_NS],
      defaultNS: APP_NS,
      partialBundledLanguages: true,
      resources: {
        en: { [APP_NS]: appEn, [TOOLS_NS]: toolMeta.en },
        vi: { [APP_NS]: appVi, [TOOLS_NS]: toolMeta.vi },
      },
      interpolation: { escapeValue: false },
    });
  return instance;
}
