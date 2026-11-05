import { lazy } from "react";
import { Binary } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";
import { MODES } from "./modes";

export default defineTool({
  id: "base64",
  category: "converters",
  icon: Binary,
  aliases: {
    en: ["base64", "base64url", "base32", "encode", "decode", "data uri", "file"],
    vi: ["mã hoá", "giải mã", "chuyển đổi", "tệp"],
  },
  modes: MODES,
  preferences: { version: 1, defaults: { variant: "standard", dataUri: false } },
  detectPaste,
  component: lazy(() => import("./Base64Tool")),
});
