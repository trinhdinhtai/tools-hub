import type { ToolMeta } from "@/lib/tool";
import { toolNamespace } from "@/lib/preferences-context";
import type { Schemas } from "./preferences";

/** `tool/<id>` for every Tool that declares a Preference or Recent schema. */
export function schemasFor(tools: readonly ToolMeta[]): Schemas {
  const schemas: Schemas = {};
  for (const tool of tools) {
    if (tool.preferences || tool.recent) schemas[toolNamespace(tool.id)] = { preferences: tool.preferences, recent: tool.recent };
  }
  return schemas;
}
