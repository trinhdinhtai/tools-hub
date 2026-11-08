import { lazy } from "react";
import { KeyRound } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { MODES } from "./modes";

export default defineTool({
  id: "password-generator",
  category: "generators",
  icon: KeyRound,
  aliases: {
    en: ["password", "passphrase", "generator", "random", "diceware", "secret"],
    vi: ["mật khẩu", "cụm từ ghi nhớ", "tạo mật khẩu", "ngẫu nhiên", "passphrase"],
  },
  modes: MODES,
  // Only the options are stored; the generated password itself never leaves memory (ADR-0004).
  preferences: {
    version: 1,
    defaults: {
      length: "20",
      groups: ["lowercase", "uppercase", "digits", "symbols"],
      excludeAmbiguous: false,
      wordCount: "5",
      separator: "hyphen",
      capitalize: false,
      includeNumber: false,
    },
  },
  component: lazy(() => import("./PasswordGeneratorTool")),
});
