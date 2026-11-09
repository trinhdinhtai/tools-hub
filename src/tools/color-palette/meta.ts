import { lazy } from "react";
import { Palette } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";

export default defineTool({
  id: "color-palette",
  category: "media",
  icon: Palette,
  aliases: {
    en: ["color", "colour", "color picker", "color converter", "hex", "rgb", "hsl", "hwb", "oklch", "hsv", "palette", "shades", "tints", "color scale", "harmony", "complementary", "css variables", "contrast", "contrast checker", "wcag", "accessibility", "a11y", "color blindness", "colorblind", "protanopia", "deuteranopia", "tritanopia"],
    vi: ["màu", "màu sắc", "bảng màu", "chọn màu", "chuyển đổi màu", "mã màu", "dải sắc độ", "sắc độ", "màu hài hoà", "màu bổ túc", "biến css", "độ tương phản", "tương phản", "kiểm tra tương phản", "khả năng tiếp cận", "mù màu", "mô phỏng mù màu"],
  },
  detectPaste,
  // The color typed or pasted stays in memory (ADR-0004). Only how to export is a Preference, and the Recent holds the
  // last 8 colors the user copied, as hex.
  preferences: {
    version: 1,
    defaults: { exportFormat: "hex", exportAs: "css", exportPrefix: "color", harmony: "complementary" },
  },
  recent: { version: 1, maxItems: 8 },
  component: lazy(() => import("./ColorPaletteTool")),
});
