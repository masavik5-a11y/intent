import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { DragMode, GridSpan } from "@shared/drag";
import {
  fitPxPerMin,
  gridHeightPx,
  insideFold,
  minuteToPx,
  PHONE_PX_PER_MIN,
  pxToMinute,
  scaledBox,
  sleepFolds,
  ZOOM_LEVELS,
  ZOOM_PX_PER_MIN,
  type GridScale,
  type ZoomLevel,
  wakePosition,
} from "@shared/grid";
import { MINUTES_PER_DAY } from "@shared/time";
import { cn } from "@/lib/utils";
import { BlockCard } from "./BlockCard";
import {
  hourMarks,
  newKeys,
  type CardState,
  type GridStretch,
} from "./dayView";

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
  time: string;
  name: string;
  /** Grid minutes. */
  top: number;
  height: number;
  state: CardState;
  /** Its detail is open. */
  selected: boolean;
  cutTop: boolean;
  cutBottom: boolean;
  /** Opens block detail when pressed. */
  openable: boolean;
  /** The block has a note (PRD A5): a small mark beside the title. */
  hasNote: boolean;
  /** It can be dragged in its lane (PRD T9); unset, it stays put. */
  drag?: { lane: "plan" | "actual" } | undefined;
}

/** What the grid asks while a card is dragged, and tells when it is dropped. */
export interface GridDrag {
  /** Where the card would land and the time it would show; null to stop. */
  preview: (
    key: string,
    lane: "plan" | "actual",
    mode: DragMode,
    deltaMin: number,
  ) => { span: GridSpan; time: string } | null;
  drop: (
    key: string,
    lane: "plan" | "actual",
    mode: DragMode,
    deltaMin: number,
  ) => void;
}

/** A touch must rest this long on a card before it drags, so a swipe still scrolls. */
const LONG_PRESS_MS = 450;
/** A touch that moves this far before the long press is a scroll. */
const TOUCH_SLOP_PX = 8;
/** A mouse drag starts after this much movement; less is a click. */
const MOUSE_SLOP_PX = 4;

interface Gesture {
  key: string;
  lane: "plan" | "actual";
  mode: DragMode;
  pointerId: number;
  startY: number;
  /** The lane's top on screen when the drag began: pixels from it are grid minutes. */
  laneTop: number;
  touch: boolean;
  active: boolean;
  deltaMin: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  element: HTMLElement;
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
  /** What happened: the actual lane (DESIGN.md section 3). */
  actualCards: readonly GridCard[];
  /** Untracked time before now, drawn as a hatch under the actual lane's cards. */
  untracked: readonly GridStretch[];
  /** Grid position of the now line, on today only. */
  nowPosition: number | null;
  /** From this grid position on, the actual lane is still to come and dimmed. */
  futureFrom: number | null;
  /**
   * The day's data has loaded, so nothing above the grid will still appear and push
   * it down. The first scroll waits for this.
   */
  settled: boolean;
  onOpenCard?: (key: string) => void;
  /** A click on the plan lane where there is no block, at this grid position. */
  onEmptySlot?: (position: number) => void;
  /** A click on the actual lane before now where nothing is recorded. */
  onEmptyActualSlot?: (position: number) => void;
  /**
   * Planning ahead shows the plan lane alone, full width (DESIGN.md section 7, "Plan
   * tomorrow"). Default: both lanes.
   */
  planOnly?: boolean;
  /** Dragging cards that carry `drag` (PRD T9). */
  onDrag?: GridDrag;
  /** The desktop zoom (DESIGN.md section 3); the phone always scrolls at its own scale. */
  zoom?: ZoomLevel;
  onZoom?: (level: ZoomLevel) => void;
  /** Stretches of long sleep, drawn compressed (sleepStretches in dayView.ts). */
  sleep?: readonly GridStretch[];
}

