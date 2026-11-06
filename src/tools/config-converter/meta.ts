import { lazy } from "react";
import { FileCog } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";

export default defineTool({
  id: "config-converter",
  category: "converters",
  icon: FileCog,
  aliases: {
    en: ["config", "convert", "json", "yaml", "yml", "toml", "env", "dotenv", ".env", "properties", "java properties", "settings"],
    vi: ["cấu hình", "chuyển đổi", "đổi định dạng", "biến môi trường"],
  },
  preferences: { version: 1, defaults: { to: "yaml" } },
  detectPaste,
  component: lazy(() => import("./ConfigConverterTool")),
});
