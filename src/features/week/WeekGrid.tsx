import { useLayoutEffect, useRef, useState } from "react";
import {
  fitPxPerMin,
  gridHeightPx,
  pxToMinute,
  scaledBox,
  wakePosition,
  minuteToPx,
  type GridScale,
} from "@shared/grid";
import type { DateKey } from "@shared/time";
import { cn } from "@/lib/utils";
import { BlockCard } from "@/features/day/BlockCard";
import type { GridCard } from "@/features/day/DayGrid";
import { hourMarks } from "@/features/day/dayView";
import type { WeekColumn } from "./weekView";

const GUTTER_PX = 40;

/**
 * Seven days side by side (PRD P6; DESIGN.md section 7): compact columns in the
 * category colours, each day's plan, and on days that have begun what happened
 * beside it as a narrower column. The waking day fits the height, as Fit does on the
 * day view, and the rest scrolls.
 */
export function WeekGrid({
  columns,
  gridStartMin,
  wakeMin,
  sleepMin,
  isPhone,
  onOpenDay,
  onOpenCard,
  onEmptySlot,
}: {
  columns: readonly WeekColumn[];
  gridStartMin: number;
  wakeMin: number;
  sleepMin: number;
  isPhone: boolean;
  onOpenDay: (date: DateKey) => void;
  onOpenCard: (date: DateKey, key: string) => void;
  /** A click where a day's plan has nothing, at this grid position. */
  onEmptySlot: (date: DateKey, position: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [viewportPx, setViewportPx] = useState(0);
  const scrolled = useRef(false);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    const measure = () =>
      setViewportPx(
        scroller.clientHeight - (headerRef.current?.offsetHeight ?? 0),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const scale: GridScale = {
    pxPerMin: fitPxPerMin(Math.max(viewportPx - 16, 0), wakeMin, sleepMin),
    folds: [],
  };

  // Open at the wake time, once.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null || viewportPx <= 0 || scrolled.current) return;
    scrolled.current = true;
    scroller.scrollTop = minuteToPx(scale, wakePosition(gridStartMin, wakeMin));
  });

  const height = gridHeightPx(scale);

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
      <div
        ref={headerRef}
        className="sticky top-0 z-20 flex border-b bg-background"
      >
        <div style={{ width: GUTTER_PX }} className="shrink-0" />
        {columns.map((column) => (
          <button
            key={column.date}
            type="button"
            onClick={() => onOpenDay(column.date)}
            aria-label={`Open ${column.label}`}
            aria-current={column.tense === "today" ? "date" : undefined}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-sm text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm",
              column.tense === "today"
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {column.label}
          </button>
        ))}
      </div>

      <div
        className="relative"
        style={{ height, marginTop: 8, marginBottom: 8 }}
      >
        {hourMarks(gridStartMin, isPhone ? 3 : 2).map((mark) => (
          <div
            key={mark.position}
            className="pointer-events-none absolute inset-x-0"
            style={{ top: Math.round(minuteToPx(scale, mark.position)) }}
          >
            <span
              className="absolute -translate-y-1/2 pr-1.5 text-right text-xs text-muted-foreground tabular-nums"
              style={{ width: GUTTER_PX }}
            >
              {mark.label.slice(0, 2)}
            </span>
            <div
              className="border-t border-border/70"
              style={{ marginLeft: GUTTER_PX }}
            />
          </div>
        ))}

        <div
          className="absolute inset-y-0 right-0 flex"
          style={{ left: GUTTER_PX }}
        >
          {columns.map((column) => (
            <div
              key={column.date}
              className={cn(
                "relative flex min-w-0 flex-1 border-l border-border/60",
                column.tense === "today" && "bg-muted/40",
              )}
            >
              <Lane
                cards={column.plan}
                lane="plan"
                label={`${column.label}, plan`}
                scale={scale}
                className={column.tense === "future" ? "flex-1" : "w-3/5"}
                onOpenCard={(key) => onOpenCard(column.date, key)}
                onEmpty={(position) => onEmptySlot(column.date, position)}
              />
              {column.tense !== "future" && (
                <Lane
                  cards={column.actual}
                  lane="actual"
                  label={`${column.label}, what happened`}
                  scale={scale}
                  className="w-2/5"
                  onOpenCard={(key) => onOpenCard(column.date, key)}
                />
              )}
              {column.nowPosition !== null && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 z-10 h-px bg-foreground"
                  style={{
                    top: Math.round(minuteToPx(scale, column.nowPosition)),
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Lane({
  cards,
  lane,
  label,
  scale,
  className,
  onOpenCard,
  onEmpty,
}: {
  cards: readonly GridCard[];
  lane: "plan" | "actual";
  label: string;
  scale: GridScale;
  className: string;
  onOpenCard: (key: string) => void;
  onEmpty?: (position: number) => void;
}) {
  return (
    <div
      role="list"
      aria-label={label}
      className={cn("relative", className, onEmpty && "cursor-copy")}
      onClick={(event) => {
        if (onEmpty === undefined || event.target !== event.currentTarget) {
          return;
        }
        const top = event.currentTarget.getBoundingClientRect().top;
        onEmpty(pxToMinute(scale, event.clientY - top));
      }}
    >
      {cards.map((card) => {
        const box = scaledBox(scale, card.top, card.height);
        return (
          <div role="listitem" key={card.key}>
            <BlockCard
              blockKey={card.key}
              lane={lane}
              title={card.title}
              focus={undefined}
              icon={card.icon}
              colorKey={card.colorKey}
              time={card.time}
              name={card.name}
              top={box.top}
              height={box.height}
              state={card.state}
              hasNote={false}
              selected={false}
              cutTop={card.cutTop}
              cutBottom={card.cutBottom}
              compact
              onOpen={() => onOpenCard(card.key)}
            />
          </div>
        );
      })}
    </div>
  );
}
