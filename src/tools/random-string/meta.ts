import { lazy } from "react";
import { Dices } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { DEFAULT_CUSTOM_ALPHABET } from "./logic";
import { MODES } from "./modes";

export default defineTool({
  id: "random-string",
  category: "generators",
  icon: Dices,
  aliases: {
    en: ["random string", "nano id", "nanoid", "token", "hex", "base64url", "api key", "secret"],
    vi: ["chuỗi ngẫu nhiên", "token", "mã thông báo", "chuỗi", "ngẫu nhiên"],
  },
  modes: MODES,
  // Only the options are stored; the generated strings never leave memory (ADR-0004).
  preferences: {
    version: 1,
    defaults: {
      length: "32",
      count: "1",
      alphabet: DEFAULT_CUSTOM_ALPHABET,
    },
  },
  component: lazy(() => import("./RandomStringTool")),
});
