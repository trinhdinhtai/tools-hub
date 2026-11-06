import { lazy } from "react";
import { CodeXml } from "lucide-react";
import { defineTool } from "@/lib/tool";

export default defineTool({
  id: "code-formatter",
  category: "development",
  icon: CodeXml,
  aliases: {
    en: [
      "format",
      "formatter",
      "beautify",
      "beautifier",
      "prettify",
      "pretty print",
      "minify",
      "minifier",
      "compress",
      "html",
      "css",
      "javascript",
      "js",
      "xml",
      "svg",
      "sql",
      "prettier",
    ],
    vi: ["định dạng code", "làm đẹp code", "thu gọn code", "nén code", "căn lề"],
  },
  preferences: { version: 1, defaults: { action: "beautify", indent: "2" } },
  component: lazy(() => import("./CodeFormatterTool")),
});
