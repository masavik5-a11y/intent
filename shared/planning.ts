// Planning ahead (PRD P1, P2): copying a day's plan from another date.

import { hasPlan, type BlockTimes, type WithPlan } from "./blocks";
import { gridSegment } from "./grid";
import type { LaneSpan } from "./lanes";
import { addDays, daysBetween, type DateKey } from "./time";

/** The fields of a block that tell whether it came from a repeating rule. */
export interface FromRule {
  recurrenceId?: unknown;
}

/**
 * What "Copy from a date" takes from `from` (decided 2026-10-15): the plan lane of
 * that day's grid, every block that begins in it, in the order of the day. Blocks a
 * repeating rule made are left out, because the rule puts them on the new day itself;
 * a tail from the day before belongs to that day. Unplanned entries have no plan.
 */
export function copyablePlan<B extends BlockTimes & FromRule>(
  blocks: readonly B[],
  from: DateKey,
  gridStartMin: number,
): WithPlan<B>[] {
  return blocks
    .filter(hasPlan)
    .filter((block) => block.recurrenceId === undefined)
    .map((block) => ({
      block,
      segment: gridSegment(from, gridStartMin, {
        date: block.date,
        startMin: block.plannedStartMin,
        durationMin: block.plannedDurationMin,
      }),
    }))
    .filter((item) => item.segment !== null && !item.segment.startsBefore)
    .sort((a, b) => (a.segment?.top ?? 0) - (b.segment?.top ?? 0))
    .map((item) => item.block);
}

/** How many blocks of `from` a rule made: the ones a copy leaves out. */
export function ruleBlockCount<B extends BlockTimes & FromRule>(
  blocks: readonly B[],
  from: DateKey,
  gridStartMin: number,
): number {
  return blocks
    .filter(hasPlan)
    .filter((block) => block.recurrenceId !== undefined)
    .filter((block) => {
      const segment = gridSegment(from, gridStartMin, {
        date: block.date,
        startMin: block.plannedStartMin,
        durationMin: block.plannedDurationMin,
      });
      return segment !== null && !segment.startsBefore;
    }).length;
}

/**
 * A block's plan moved from `from`'s grid to the same place in `to`'s: the same clock
 * times, its date shifted by the days between them, so a block after midnight stays
 * after midnight.
 */
export function shiftedPlan(
  block: WithPlan<BlockTimes>,
  from: DateKey,
  to: DateKey,
): LaneSpan {
  return {
    date: addDays(block.date, daysBetween(from, to)),
    startMin: block.plannedStartMin,
    durationMin: block.plannedDurationMin,
  };
}
