import { actualLaneOf, liveActualLane } from "@shared/blocks";
import { gridPosition, momentAt, slotStart, wakePosition } from "@shared/grid";
import { spanBounds } from "@shared/lanes";
import {
  MINUTE_STEP,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import type { Doc } from "@/lib/api";

// Logging an unplanned entry (DESIGN.md section 7, "Log unplanned"): pure parts.

/** A new entry's length when nothing else suggests one. */
export const DEFAULT_ENTRY_MIN = 30;
/** A click in the actual lane snaps to this many minutes, as in the plan lane. */
const CLICK_SNAP_MIN = 15;

/**
 * The categories the form offers, Drift first (PRD A3: drift is one tap away), then
 * the rest in their usual order. Archived ones are left out.
 */
export function logCategories(
  categories: readonly Doc<"categories">[],
): Doc<"categories">[] {
  const active = categories.filter((category) => !category.archived);
  const byOrder = (a: Doc<"categories">, b: Doc<"categories">) =>
    a.sortOrder - b.sortOrder;
  return [
    ...active.filter((category) => category.kind === "drift").sort(byOrder),
    ...active.filter((category) => category.kind !== "drift").sort(byOrder),
  ];
}

export interface EntrySpan {
  start: LocalMoment;
  durationMin: number;
}

/**
 * Where a new entry starts and how long it lasts before anything is typed.
 *
 * - From a click in the actual lane: that slot (or where an entry covering it ends),
 *   for 30 minutes, ending sooner at the next thing recorded or, today, at now.
 * - Today otherwise: "from the last entry until now". The last entry is the latest
 *   end of anything recorded, or the start of the running block's bar (its time so
 *   far is what the entry would describe). With nothing before now, the last 30
 *   minutes. At least 5 minutes.
 * - Another day: after the last thing recorded on it, or at the wake time, 30 minutes.
 */
export function defaultEntrySpan({
  day,
  gridStartMin,
  wakeMin,
  now,
  isToday,
  blocks,
  position,
}: {
  day: DateKey;
  gridStartMin: number;
  wakeMin: number;
  now: LocalMoment;
  isToday: boolean;
  blocks: readonly Doc<"blocks">[];
  /** A clicked grid position in the actual lane, or null. */
  position: number | null;
}): EntrySpan {
  const toPosition = (span: { date: DateKey; startMin: number }) =>
    spanBounds(day, { ...span, durationMin: 0 }).start - gridStartMin;
  const recorded = actualLaneOf(blocks).map((entry) => {
    const start = toPosition(entry);
    return { start, end: start + entry.durationMin };
  });
  const nowAt = isToday
    ? Math.floor(gridPosition(day, gridStartMin, now) / MINUTE_STEP) *
      MINUTE_STEP
    : null;
  const span = (start: number, length: number): EntrySpan => ({
    start: momentAt(day, gridStartMin, start),
    durationMin: Math.min(Math.max(length, MINUTE_STEP), MINUTES_PER_DAY),
  });

  if (position !== null) {
    let start = slotStart(position, CLICK_SNAP_MIN);
    // The quarter hour clicked may begin inside an entry that ends off the quarter
    // (10:12 below one that ended at 10:10): start where that entry ends.
    for (const entry of [...recorded].sort((a, b) => a.start - b.start)) {
      if (entry.start <= start && start < entry.end) start = entry.end;
    }
    let end = start + DEFAULT_ENTRY_MIN;
    for (const entry of recorded) {
      if (entry.start > start && entry.start < end) end = entry.start;
    }
    if (nowAt !== null && start < nowAt && nowAt < end) end = nowAt;
    return span(start, end - start);
  }

  if (nowAt !== null) {
    const live = liveActualLane(blocks, now).find((entry) => entry.live);
    // Every entry that began before now counts, even one recorded past now (Partly
    // with more minutes than have gone by): the new entry starts after it.
    const boundaries = [
      ...recorded
        .filter((entry) => entry.start < nowAt)
        .map((entry) => entry.end),
      ...(live === undefined ? [] : [toPosition(live)]),
    ].filter((at) => at >= 0);
    const start =
      boundaries.length === 0
        ? Math.max(nowAt - DEFAULT_ENTRY_MIN, 0)
        : Math.max(...boundaries);
    return span(start, nowAt - start);
  }

  const ends = recorded
    .map((entry) => entry.end)
    .filter((end) => end >= 0 && end < MINUTES_PER_DAY);
  return span(
    ends.length === 0 ? wakePosition(gridStartMin, wakeMin) : Math.max(...ends),
    DEFAULT_ENTRY_MIN,
  );
}
