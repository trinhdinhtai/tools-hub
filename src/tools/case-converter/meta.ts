import { lazy } from "react";
import { CaseSensitive } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { MODES } from "./modes";

export default defineTool({
  id: "case-converter",
  category: "text",
  icon: CaseSensitive,
  aliases: {
    en: ["case", "case converter", "camelcase", "pascalcase", "snake case", "kebab case", "constant case", "title case", "url slug", "slugify", "naming conventions"],
    vi: ["đổi kiểu chữ", "chuyển đổi case", "viết hoa", "viết thường", "kiểu tên", "tạo slug", "bỏ dấu tiếng việt", "url slug"],
  },
  modes: MODES,
  // The text is converted as it is typed and never stored (ADR-0004); there is nothing to prefer or remember.
  component: lazy(() => import("./CaseConverterTool")),
});
