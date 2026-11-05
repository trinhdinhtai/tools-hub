import { CATEGORIES, type Category, type ToolMeta } from "@/lib/tool";

// Every Tool registers itself by having a `meta.ts` in its folder (ADR-0005). Never edit this file to add a Tool.
const metaModules = import.meta.glob<ToolMeta>("../tools/*/meta.ts", { import: "default", eager: true });

export const tools: readonly ToolMeta[] = Object.values(metaModules).sort((a, b) => a.id.localeCompare(b.id));

/** Categories in their canonical order, each with its Tools; empty Categories are left out. */
export function toolsByCategory(list: readonly ToolMeta[]): [Category, ToolMeta[]][] {
  return CATEGORIES.map((category) => [category, list.filter((tool) => tool.category === category)] as [Category, ToolMeta[]]).filter(
    ([, list]) => list.length > 0,
  );
}
