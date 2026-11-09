import { lazy } from "react";
import { KeyRound } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";
import { MODES } from "./modes";

export default defineTool({
  id: "jwt-decoder",
  category: "text",
  icon: KeyRound,
  aliases: {
    en: ["jwt", "json web token", "token", "decode jwt", "jwt decoder", "bearer", "jws", "claims", "exp", "expiry", "access token", "id token", "verify jwt", "sign jwt", "signature", "jwks", "jwk", "pem", "hs256", "rs256", "es256", "eddsa"],
    vi: ["giải mã jwt", "giải mã token", "mã thông báo", "hết hạn", "còn hạn", "hạn token", "xác minh chữ ký", "kiểm tra chữ ký", "ký token", "tạo token", "khoá công khai"],
  },
  // No Preference: the token pasted in is Input and never leaves memory (ADR-0004).
  modes: MODES,
  detectPaste,
  component: lazy(() => import("./JwtDecoderTool")),
});
