import { describe, expect, it } from "vitest";
import { lazy } from "react";
import { Binary } from "lucide-react";
import type { ToolMeta } from "@/lib/tool";
import appEn from "@/i18n/locales/en.json";
import appVi from "@/i18n/locales/vi.json";
import { checkRegistry, type ToolEntry } from "./registry-conformance";

const metaModules = import.meta.glob<ToolMeta>("../src/tools/*/meta.ts", { import: "default", eager: true });
const localeModules = import.meta.glob<Record<string, unknown>>("../src/tools/*/locales/*.json", {
  import: "default",
  eager: true,
});

/** A Tool's namespace as the app sees it: `<lng>.meta.json` under `meta`, plus `<lng>.json`. */
function namespace(folder: string, locale: "en" | "vi") {
  const prefix = `../src/tools/${folder}/locales/${locale}`;
  const meta = localeModules[`${prefix}.meta.json`];
  const ui = localeModules[`${prefix}.json`];
  return meta && ui ? { ...ui, meta } : undefined;
}

function realEntries(): ToolEntry[] {
  return Object.entries(metaModules).map(([path, meta]) => {
    const folder = path.split("/").at(-2)!;
    return { folder, meta, locales: { en: namespace(folder, "en"), vi: namespace(folder, "vi") } };
  });
}

describe("Registry conformance", () => {
  it("finds at least one Tool", () => {
    expect(realEntries().length).toBeGreaterThan(0);
  });

  it("every Tool and the app shell conform", () => {
    expect(checkRegistry(realEntries(), { en: appEn, vi: appVi })).toEqual([]);
  });
});

describe("checkRegistry catches", () => {
  const goodLocale = { meta: { name: "X", description: "X" }, label: "X" };
  const tool = (overrides: Partial<ToolMeta> = {}): ToolMeta => ({
    id: "sample",
    category: "converters",
    icon: Binary,
    aliases: { en: ["x"], vi: ["x"] },
    component: lazy(async () => ({ default: () => null })),
    ...overrides,
  });
  const entry = (overrides: Partial<ToolEntry> = {}): ToolEntry => ({
    folder: "sample",
    meta: tool(),
    locales: { en: goodLocale, vi: goodLocale },
    ...overrides,
  });
  const shell = { en: { a: "A" }, vi: { a: "A" } };

  it("accepts a conforming Tool", () => {
    expect(checkRegistry([entry()], shell)).toEqual([]);
  });

  it.each<[string, ToolEntry[], RegExp]>([
    ["duplicate ids", [entry(), entry({ folder: "other", meta: tool({ id: "sample" }) })], /duplicate/i],
    ["non kebab-case id", [entry({ folder: "Bad_Id", meta: tool({ id: "Bad_Id" }) })], /kebab/i],
    ["id differing from folder", [entry({ folder: "folder" })], /folder/i],
    ["unknown Category", [entry({ meta: tool({ category: "misc" as never }) })], /category/i],
    ["missing vi locale", [entry({ locales: { en: goodLocale, vi: undefined } })], /vi/],
    ["missing name key", [entry({ locales: { en: goodLocale, vi: { meta: { description: "X" }, label: "X" } } })], /meta\.name/],
    ["key only in en", [entry({ locales: { en: { ...goodLocale, extra: "X" }, vi: goodLocale } })], /extra/],
    ["untranslated Mode", [entry({ meta: tool({ modes: ["fast"] }) })], /modes\.fast/],
    ["empty aliases", [entry({ meta: tool({ aliases: { en: [], vi: ["x"] } }) })], /alias/i],
    [
      "Preference without defaults",
      [entry({ meta: tool({ preferences: { version: 1, defaults: undefined as never } }) })],
      /default/i,
    ],
    [
      "Preference key without a default",
      [entry({ meta: tool({ preferences: { version: 1, defaults: { indent: undefined } } }) })],
      /"indent".*default/i,
    ],
    [
      "Preference default that is not JSON",
      [entry({ meta: tool({ preferences: { version: 1, defaults: { format: () => "x" } } }) })],
      /"format".*JSON/i,
    ],
    [
      "Preference schema without a version",
      [entry({ meta: tool({ preferences: { version: 0, defaults: { indent: 2 } } }) })],
      /version/i,
    ],
    ["Recent without a positive maxItems", [entry({ meta: tool({ recent: { version: 1, maxItems: 0 } }) })], /maxItems/],
  ])("%s", (_name, entries, problem) => {
    const problems = checkRegistry(entries, shell);
    expect(problems.some((p) => problem.test(p))).toBe(true);
  });

  it("app shell keys missing in one language", () => {
    expect(checkRegistry([entry()], { en: { a: "A", b: "B" }, vi: { a: "A" } })).toEqual([
      'app: key "b" is missing in vi',
    ]);
  });
});
