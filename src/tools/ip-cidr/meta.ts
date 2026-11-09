import { lazy } from "react";
import { Network } from "lucide-react";
import { defineTool } from "@/lib/tool";
import { detectPaste } from "./logic";
import { MODES } from "./modes";

export default defineTool({
  id: "ip-cidr",
  category: "network",
  icon: Network,
  aliases: {
    en: ["ip", "ipv4", "ipv6", "cidr", "subnet", "subnet calculator", "netmask", "subnet mask", "wildcard mask", "broadcast", "network address", "host range", "supernet", "aggregate", "summarize"],
    vi: ["địa chỉ ip", "dải ip", "mạng con", "chia mạng", "chia subnet", "mặt nạ mạng", "gộp dải", "gộp mạng", "tính subnet", "địa chỉ mạng"],
  },
  modes: MODES,
  detectPaste,
  // Networks are worked out as they are typed and never stored (ADR-0004); there is nothing to prefer or remember.
  component: lazy(() => import("./IpCidrTool")),
});
