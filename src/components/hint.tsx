import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The app's only hover hint: a shadcn tooltip on the given element, which it renders as the trigger. Never use the
 * `title` attribute (lint forbids it). The label is a visual hint only; the element keeps its own accessible name.
 */
export function Hint({
  label,
  side,
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
