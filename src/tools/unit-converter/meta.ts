import { lazy } from "react";
import { Ruler } from "lucide-react";
import { defineTool } from "@/lib/tool";

export default defineTool({
  id: "unit-converter",
  category: "converters",
  icon: Ruler,
  aliases: {
    en: ["unit converter", "units", "length", "distance", "mass", "weight", "temperature", "celsius", "fahrenheit", "kelvin", "data size", "bytes", "kb", "kib", "mb", "mib", "gb", "gib", "metric", "imperial"],
    vi: ["đổi đơn vị", "chuyển đổi đơn vị", "đơn vị", "chiều dài", "khoảng cách", "khối lượng", "cân nặng", "nhiệt độ", "độ c", "độ f", "dung lượng", "dung lượng dữ liệu", "byte"],
  },
  // No Modes: the quantity (length, mass, temperature, data size) only picks which units are listed, on the same screen
  // that works the same way for each, so it is a choice of unit, not a way of working.
  // The value is converted as it is typed and never stored (ADR-0004); there is nothing to prefer or remember.
  component: lazy(() => import("./UnitConverterTool")),
});
