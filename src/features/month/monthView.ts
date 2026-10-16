import { hasPlan } from "@shared/blocks";
import { weekStart } from "@shared/pace";
import {
  addDays,
  dateKeyParts,
  minutesToLabel,
  toDateKey,
  type DateKey,
} from "@shared/time";
import type { Doc } from "@/lib/api";

// The month view (PRD P7; DESIGN.md section 7): a calendar of six weeks showing which
// days have blocks of their own. Worked out without React so it can be tested.

/** Six weeks always, so the next month's first days show and the grid never jumps. */
export const MONTH_WEEKS = 6;

/** The first day of the month holding `date`. */
export function monthStart(date: DateKey): DateKey {
  const { year, month } = dateKeyParts(date);
  return toDateKey({ year, month, day: 1 });
}

/** The same day of the month `months` away, kept inside that month: 31 Jan + 1 is 28 Feb. */
export function addMonths(date: DateKey, months: number): DateKey {
  const { year, month, day } = dateKeyParts(date);
  const index = year * 12 + (month - 1) + months;
  const target = { year: Math.floor(index / 12), month: (index % 12) + 1 };
  for (let candidate = day; candidate >= 28; candidate -= 1) {
    try {
      return toDateKey({ ...target, day: candidate });
    } catch {
      // Not a day of that month; try one earlier.
    }
  }
  return toDateKey({ ...target, day: Math.min(day, 28) });
}

/** The 42 days the calendar of `date`'s month shows, from its first week's start. */
export function monthDays(date: DateKey, weekStartsOn: number): DateKey[] {
  const first = weekStart(monthStart(date), weekStartsOn);
  return Array.from({ length: MONTH_WEEKS * 7 }, (_, index) =>
    addDays(first, index),
  );
}

export interface MonthLabel {
  blockId: Doc<"blocks">["_id"];
  /** "14:00 Wedding" */
  text: string;
  colorKey: string;
}

/**
 * The labels of each day (PRD P7): the planned blocks dated that day that no rule
 * made, in the order of the day. Repeating blocks are hidden: they would fill every
 * cell with the same sleep and gym. Unplanned entries are not in a plan.
 */
export function monthLabels(
  blocks: readonly Doc<"blocks">[],
  categories: readonly Doc<"categories">[],
): Map<DateKey, MonthLabel[]> {
  const byDay = new Map<DateKey, (MonthLabel & { start: number })[]>();
  for (const block of blocks) {
    if (!hasPlan(block) || block.recurrenceId !== undefined) continue;
    const category = categories.find((item) => item._id === block.categoryId);
    const list = byDay.get(block.date) ?? [];
    list.push({
      blockId: block._id,
      text: `${minutesToLabel(block.plannedStartMin)} ${block.title}`,
      colorKey: category?.colorKey ?? "gray",
      start: block.plannedStartMin,
    });
    byDay.set(block.date, list);
  }
  const sorted = new Map<DateKey, MonthLabel[]>();
  for (const [day, list] of byDay) {
    sorted.set(
      day,
      list
        .sort((a, b) => a.start - b.start)
        .map(({ start: _start, ...label }) => label),
    );
  }
  return sorted;
}

/** The first `shown` labels, and how many more there are ("+2 more"). */
export function shownLabels(
  labels: readonly MonthLabel[],
  shown: number,
): { labels: MonthLabel[]; more: number } {
  return {
    labels: labels.slice(0, shown),
    more: Math.max(labels.length - shown, 0),
  };
}
