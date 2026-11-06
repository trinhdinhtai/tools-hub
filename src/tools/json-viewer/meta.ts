import { lazy } from "react";
import { Braces } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";
import { MODES } from "./modes";

export default defineTool({
  id: "json-viewer",
  category: "development",
  icon: Braces,
  aliases: {
    en: [
      "json",
      "format",
      "formatter",
      "beautify",
      "prettify",
      "pretty print",
      "minify",
      "validate",
      "lint",
      "sort keys",
      "json5",
      "ndjson",
      "jsonl",
      "repair",
      "fix",
      "python dict",
      "path",
      "jsonpath",
      "query",
      "tree",
    ],
    vi: ["định dạng", "làm đẹp", "thu gọn", "kiểm tra", "sắp xếp key", "sửa", "truy vấn", "dạng cây"],
  },
  modes: MODES,
  preferences: { version: 1, defaults: { indent: "2" } },
  detectPaste,
  component: lazy(() => import("./JsonViewerTool")),
});
