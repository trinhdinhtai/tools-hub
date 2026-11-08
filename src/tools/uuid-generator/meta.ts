import { lazy } from "react";
import { Fingerprint } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";
import { MODES } from "./modes";

export default defineTool({
  id: "uuid-generator",
  category: "generators",
  icon: Fingerprint,
  aliases: {
    en: ["uuid", "guid", "ulid", "id", "v4", "identifier"],
    vi: ["định danh", "mã định danh", "tạo id", "uuid"],
  },
  modes: MODES,
  detectPaste,
  component: lazy(() => import("./UuidGeneratorTool")),
});
