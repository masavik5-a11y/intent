import {
  actualEntry,
  hasActual,
  hasPlan,
  hasStarted,
  liveActualLane,
  planEntry,
  planLaneOf,
} from "@shared/blocks";
import type { DragLimits, GridSpan } from "@shared/drag";
import { gridPosition, gridSegment, momentAt } from "@shared/grid";
import { minuteFrom, spanBounds, type LaneSpan } from "@shared/lanes";
import {
  daysBetween,
  formatTimeRange,
  MINUTE_STEP,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import type { BlockUpdate, Doc } from "@/lib/api";

// Which blocks a drag may change, and how (PRD section 7, rule 4; decided
// 2026-10-16): the future is edited as plan, what has started as what happened.

export type DragLane = "plan" | "actual";

/** What a drag of one card works with. */
export interface DragSetup {
  origin: GridSpan;
  limits: DragLimits;
  /** The lane's other blocks, in this grid's positions. */
  taken: GridSpan[];
}

interface DragContext {
  blocks: readonly Doc<"blocks">[];
  day: DateKey;
  gridStartMin: number;
  now: LocalMoment;
  tense: "past" | "today" | "future";
  /** "Edit plan" was chosen for a past day. */
  planUnlocked: boolean;
}

const GRID_END = MINUTES_PER_DAY;
const LAST_START = MINUTES_PER_DAY - MINUTE_STEP;

/** A span's place in `day`'s grid, not cut at its edges. */
function position(
  day: DateKey,
  gridStartMin: number,
  span: LaneSpan,
): GridSpan {
  const { start } = spanBounds(day, span);
  return { top: start - gridStartMin, height: span.durationMin };
}

/** Whether a span lies wholly inside `day`'s grid: a card cut at an edge stays put. */
function whole(day: DateKey, gridStartMin: number, span: LaneSpan): boolean {
  const segment = gridSegment(day, gridStartMin, span);
  return segment !== null && !segment.startsBefore && !segment.endsAfter;
}

/**
 * How a block's card in `lane` can be dragged, or null when it cannot:
 *
 * - Plan lane: a block still ahead on today or a day to come, or any block on a past
 *   day once "Edit plan" is chosen. On today it starts no earlier than now. A block
 *   that has started is changed through what happened, in the actual lane.
 * - Actual lane: what was recorded (done, partly done, an unplanned entry), not the
 *   running block's growing bar, ending no later than now and never over that bar.
 *   Nothing on a day to come.
 * - A card cut at the grid's edge (it crosses into another day's grid) does not move;
 *   block detail changes it.
 */
export function dragSetup(
  block: Doc<"blocks">,
  lane: DragLane,
  { blocks, day, gridStartMin, now, tense, planUnlocked }: DragContext,
): DragSetup | null {
  const others = blocks.filter((other) => other._id !== block._id);
  const nowPosition = gridPosition(day, gridStartMin, now);
  if (lane === "plan") {
    if (!hasPlan(block)) return null;
    const editable =
      tense === "future" ||
      (tense === "today" && !hasStarted(block, now)) ||
      (tense === "past" && planUnlocked);
    const span = planEntry(block);
    if (!editable || !whole(day, gridStartMin, span)) return null;
    const origin = position(day, gridStartMin, span);
    const minTop =
      tense === "today"
        ? Math.min(
            Math.ceil(nowPosition / MINUTE_STEP) * MINUTE_STEP,
            origin.top,
          )
        : 0;
    let limits = { minTop, maxTop: LAST_START, maxBottom: GRID_END };
    if (hasActual(block)) {
      // Its actual times count from its date's midnight, so its plan keeps the date.
      const midnight =
        daysBetween(day, block.date) * MINUTES_PER_DAY - gridStartMin;
      limits = {
        ...limits,
        minTop: Math.max(limits.minTop, midnight),
        maxTop: Math.min(limits.maxTop, midnight + LAST_START),
      };
    }
    return {
      origin,
      limits,
      taken: planLaneOf(others).map((entry) =>
        position(day, gridStartMin, entry),
      ),
    };
  }

  if (!hasActual(block) || tense === "future") return null;
  const span = actualEntry(block);
  if (!whole(day, gridStartMin, span)) return null;
  const origin = position(day, gridStartMin, span);
  let minTop = 0;
  let maxBottom = GRID_END;
  if (hasPlan(block)) {
    // A planned block's actual start counts from its own day's midnight, up to the
    // end of the next day (ARCHITECTURE.md section 4).
    const midnight =
      daysBetween(day, block.date) * MINUTES_PER_DAY - gridStartMin;
    minTop = Math.max(minTop, midnight);
    maxBottom = Math.min(maxBottom, midnight + 2 * MINUTES_PER_DAY);
  }
  if (tense === "today") {
    const nowStep = Math.floor(nowPosition / MINUTE_STEP) * MINUTE_STEP;
    maxBottom = Math.min(
      maxBottom,
      Math.max(nowStep, origin.top + origin.height),
    );
  }
  return {
    origin,
    limits: { minTop, maxTop: LAST_START, maxBottom },
    // The running block's growing bar counts as taken: it is what Done would record.
    taken: liveActualLane(others, now).map((entry) =>
      position(day, gridStartMin, entry),
    ),
  };
}

/** "14:30–16:00", for the card while it is dragged. */
export function dragTimeLabel(
  day: DateKey,
  gridStartMin: number,
  span: GridSpan,
): string {
  return formatTimeRange(
    momentAt(day, gridStartMin, span.top).minute,
    span.height,
  );
}

/**
 * The blocks.update arguments for a drop at `span` in `lane`, only what changed; null
 * when nothing did. A plan may move to the next calendar day (after midnight, at the
 * bottom of the grid); a planned block's actual times count from its own day.
 */
export function dropUpdate(
  block: Doc<"blocks">,
  lane: DragLane,
  span: GridSpan,
  day: DateKey,
  gridStartMin: number,
): BlockUpdate | null {
  const at = momentAt(day, gridStartMin, span.top);
  const update: BlockUpdate = { blockId: block._id };
  if (lane === "plan") {
    if (!hasPlan(block)) return null;
    if (at.date !== block.date) update.date = at.date;
    if (at.minute !== block.plannedStartMin) update.plannedStartMin = at.minute;
    if (span.height !== block.plannedDurationMin) {
      update.plannedDurationMin = span.height;
    }
  } else if (hasPlan(block)) {
    const start = minuteFrom(block.date, at);
    if (start !== block.actualStartMin) update.actualStartMin = start;
    if (span.height !== block.actualDurationMin) {
      update.actualDurationMin = span.height;
    }
  } else {
    if (at.date !== block.date) update.date = at.date;
    if (at.minute !== block.actualStartMin) update.actualStartMin = at.minute;
    if (span.height !== block.actualDurationMin) {
      update.actualDurationMin = span.height;
    }
  }
  return Object.keys(update).length === 1 ? null : update;
}
