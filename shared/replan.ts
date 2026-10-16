// Replanning a day that slips (PRD T11): shift the rest of today by some minutes, or
// push one block to tomorrow. Pure, so the screen's preview and the server's change
// are the same decision (decided 2026-10-16).
//
// Neither ever makes an overlap, and neither moves a block it was not asked to move:
// a shift that would land a block on something staying put is refused as a whole.

import {
  hasPlan,
  hasStarted,
  planLaneOf,
  type BlockTimes,
  type WithPlan,
} from "./blocks";
import { gridPosition, gridSegment, momentAt, momentOnGrid } from "./grid";
import { findOverlap, firstFreeSpan, spanBounds, type LaneSpan } from "./lanes";
import {
  addDays,
  MINUTE_STEP,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "./time";

/** The most a shift may move, either way. */
export const MAX_SHIFT_MIN = 12 * 60;

type Block = BlockTimes & { _id: unknown; title: string };

/** A block's plan moved to a new place. */
export interface Move<B> {
  block: WithPlan<B>;
  to: LaneSpan;
}

export type ShiftResult<B> =
  | { moves: Move<B>[] }
  | { problem: "NOTHING" }
  | { problem: "INVALID" }
  /** A block would land before now or past the end of today's grid. */
  | { problem: "OUT_OF_DAY"; block: WithPlan<B> }
  /** A block would land on one that stays: `by`. */
  | { problem: "IN_THE_WAY"; block: WithPlan<B>; by: WithPlan<B> };

/**
 * The blocks "the rest of today" means, in the order of the day: in `day`'s grid,
 * with a plan, still "planned", not started at `now`, and not `anchored` (sleep is
 * kept to the clock: a slipping afternoon does not move bedtime). Marked blocks, the
 * running block and blocks already begun stay where they are.
 */
export function restOfDay<B extends Block>(
  blocks: readonly B[],
  day: DateKey,
  gridStartMin: number,
  now: LocalMoment,
  anchored: (block: B) => boolean = () => false,
): WithPlan<B>[] {
  return blocks
    .filter(hasPlan)
    .filter((block) => block.status === "planned" && !hasStarted(block, now))
    .filter((block) => !anchored(block))
    .map((block) => ({
      block,
      segment: gridSegment(day, gridStartMin, planSpan(block)),
    }))
    .filter(({ segment }) => segment !== null && !segment.startsBefore)
    .sort((a, b) => (a.segment?.top ?? 0) - (b.segment?.top ?? 0))
    .map(({ block }) => block);
}

function planSpan(block: WithPlan<BlockTimes>): LaneSpan {
  return {
    date: block.date,
    startMin: block.plannedStartMin,
    durationMin: block.plannedDurationMin,
  };
}

/**
 * Shifts the rest of today (`restOfDay`) by `minutes`, later when positive, earlier
 * when negative. Every moved block keeps its length; its start stays on today's grid,
 * not before now. `blocks` are those loaded around the day (the day before to the day
 * after next), so tomorrow morning's blocks count as in the way too. Blocks that are
 * `anchored` stay and can be in the way.
 */
export function shiftRest<B extends Block>(
  blocks: readonly B[],
  day: DateKey,
  gridStartMin: number,
  now: LocalMoment,
  minutes: number,
  anchored: (block: B) => boolean = () => false,
): ShiftResult<B> {
  if (
    !Number.isInteger(minutes) ||
    minutes % MINUTE_STEP !== 0 ||
    minutes === 0 ||
    Math.abs(minutes) > MAX_SHIFT_MIN
  ) {
    return { problem: "INVALID" };
  }
  const moving = restOfDay(blocks, day, gridStartMin, now, anchored);
  if (moving.length === 0) return { problem: "NOTHING" };
  const movingIds = new Set(moving.map((block) => block._id));
  const staying = planLaneOf(
    blocks.filter((block) => !movingIds.has(block._id)),
  );
  const nowPosition = gridPosition(day, gridStartMin, now);
  const moves: Move<B>[] = [];
  for (const block of moving) {
    const position =
      spanBounds(day, planSpan(block)).start - gridStartMin + minutes;
    if (position < nowPosition || position >= MINUTES_PER_DAY) {
      return { problem: "OUT_OF_DAY", block };
    }
    const at = momentAt(day, gridStartMin, position);
    const to = {
      date: at.date,
      startMin: at.minute,
      durationMin: block.plannedDurationMin,
    };
    const by = findOverlap(to, staying);
    if (by !== null) return { problem: "IN_THE_WAY", block, by: by.block };
    moves.push({ block, to });
  }
  return { moves };
}

export type PushResult<B> =
  /** A block still ahead moves to tomorrow. */
  | { kind: "move"; block: WithPlan<B>; to: LaneSpan }
  /**
   * A block that has begun is not moved: it stays today, skipped, and a copy is
   * planned tomorrow, so what the plan said today is kept (PRD section 7, rule 4).
   */
  | { kind: "copy"; block: WithPlan<B>; to: LaneSpan }
  | { problem: "MARKED" | "NO_ROOM" };

/**
 * Where "Move to tomorrow" puts a block of `day`'s grid: the same clock time on the
 * next day's grid, or the first free time after it there that holds its length;
 * none, and it cannot go. Only a block not marked yet goes. `blocks` are those loaded
 * around the next day (its day before to the day after).
 */
export function pushToTomorrow<B extends Block>(
  block: B,
  blocks: readonly B[],
  day: DateKey,
  gridStartMin: number,
  now: LocalMoment,
): PushResult<B> {
  if (!hasPlan(block) || block.status !== "planned") {
    return { problem: "MARKED" };
  }
  const tomorrow = addDays(day, 1);
  const clock = momentOnGrid(tomorrow, gridStartMin, block.plannedStartMin);
  const wanted = {
    date: clock.date,
    startMin: clock.minute,
    durationMin: block.plannedDurationMin,
  };
  const lane = planLaneOf(blocks.filter((other) => other._id !== block._id));
  const free = firstFreeSpan(wanted, lane);
  // It must still start inside tomorrow's grid.
  if (
    free === null ||
    gridPosition(tomorrow, gridStartMin, {
      date: free.date,
      minute: free.startMin,
    }) >= MINUTES_PER_DAY
  ) {
    return { problem: "NO_ROOM" };
  }
  return hasStarted(block, now)
    ? { kind: "copy", block, to: free }
    : { kind: "move", block, to: free };
}
