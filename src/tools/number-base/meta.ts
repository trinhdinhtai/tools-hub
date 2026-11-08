import { lazy } from "react";
import { Binary } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { MODES } from "./modes";

export default defineTool({
  id: "number-base",
  category: "converters",
  icon: Binary,
  aliases: {
    en: ["number base", "binary", "hex", "hexadecimal", "octal", "decimal", "radix", "base converter", "roman numerals", "two's complement", "bit grid", "bitwise", "integer calculator"],
    vi: ["cơ số", "hệ cơ số", "nhị phân", "bát phân", "thập phân", "thập lục phân", "chuyển đổi cơ số", "số la mã", "chữ số la mã", "bù hai", "lưới bit", "bật tắt bit"],
  },
  modes: MODES,
  // The number is converted as it is typed and never stored (ADR-0004); there is nothing to prefer or remember.
  component: lazy(() => import("./NumberBaseTool")),
});
