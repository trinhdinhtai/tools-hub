import { lazy } from "react";
import { KeyRound } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";

export default defineTool({
  id: "jwt-decoder",
  category: "text",
  icon: KeyRound,
  aliases: {
    en: ["jwt", "json web token", "token", "decode jwt", "jwt decoder", "bearer", "jws", "claims", "exp", "expiry", "access token", "id token"],
    vi: ["giải mã jwt", "giải mã token", "mã thông báo", "hết hạn", "còn hạn", "hạn token"],
  },
  // No Preference: the token pasted in is Input and never leaves memory (ADR-0004).
  detectPaste,
  component: lazy(() => import("./JwtDecoderTool")),
});
