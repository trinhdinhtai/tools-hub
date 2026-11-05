import { lazy, useEffect, useState } from "react";
import { NotebookPen, Timer } from "lucide-react";
import { usePaste } from "@/lib/paste";
import { defineTool, type ToolMeta } from "@/lib/tool";

// Stand-ins for Tools that do not exist yet, so app-level tests can work with more than one Open Tool.

function Notes() {
  const [text, setText] = useState("");
  usePaste(setText);
  return (
    <label>
      Note
      <textarea value={text} onChange={(event) => setText(event.target.value)} />
    </label>
  );
}

/** Counts up on its own, like a Stopwatch: it must keep running while its tab is not on screen. */
function Ticker() {
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTicks((n) => n + 1), 5);
    return () => clearInterval(timer);
  }, []);
  return <output data-testid="ticks">{ticks}</output>;
}

export const FAKE_TOOLS: ToolMeta[] = [
  defineTool({
    id: "notes",
    category: "text",
    icon: NotebookPen,
    aliases: { en: [], vi: [] },
    // Any text makes a note, but a weak match: a Tool made for the text should come first.
    detectPaste: () => 0.3,
    component: lazy(async () => ({ default: Notes })),
  }),
  defineTool({
    id: "ticker",
    category: "utilities",
    icon: Timer,
    aliases: { en: [], vi: [] },
    detectPaste: () => 0,
    component: lazy(async () => ({ default: Ticker })),
  }),
];

export const FAKE_TOOL_NAMES: Record<string, { name: string; description: string }> = {
  notes: { name: "Notes", description: "A fake Tool with Input." },
  ticker: { name: "Ticker", description: "A fake Tool that runs in the background." },
};
