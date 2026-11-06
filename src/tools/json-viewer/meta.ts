import { lazy } from "react";
import { Braces } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";

export default defineTool({
  id: "json-viewer",
  category: "development",
  icon: Braces,
  aliases: {
    en: ["json", "format", "formatter", "beautify", "prettify", "pretty print", "minify", "validate", "lint", "sort keys"],
    vi: ["định dạng", "làm đẹp", "thu gọn", "kiểm tra", "sắp xếp key"],
  },
  preferences: { version: 1, defaults: { indent: "2" } },
  detectPaste,
  component: lazy(() => import("./JsonViewerTool")),
});
