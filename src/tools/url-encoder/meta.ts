import { lazy } from "react";
import { Link2 } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";
import { MODES } from "./modes";

export default defineTool({
  id: "url-encoder",
  category: "converters",
  icon: Link2,
  aliases: {
    en: ["url", "uri", "url encode", "url decode", "percent encoding", "percent-encode", "query string", "query params", "escape", "unescape", "split url", "parse url"],
    vi: ["url", "mã hoá url", "giải mã url", "tách url", "percent encoding", "chuỗi truy vấn", "tham số truy vấn"],
  },
  modes: MODES,
  // Only the scope is stored; the text itself never leaves memory (ADR-0004).
  preferences: { version: 1, defaults: { scope: "full" } },
  detectPaste,
  component: lazy(() => import("./UrlEncoderTool")),
});
