// Day totals (PRD T8, and section 7, rules 8 and 9). Insight aggregation over many days
// joins this file in M8.

import { liveActualLane, type BlockTimes } from "./blocks";
import type { CategoryKind } from "./categories";
import { minuteFrom, spanBounds, untrackedGaps } from "./lanes";
import { MINUTES_PER_DAY, type DateKey, type LocalMoment } from "./time";

export interface DayTotals {
  /** Actual minutes in `intentional` categories. */
  onPurposeMin: number;
  /** Actual minutes in `drift` categories. */
  driftMin: number;
  /** Actual minutes in `maintenance` categories: neither of the above. */
  maintenanceMin: number;
  /** Minutes before now that nothing in the actual lane covers. Not drift. */
  untrackedMin: number;
}

/**
 * The totals of `day`'s grid, the 24 hours from `gridStartMin` on that day, as they
 * stand at `now`. Counts what was recorded and the running block up to now. Untracked
 * time runs from the grid's start until now; on a past day until the grid's end, on a
 * future day it is zero. `blocks` are those loaded for the day view (the day before,
 * the day, the day after).
 */
export function summarizeDay<
  C,
  B extends BlockTimes & { _id: unknown; categoryId: C },
>(
  blocks: readonly B[],
  kindOf: (categoryId: C) => CategoryKind | undefined,
  day: DateKey,
  gridStartMin: number,
  now: LocalMoment,
): DayTotals {
  const windowStart = gridStartMin;
  const windowEnd = gridStartMin + MINUTES_PER_DAY;
  const lane = liveActualLane(blocks, now);

  const totals: DayTotals = {
    onPurposeMin: 0,
    driftMin: 0,
    maintenanceMin: 0,
    untrackedMin: 0,
  };
  for (const entry of lane) {
    const { start, end } = spanBounds(day, entry);
    const minutes = Math.min(end, windowEnd) - Math.max(start, windowStart);
    if (minutes <= 0) continue;
    switch (kindOf(entry.block.categoryId)) {
      case "intentional":
        totals.onPurposeMin += minutes;
        break;
      case "drift":
        totals.driftMin += minutes;
        break;
      case "maintenance":
        totals.maintenanceMin += minutes;
        break;
      case undefined:
        break;
    }
  }

  const elapsedEnd = Math.min(
    Math.max(minuteFrom(day, now), windowStart),
    windowEnd,
  );
  totals.untrackedMin = untrackedGaps(lane, {
    date: day,
    startMin: windowStart,
    durationMin: elapsedEnd - windowStart,
  }).reduce((sum, gap) => sum + gap.durationMin, 0);
  return totals;
}
