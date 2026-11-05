import { cn } from "@/lib/utils";

/** A key or shortcut as the user presses it, e.g. `Esc` or `Ctrl K`. */
export function Kbd({ children, className }: { children: string; className?: string }) {
  return <kbd className={cn("rounded border bg-background px-1 font-mono text-[11px] text-subtle-foreground", className)}>{children}</kbd>;
}
