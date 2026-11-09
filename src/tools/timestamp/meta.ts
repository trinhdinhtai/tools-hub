import { lazy } from "react";
import { Clock } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";

export default defineTool({
  id: "timestamp",
  category: "time-date",
  icon: Clock,
  aliases: {
    en: ["timestamp", "unix time", "unix timestamp", "epoch", "epoch converter", "posix time", "date", "iso 8601", "time zone", "timezone", "utc", "milliseconds", "now"],
    vi: ["dấu thời gian", "thời gian unix", "ngày giờ", "đổi ngày", "múi giờ", "giờ utc", "chuyển đổi thời gian", "bây giờ"],
  },
  detectPaste,
  // Only the added time zones are stored; the timestamp typed or pasted never leaves memory (ADR-0004).
  preferences: {
    version: 1,
    defaults: { zones: [] },
  },
  component: lazy(() => import("./TimestampTool")),
});
