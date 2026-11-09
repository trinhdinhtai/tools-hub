import { lazy } from "react";
import { CalendarClock } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";

export default defineTool({
  id: "cron",
  category: "time-date",
  icon: CalendarClock,
  aliases: {
    en: ["cron", "crontab", "cron expression", "cron schedule", "cron job", "schedule", "next run", "scheduler", "explain cron"],
    vi: ["biểu thức cron", "lịch chạy", "lập lịch", "lần chạy kế tiếp", "giải thích cron", "tác vụ định kỳ", "hẹn giờ"],
  },
  detectPaste,
  // Only the time zone picked for the runs is stored; the expression typed or pasted never leaves memory (ADR-0004).
  preferences: {
    version: 1,
    defaults: { zone: "" },
  },
  component: lazy(() => import("./CronTool")),
});
