import { lazy } from "react";
import { GitCompareArrows } from "lucide-react";
import { defineTool } from "@/lib/tool";

export default defineTool({
  id: "text-compare",
  category: "text",
  icon: GitCompareArrows,
  aliases: {
    en: ["diff", "text diff", "compare", "difference", "side by side", "unified diff", "changes"],
    vi: ["so sánh", "so sánh văn bản", "khác biệt", "đối chiếu", "so khác"],
  },
  preferences: { version: 1, defaults: { granularity: "word", ignoreWhitespace: false, ignoreCase: false } },
  component: lazy(() => import("./TextCompareTool")),
});
