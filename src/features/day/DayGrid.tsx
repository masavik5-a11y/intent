import { useLayoutEffect, useRef, useState } from "react";
import {
  fitPxPerMin,
  PHONE_PX_PER_MIN,
  pxBox,
  wakePosition,
} from "@shared/grid";
import { MINUTES_PER_DAY } from "@shared/time";
import { cn } from "@/lib/utils";
import { BlockCard } from "./BlockCard";
import { hourMarks } from "./dayView";

/** Room for the hour labels left of the lanes. */
const GUTTER_PX = 44;
/** Air above the first hour line and below the last, so their labels are not cut. */
const EDGE_PX = 8;

export interface GridCard {
  key: string;
  title: string;
  focus: string | undefined;
  icon: string | undefined;
  colorKey: string;
  startMin: number;
  durationMin: number;
  /** Grid minutes. */
  top: number;
  height: number;
  current: boolean;
  cutTop: boolean;
  cutBottom: boolean;
}

interface DayGridProps {
  /** The day shown; scrolling resets when it changes. */
  dayKey: string;
  gridStartMin: number;
  wakeMin: number;
  sleepMin: number;
  /** Phone: fixed scale and scrolling. Wider: Fit, the waking day fills the height. */
  isPhone: boolean;
  cards: readonly GridCard[];
  /** Grid position of the now line, on today only. */
  nowPosition: number | null;
  /** From this grid position on, the actual lane is still to come and dimmed. */
  futureFrom: number | null;
  onOpenCard?: (key: string) => void;
}

/** The two-lane hour grid (DESIGN.md section 3). Plan on the left, actual on the right. */
export function DayGrid({
  dayKey,
  gridStartMin,
  wakeMin,
  sleepMin,
  isPhone,
  cards,
  nowPosition,
  futureFrom,
  onOpenCard,
}: DayGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [viewportPx, setViewportPx] = useState(0);
  const scrolledFor = useRef<string | null>(null);

  // The height the lanes can use, for Fit and for scrolling now into view.
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

  const pxPerMin = isPhone
    ? PHONE_PX_PER_MIN
    : fitPxPerMin(Math.max(viewportPx - 2 * EDGE_PX, 0), wakeMin, sleepMin);

  // Open at the wake time, or wherever now is when that is out of view (PRD T2).
  // Once per day shown, so the minute ticking never yanks the view.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null || viewportPx <= 0) return;
    if (scrolledFor.current === dayKey) return;
    scrolledFor.current = dayKey;
    const wakeTop = wakePosition(gridStartMin, wakeMin) * pxPerMin;
    let top = wakeTop;
    if (nowPosition !== null) {
      const nowTop = nowPosition * pxPerMin;
      const visible = nowTop >= wakeTop && nowTop <= wakeTop + viewportPx - 48;
      if (!visible) top = nowTop - viewportPx / 3;
    }
    scroller.scrollTop = Math.max(top, 0);
  }, [dayKey, viewportPx, pxPerMin, gridStartMin, wakeMin, nowPosition]);

  const gridPx = MINUTES_PER_DAY * pxPerMin;
  const laneClass = isPhone ? "" : "flex-1";

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
      <div
        ref={headerRef}
        className="sticky top-0 z-20 flex border-b bg-background text-xs text-muted-foreground"
      >
        <div style={{ width: GUTTER_PX }} className="shrink-0" />
        <div className="flex flex-1 gap-1">
          <div
            className={cn("px-2 py-1.5", laneClass)}
            style={isPhone ? { width: "60%" } : undefined}
          >
            Plan
          </div>
          <div className="flex-1 px-2 py-1.5">Actual</div>
        </div>
      </div>

      <div
        className="relative"
        style={{ height: gridPx, marginTop: EDGE_PX, marginBottom: EDGE_PX }}
      >
        {hourMarks(gridStartMin, isPhone ? 2 : 1).map((mark) => {
          const y = Math.round(mark.position * pxPerMin);
          return (
            <div
              key={mark.position}
              className="pointer-events-none absolute inset-x-0"
              style={{ top: y }}
            >
              <span
                className="absolute -translate-y-1/2 pr-2 text-right text-xs text-muted-foreground tabular-nums"
                style={{ width: GUTTER_PX }}
              >
                {mark.label}
              </span>
              <div
                className="border-t border-border/70"
                style={{ marginLeft: GUTTER_PX }}
              />
            </div>
          );
        })}

        <div
          className="absolute inset-y-0 right-0 flex gap-1"
          style={{ left: GUTTER_PX }}
        >
          <div
            className={cn("relative", laneClass)}
            style={isPhone ? { width: "60%" } : undefined}
            aria-label="Plan"
            role="list"
          >
            {cards.map((card) => {
              const box = pxBox(card.top, card.height, pxPerMin);
              return (
                <div key={card.key} role="listitem">
                  <BlockCard
                    title={card.title}
                    focus={card.focus}
                    icon={card.icon}
                    colorKey={card.colorKey}
                    startMin={card.startMin}
                    durationMin={card.durationMin}
                    top={box.top}
                    height={box.height}
                    current={card.current}
                    cutTop={card.cutTop}
                    cutBottom={card.cutBottom}
                    onOpen={
                      onOpenCard === undefined
                        ? undefined
                        : () => onOpenCard(card.key)
                    }
                  />
                </div>
              );
            })}
          </div>
          <div className="relative flex-1" aria-label="Actual">
            {futureFrom !== null && futureFrom < MINUTES_PER_DAY && (
              <div
                className="absolute inset-x-0 bottom-0 rounded-t-block bg-muted/50"
                style={{ top: Math.round(Math.max(futureFrom, 0) * pxPerMin) }}
              />
            )}
          </div>
        </div>

        {nowPosition !== null && (
          <div
            className="pointer-events-none absolute right-0 z-10 h-px bg-foreground"
            style={{
              top: Math.round(nowPosition * pxPerMin),
              left: GUTTER_PX - 4,
            }}
            aria-hidden="true"
          >
            <span className="absolute -top-[3.5px] -left-1 size-2 rounded-full bg-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
