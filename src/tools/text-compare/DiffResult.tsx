import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Cell, CompareStats, Hunk, Row } from "./logic";

/** Height of a row in pixels; every row is one line high, so only the rows in sight need drawing. */
const ROW_HEIGHT = 20;

/** Rows drawn above and below the ones in sight, so a fast scroll does not show blank space. */
const OVERSCAN = 20;

/** Height assumed until the view is measured (and where it cannot be, as in tests). */
const FALLBACK_HEIGHT = 448;

/** Rows kept in sight above a change stepped to, so it is read in its context. */
const CONTEXT_ROWS = 3;

type Pane = "left" | "right";

const PANES = {
  left: {
    label: "original",
    tint: "bg-rose-500/10",
    mark: "bg-rose-500/25 text-rose-900 dark:text-rose-100",
  },
  right: {
    label: "modified",
    tint: "bg-emerald-500/10",
    mark: "bg-emerald-500/25 text-emerald-900 dark:text-emerald-100",
  },
} as const;

function LineText({ cell, pane }: { cell: Cell; pane: Pane }) {
  if (!cell.parts) return cell.text;
  return cell.parts.map((part, i) =>
    part.changed ? (
      <mark key={i} className={cn("rounded-[2px]", PANES[pane].mark)}>
        {part.text}
      </mark>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

/**
 * One text of the comparison, in its own scrolling frame: a row per aligned line, blank where the other text has a line
 * this one lacks. Only the rows from `first` to `last` are drawn.
 */
function DiffPane({
  pane,
  rows,
  first,
  last,
  current,
  scrollRef,
}: {
  pane: Pane;
  rows: Row[];
  first: number;
  last: number;
  current?: Hunk;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useTranslation("text-compare");
  const label = t(PANES[pane].label);
  const widest = useMemo(() => rows.reduce((width, row) => Math.max(width, row[pane]?.text.length ?? 0), 0), [rows, pane]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span aria-hidden className="text-xs text-muted-foreground">
        {label}
      </span>
      <div
        ref={scrollRef}
        tabIndex={0}
        className="h-[28rem] overflow-auto rounded-lg border border-input bg-card font-mono text-[13px]"
      >
        <div
          role="table"
          aria-label={label}
          aria-rowcount={rows.length}
          className="relative"
          // Monospace text: the frame is as wide as the longest line, so a long line scrolls sideways.
          style={{ height: rows.length * ROW_HEIGHT, width: `max(100%, calc(3.5rem + ${widest}ch + 1rem))` }}
        >
          {rows.slice(first, last).map((row, i) => {
            const index = first + i;
            const cell = row[pane];
            const tinted = row.kind !== "equal" && cell !== undefined;
            const inCurrent = current !== undefined && index >= current.start && index < current.end;
            return (
              <div
                key={index}
                role="row"
                aria-rowindex={index + 1}
                aria-current={inCurrent || undefined}
                className={cn(
                  "absolute inset-x-0 grid grid-cols-[3.5rem_1fr] leading-5",
                  tinted && PANES[pane].tint,
                  !cell && "bg-[repeating-linear-gradient(135deg,var(--color-border)_0_1px,transparent_1px_6px)]",
                  inCurrent && "outline -outline-offset-1 outline-ring",
                )}
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                <span role="cell" className="pr-2 text-right text-muted-foreground tabular-nums select-none">
                  {cell?.line}
                </span>
                <span role="cell" className="pr-4 whitespace-pre">
                  {/* Screen readers hear what happened to the line; sighted users see it from the colour. */}
                  {tinted && <span className="sr-only">{t(`kinds.${row.kind}`)}: </span>}
                  {cell && <LineText cell={cell} pane={pane} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The result of a comparison: a summary, steps to the previous and next change, a copy button, and the two texts in
 * two frames side by side that scroll up and down together, so aligned lines stay level. Only the rows in sight are
 * drawn, so thousands of lines scroll smoothly.
 */
export function DiffResult({
  rows,
  hunks,
  stats,
  pending,
  unifiedDiff,
}: {
  rows: Row[];
  hunks: Hunk[];
  stats: CompareStats;
  /** A newer comparison is running; this one stays shown until it ends. */
  pending: boolean;
  /** The changes as a unified diff, built when the user copies. */
  unifiedDiff: () => string;
}) {
  const { t } = useTranslation("text-compare");
  const leftPane = useRef<HTMLDivElement>(null);
  const rightPane = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: FALLBACK_HEIGHT });
  const [stepped, setStepped] = useState(-1);
  // The texts change under a step; it then points at a change that may no longer exist.
  const current = Math.min(stepped, hunks.length - 1);

  useEffect(() => {
    const left = leftPane.current;
    const right = rightPane.current;
    if (!left || !right) return;
    const follow = (from: HTMLDivElement, to: HTMLDivElement) => () => {
      // Setting the same value fires no scroll event, so the two frames do not chase each other.
      if (to.scrollTop !== from.scrollTop) to.scrollTop = from.scrollTop;
      setViewport({ top: from.scrollTop, height: from.clientHeight || FALLBACK_HEIGHT });
    };
    const onLeft = follow(left, right);
    const onRight = follow(right, left);
    onLeft();
    left.addEventListener("scroll", onLeft, { passive: true });
    right.addEventListener("scroll", onRight, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onLeft);
    observer?.observe(left);
    return () => {
      left.removeEventListener("scroll", onLeft);
      right.removeEventListener("scroll", onRight);
      observer?.disconnect();
    };
  }, []);

  const stepTo = (index: number) => {
    const hunk = hunks[index];
    if (!hunk) return;
    setStepped(index);
    const top = Math.max(0, (hunk.start - CONTEXT_ROWS) * ROW_HEIGHT);
    for (const pane of [leftPane, rightPane]) if (pane.current) pane.current.scrollTop = top;
    // Drawn at once, without waiting for the scroll event.
    setViewport((viewport) => ({ ...viewport, top }));
  };

  const first = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN);
  const currentHunk = hunks[current];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Label aria-hidden>{t("differences")}</Label>
          <p className="font-mono text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {pending ? t("comparing") : hunks.length === 0 ? t("noChanges") : t("summary", { ...stats })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {hunks.length > 0 && (
            <>
              {current >= 0 && (
                <span className="mr-1 font-mono text-xs text-muted-foreground tabular-nums">
                  {t("position", { current: current + 1, count: hunks.length })}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("previous")}
                title={t("previous")}
                disabled={current <= 0}
                onClick={() => stepTo(current - 1)}
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("next")}
                title={t("next")}
                disabled={current >= hunks.length - 1}
                onClick={() => stepTo(current + 1)}
              >
                <ChevronDown />
              </Button>
            </>
          )}
          <CopyButton value={unifiedDiff} label={t("copyDiff")} disabled={hunks.length === 0} className="ml-1" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <DiffPane pane="left" rows={rows} first={first} last={last} current={currentHunk} scrollRef={leftPane} />
        <DiffPane pane="right" rows={rows} first={first} last={last} current={currentHunk} scrollRef={rightPane} />
      </div>
    </div>
  );
}
