import { lazy } from "react";
import { EyeOff } from "lucide-react";
import { defineTool } from "@/lib/tool";

export default defineTool({
  id: "secret-redactor",
  category: "ai",
  icon: EyeOff,
  aliases: {
    en: ["redact", "secret", "pii", "mask", "anonymize", "sanitize", "privacy", "hide", "api key", "llm", "chatgpt"],
    vi: ["che", "ẩn", "che giấu", "che thông tin", "bảo mật", "dữ liệu cá nhân", "ẩn danh", "mật khẩu"],
  },
  component: lazy(() => import("./SecretRedactorTool")),
});
