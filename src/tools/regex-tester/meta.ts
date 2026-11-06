import { lazy } from "react";
import { Regex } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { MODES } from "./modes";

export default defineTool({
  id: "regex-tester",
  category: "development",
  icon: Regex,
  aliases: {
    en: ["regex", "regexp", "regular expression", "pattern", "match", "capture group", "replace", "test"],
    vi: ["biểu thức chính quy", "mẫu", "khớp", "nhóm", "thay thế", "kiểm tra"],
  },
  modes: MODES,
  component: lazy(() => import("./RegexTesterTool")),
});
