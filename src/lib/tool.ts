import type { ComponentType, LazyExoticComponent } from "react";
import type { LucideIcon } from "lucide-react";

export const CATEGORIES = [
  "development",
  "generators",
  "converters",
  "network",
  "time-date",
  "media",
  "text",
  "ai",
  "utilities",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type Locale = "en" | "vi";

/**
 * The contract every Tool declares in `src/tools/<id>/meta.ts` as its default export.
 *
 * Name and description live in `locales/en.meta.json` and `locales/vi.meta.json` (bundled up front for
 * navigation); every other string lives in `locales/en.json` and `locales/vi.json`, the Tool namespace (its `id`).
 */
export interface ToolMeta {
  /** Unique, kebab-case, equal to the Tool's folder name. */
  id: string;
  category: Category;
  icon: LucideIcon;
  /** Search aliases in both languages; search always matches both. */
  aliases: Record<Locale, string[]>;
  /** Mode ids, each translated under `modes.<id>` in the Tool namespace. */
  modes?: readonly string[];
  /** Preference schema: versioned, every key has a default. */
  preferences?: { version: number; defaults: Record<string, unknown> };
  /** Recent schema, for Tools that keep a short non-sensitive history. */
  recent?: { version: number; maxItems: number };
  /** Paste Detection score for a pasted text: 0 (no match) to 1 (certain). */
  detectPaste?: (text: string) => number;
  component: LazyExoticComponent<ComponentType>;
}

export function defineTool(meta: ToolMeta): ToolMeta {
  return meta;
}
