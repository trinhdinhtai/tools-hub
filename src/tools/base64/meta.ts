import { lazy } from "react";
import { Binary } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";

export default defineTool({
  id: "base64",
  category: "converters",
  icon: Binary,
  aliases: {
    en: ["base64", "base64url", "base32", "encode", "decode"],
    vi: ["mã hoá", "giải mã", "chuyển đổi"],
  },
  preferences: { version: 1, defaults: { variant: "standard" } },
  detectPaste,
  component: lazy(() => import("./Base64Tool")),
});
