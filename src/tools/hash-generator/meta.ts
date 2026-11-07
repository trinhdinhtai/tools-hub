import { lazy } from "react";
import { Hash } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { MODES } from "./modes";

export default defineTool({
  id: "hash-generator",
  category: "generators",
  icon: Hash,
  aliases: {
    en: ["hash", "md5", "sha1", "sha256", "sha512", "sha3", "keccak", "hmac", "checksum", "digest"],
    vi: ["băm", "mã băm", "khoá hmac", "checksum"],
  },
  modes: MODES,
  component: lazy(() => import("./HashGeneratorTool")),
});
