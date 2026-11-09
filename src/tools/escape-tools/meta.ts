import { lazy } from "react";
import { Ampersand } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { MODES } from "./modes";

export default defineTool({
  id: "escape-tools",
  category: "converters",
  icon: Ampersand,
  aliases: {
    en: ["escape", "unescape", "html entity", "entities", "backslash", "string literal", "unicode", "\\u", "hex", "\\x", "punycode", "idn", "xn--", "domain"],
    vi: ["thoát ký tự", "ký tự đặc biệt", "chuỗi", "tên miền", "mã hoá", "giải mã"],
  },
  modes: MODES,
  component: lazy(() => import("./EscapeToolsTool")),
});