/** The two-lane hour grid (DESIGN.md section 3). Plan on the left, actual on the right. */
export function DayGrid({
  dayKey,
  gridStartMin,
  wakeMin,
  sleepMin,
  isPhone,
  cards,
  actualCards,
  untracked,
  nowPosition,
  futureFrom,
  settled,
  onOpenCard,
  onEmptySlot,
  onEmptyActualSlot,
  planOnly = false,
  onDrag,
  zoom = "fit",
  onZoom,
  sleep = [],
}: DayGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const swallowClick = useRef(false);
  // Cards that have just entered the actual lane slide in once (DESIGN.md section 6).
  // Nothing moves until the day has loaded, so opening a day stays still.
  const actualKeys = actualCards.map((card) => card.key);
  const [seenActual, setSeenActual] = useState<ReadonlySet<string> | null>(
    null,
  );
  const [entering, setEntering] = useState<ReadonlySet<string>>(new Set());
  if (settled && seenActual === null) {
    setSeenActual(new Set(actualKeys));
  } else {
    const fresh = newKeys(seenActual, actualKeys);
    if (fresh.length > 0) {
      setSeenActual(new Set([...(seenActual ?? []), ...fresh]));
      setEntering(new Set([...entering, ...fresh]));
    }
  }
  const [dragged, setDragged] = useState<{
    key: string;
    span: GridSpan;
    time: string;
  } | null>(null);
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
    : zoom === "fit"
      ? fitPxPerMin(Math.max(viewportPx - 2 * EDGE_PX, 0), wakeMin, sleepMin)
      : ZOOM_PX_PER_MIN[zoom];
  // Long sleep is drawn compressed; every minute-to-pixel step goes through this.
  // Kept the same object while the folds are, so effects that use it do not rerun.
  const foldsKey = JSON.stringify(sleepFolds(sleep, pxPerMin));
  const scale = useMemo<GridScale>(
    () => ({
      pxPerMin,
      folds: JSON.parse(foldsKey) as GridScale["folds"],
    }),
    [pxPerMin, foldsKey],
  );
  const toPx = (position: number) => Math.round(minuteToPx(scale, position));

  // Dragging (PRD T9). A mouse drags once it moves a few pixels; a touch drags after
  // resting on a card, so a swipe over the grid still scrolls. Esc puts it back.
  function stopGesture() {
    const current = gesture.current;
    if (current !== null) {
      clearTimeout(current.timer);
      if (current.element.hasPointerCapture(current.pointerId)) {
        current.element.releasePointerCapture(current.pointerId);
      }
    }
    gesture.current = null;
    setDragged(null);
  }

  function showDrag(current: Gesture) {
    const preview = onDrag?.preview(
      current.key,
      current.lane,
      current.mode,
      current.deltaMin,
    );
    if (preview === null || preview === undefined) {
      stopGesture();
      return;
    }
    setDragged({ key: current.key, ...preview });
  }

  function activate(current: Gesture) {
    current.active = true;
    current.element.setPointerCapture(current.pointerId);
    showDrag(current);
  }

  function onCardPointerDown(event: ReactPointerEvent, card: GridCard) {
    if (onDrag === undefined || card.drag === undefined) return;
    if (event.button !== 0 || gesture.current !== null) return;
    const target = event.target as HTMLElement;
    const element = event.currentTarget as HTMLElement;
    const current: Gesture = {
      key: card.key,
      lane: card.drag.lane,
      mode: target.closest("[data-resize]") === null ? "move" : "resize",
      pointerId: event.pointerId,
      startY: event.clientY,
      laneTop: element.closest("[role=list]")?.getBoundingClientRect().top ?? 0,
      touch: event.pointerType === "touch",
      active: false,
      deltaMin: 0,
      timer: undefined,
      element,
    };
    gesture.current = current;
    if (current.touch) {
      current.timer = setTimeout(() => {
        if (gesture.current === current) activate(current);
      }, LONG_PRESS_MS);
    }
  }

  function onCardPointerMove(event: ReactPointerEvent) {
    const current = gesture.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    const movedPx = event.clientY - current.startY;
    if (!current.active) {
      if (current.touch) {
        if (Math.abs(movedPx) > TOUCH_SLOP_PX) stopGesture();
        return;
      }
      if (Math.abs(movedPx) < MOUSE_SLOP_PX) return;
      activate(current);
    }
    current.deltaMin =
      pxToMinute(scale, event.clientY - current.laneTop) -
      pxToMinute(scale, current.startY - current.laneTop);
    showDrag(current);
  }

  function onCardPointerUp(event: ReactPointerEvent) {
    const current = gesture.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    if (current.active) {
      swallowClick.current = true;
      onDrag?.drop(current.key, current.lane, current.mode, current.deltaMin);
    }
    stopGesture();
  }

  // While a touch drags, the page must not scroll under it; and Esc cancels a drag.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    const onTouchMove = (event: TouchEvent) => {
      if (gesture.current?.active === true) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current !== null) {
        event.preventDefault();
        event.stopPropagation();
        stopGesture();
      }
    };
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      scroller.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  const dragHandlers = {
    onPointerDown: onCardPointerDown,
    onPointerMove: onCardPointerMove,
    onPointerUp: onCardPointerUp,
    onPointerCancel: () => stopGesture(),
    /** True once for the click that ends a drag, which must not open the block. */
    consumeClick: () => {
      const swallow = swallowClick.current;
      swallowClick.current = false;
      return swallow;
    },
  };

  // Open at the wake time, or wherever now is when that is out of view (PRD T2).
  // Once per day shown, so the minute ticking never yanks the view.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null || viewportPx <= 0 || !settled) return;
    // Again after a zoom change, so now stays in view at the new scale.
    const view = `${dayKey}:${zoom}`;
    if (scrolledFor.current === view) return;
    scrolledFor.current = view;
    // Measured now rather than taken from state: whatever appeared above the grid
    // in this render has already shrunk it.
    const height =
      scroller.clientHeight - (headerRef.current?.offsetHeight ?? 0);
    const wakeTop = minuteToPx(scale, wakePosition(gridStartMin, wakeMin));
    let top = wakeTop;
    if (nowPosition !== null) {
      const nowTop = minuteToPx(scale, nowPosition);
      const visible = nowTop >= wakeTop && nowTop <= wakeTop + height - 48;
      if (!visible) top = nowTop - height / 3;
    }
    scroller.scrollTop = Math.max(top, 0);
  }, [
    dayKey,
    zoom,
    settled,
    viewportPx,
    scale,
    gridStartMin,
    wakeMin,
    nowPosition,
  ]);

  const gridPx = gridHeightPx(scale);
  const laneClass = isPhone && !planOnly ? "" : "flex-1";
  const planWidth = isPhone && !planOnly ? { width: "60%" } : undefined;

  return (
    <div
      ref={scrollRef}
      data-day-grid=""
      className="relative min-h-0 flex-1 overflow-y-auto"
    >
      <div
        ref={headerRef}
        className="sticky top-0 z-20 flex border-b bg-background text-xs text-muted-foreground"
      >
        <div style={{ width: GUTTER_PX }} className="shrink-0" />
        <div className="flex flex-1 gap-1">
          <div className={cn("px-2 py-1.5", laneClass)} style={planWidth}>
            Plan
          </div>
          {!planOnly && <div className="flex-1 px-2 py-1.5">Actual</div>}
        </div>
        {!isPhone && onZoom !== undefined && (
          <ZoomSwitch zoom={zoom} onZoom={onZoom} />
        )}
      </div>

      <div
        className="relative"
        style={{ height: gridPx, marginTop: EDGE_PX, marginBottom: EDGE_PX }}
      >
        {hourMarks(gridStartMin, isPhone ? 2 : 1)
          .filter((mark) => !insideFold(scale, mark.position))
          .map((mark) => {
            const y = toPx(mark.position);
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
          {/* Clicking empty plan lane opens quick add there. The keyboard has the
              Add block button and N for the same thing. */}
          <div
            className={cn("relative", laneClass, onEmptySlot && "cursor-copy")}
            style={planWidth}
            aria-label="Plan"
            role="list"
            onClick={(event) => {
              if (event.target !== event.currentTarget) return;
              const top = event.currentTarget.getBoundingClientRect().top;
              onEmptySlot?.(pxToMinute(scale, event.clientY - top));
            }}
          >
            {cards.map((card) => (
              <GridBlock
                key={card.key}
                card={card}
                scale={scale}
                onOpenCard={onOpenCard}
                lane="plan"
                drag={dragHandlers}
                dragged={
                  dragged?.key === card.key && card.drag?.lane === "plan"
                    ? dragged
                    : undefined
                }
              />
            ))}
          </div>
          {/* Clicking empty actual lane before now logs an entry there; the future
              part is covered by its dimmed overlay, so it does not. L and the now
              panel's "Log what I'm doing" do the same from the keyboard. */}
          {!planOnly && (
            <div
              className={cn(
                "relative flex-1",
                onEmptyActualSlot && "cursor-copy",
              )}
              aria-label="Actual"
              role="list"
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const top = event.currentTarget.getBoundingClientRect().top;
                onEmptyActualSlot?.(pxToMinute(scale, event.clientY - top));
              }}
            >
              {futureFrom !== null && futureFrom < MINUTES_PER_DAY && (
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 rounded-t-block bg-muted/50"
                  style={{
                    top: toPx(Math.max(futureFrom, 0)),
                  }}
                />
              )}
              {untracked.map((stretch) => {
                const box = scaledBox(scale, stretch.top, stretch.height);
                // Clicks pass through to the lane, which logs an entry there.
                return (
                  <div
                    key={stretch.top}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-1 rounded-block bg-hatch"
                    style={{ top: box.top, height: box.height }}
                  />
                );
              })}
              {actualCards.map((card) => (
                <GridBlock
                  key={card.key}
                  card={card}
                  scale={scale}
                  onOpenCard={onOpenCard}
                  lane="actual"
                  entering={entering.has(card.key)}
                  onEntered={() =>
                    setEntering((keys) => {
                      const rest = new Set(keys);
                      rest.delete(card.key);
                      return rest;
                    })
                  }
                  drag={dragHandlers}
                  dragged={
                    dragged?.key === card.key && card.drag?.lane === "actual"
                      ? dragged
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        {nowPosition !== null && (
          <div
            data-now-line=""
            className="pointer-events-none absolute right-0 z-10 h-px bg-foreground transition-[top] duration-200 motion-reduce:transition-none"
            style={{
              top: toPx(nowPosition),
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

/** One card placed in a lane, in pixels. */
function GridBlock({
  card,
  scale,
  onOpenCard,
  lane,
  entering = false,
  onEntered,
  drag,
  dragged,
}: {
  card: GridCard;
  lane: "plan" | "actual";
  entering?: boolean;
  onEntered?: () => void;
  scale: GridScale;
  onOpenCard: ((key: string) => void) | undefined;
  drag: {
    onPointerDown: (event: ReactPointerEvent, card: GridCard) => void;
    onPointerMove: (event: ReactPointerEvent) => void;
    onPointerUp: (event: ReactPointerEvent) => void;
    onPointerCancel: () => void;
    consumeClick: () => boolean;
  };
  /** Where it is while being dragged. */
  dragged: { span: GridSpan; time: string } | undefined;
}) {
  const box = scaledBox(
    scale,
    dragged?.span.top ?? card.top,
    dragged?.span.height ?? card.height,
  );
  const draggable = card.drag !== undefined;
  return (
    <div
      role="listitem"
      className={cn(
        draggable &&
          "touch-manipulation select-none [-webkit-touch-callout:none]",
        dragged !== undefined && "relative z-30",
      )}
      onPointerDown={(event) => drag.onPointerDown(event, card)}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onContextMenu={(event) => {
        if (draggable) event.preventDefault();
      }}
      onClickCapture={(event) => {
        // The click that ends a drag does not open the block.
        if (drag.consumeClick()) event.stopPropagation();
      }}
    >
      <BlockCard
        blockKey={card.key}
        lane={lane}
        title={card.title}
        focus={card.focus}
        icon={card.icon}
        colorKey={card.colorKey}
        time={dragged?.time ?? card.time}
        name={card.name}
        top={box.top}
        height={box.height}
        state={card.state}
        hasNote={card.hasNote}
        selected={card.selected}
        lifted={dragged !== undefined}
        entering={entering}
        onEntered={onEntered}
        cutTop={card.cutTop}
        cutBottom={card.cutBottom}
        onOpen={
          onOpenCard === undefined || !card.openable
            ? undefined
            : () => onOpenCard(card.key)
        }
      />
      {draggable && (
        // The bottom edge resizes. Drawn over the card's last pixels.
        <div
          data-resize=""
          aria-hidden="true"
          className="absolute inset-x-3 z-10 h-2 cursor-ns-resize"
          style={{ top: box.top + box.height - 6 }}
        />
      )}
    </div>
  );
}

const ZOOM_LABELS: Record<ZoomLevel, string> = {
  fit: "Fit",
  comfortable: "Comfortable",
  detailed: "Detailed",
};

/** The desktop zoom, at the end of the lane header (DESIGN.md section 3). */
function ZoomSwitch({
  zoom,
  onZoom,
}: {
  zoom: ZoomLevel;
  onZoom: (level: ZoomLevel) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Zoom"
      className="absolute inset-y-0 right-2 flex items-center gap-0.5"
    >
      {ZOOM_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={level === zoom}
          onClick={() => onZoom(level)}
          className={cn(
            "rounded-sm px-1.5 py-0.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            level === zoom
              ? "bg-muted text-foreground"
              : "hover:text-foreground",
          )}
        >
          {ZOOM_LABELS[level]}
        </button>
      ))}
    </div>
  );
}
