import { lazy } from "react";
import { Diff } from "lucide-react";
import { defineTool } from "@/lib/tool";

export default defineTool({
  id: "json-diff",
  category: "development",
  icon: Diff,
  aliases: {
    en: ["diff", "json diff", "yaml diff", "compare", "difference", "json patch", "patch", "rfc 6902"],
    vi: ["so sánh", "khác biệt", "đối chiếu", "so khác"],
  },
  preferences: { version: 1, defaults: { arrayKey: "" } },
  component: lazy(() => import("./JsonDiffTool")),
});
