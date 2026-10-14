import { planEntry } from "@shared/blocks";
import { gridSegment, type GridSegment } from "@shared/grid";
import {
  addDays,
  dateKeyParts,
  formatDayLabel,
  formatTimeRange,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  minutesToLabel,
  type DateKey,
} from "@shared/time";
import type { Doc } from "@/lib/api";

// What the day view shows, worked out without React so it can be tested.

/** "Today · Tue 13 Oct", "Tomorrow · …", "Yesterday · …", else "Thu 15 Oct". */
export function dayTitle(date: DateKey, today: DateKey): string {
  const label = formatDayLabel(date, {
    withYear: dateKeyParts(date).year !== dateKeyParts(today).year,
  });
  if (date === today) return `Today · ${label}`;
  if (date === addDays(today, 1)) return `Tomorrow · ${label}`;
  if (date === addDays(today, -1)) return `Yesterday · ${label}`;
  return label;
}

/** Whether a day is over, under way, or still to come, as the app counts today. */
export function dayTense(
  date: DateKey,
  today: DateKey,
): "past" | "today" | "future" {
  if (date === today) return "today";
  return date < today ? "past" : "future";
}

export interface LaneItem {
  block: Doc<"blocks">;
  segment: GridSegment;
}

/**
 * The plan lane of `date`'s grid: every block with a part inside it, top to bottom.
 * Blocks come from the day before, the day and the day after (blocks.listForDay).
 */
export function planLane(
  blocks: readonly Doc<"blocks">[],
  date: DateKey,
  gridStartMin: number,
): LaneItem[] {
  const items: LaneItem[] = [];
  for (const block of blocks) {
    const entry = planEntry(block);
    const segment = gridSegment(date, gridStartMin, entry);
    if (segment !== null) items.push({ block, segment });
  }
  return items.sort((a, b) => a.segment.top - b.segment.top);
}

/** The item the grid position `position` falls in, if any: the current block. */
export function itemAt(
  items: readonly LaneItem[],
  position: number,
): LaneItem | undefined {
  return items.find(
    ({ segment }) =>
      segment.top <= position && position < segment.top + segment.height,
  );
}

export interface HourMark {
  /** Grid position of the full hour. */
  position: number;
  label: string;
}

/**
 * The full hours inside a grid that starts at `gridStartMin`, with their clock labels.
 * `every` 2 keeps every other one (the phone's labels).
 */
export function hourMarks(gridStartMin: number, every = 1): HourMark[] {
  const first =
    (MINUTES_PER_HOUR - (gridStartMin % MINUTES_PER_HOUR)) % MINUTES_PER_HOUR;
  const marks: HourMark[] = [];
  for (
    let position = first;
    position < MINUTES_PER_DAY;
    position += MINUTES_PER_HOUR * every
  ) {
    marks.push({ position, label: minutesToLabel(gridStartMin + position) });
  }
  return marks;
}

/**
 * The time a card shows. The tail of a block that began in the previous day's grid
 * reads "until 07:00", so it is clearly the rest of something; every other block shows
 * its whole range, "23:00–07:00" included.
 */
export function cardTime(block: Doc<"blocks">, segment: GridSegment): string {
  const end = block.plannedStartMin + block.plannedDurationMin;
  return segment.startsBefore
    ? `until ${minutesToLabel(end)}`
    : formatTimeRange(block.plannedStartMin, block.plannedDurationMin);
}

/**
 * What a screen reader says for a card (DESIGN.md section 11): "Sleep, 23:00 to 07:00,
 * continues into Wed 14 Oct". A block cut by the grid's edge names the day it comes
 * from or goes on into.
 */
export function cardName(
  block: Doc<"blocks">,
  segment: GridSegment,
  day: DateKey,
): string {
  const range = formatTimeRange(
    block.plannedStartMin,
    block.plannedDurationMin,
  );
  const parts = [block.title, block.focus, range.replace("–", " to ")];
  if (segment.startsBefore) {
    parts.push(`continues from ${formatDayLabel(addDays(day, -1))}`);
  }
  if (segment.endsAfter) {
    parts.push(`continues into ${formatDayLabel(addDays(day, 1))}`);
  }
  return parts.filter((part) => part !== undefined && part !== "").join(", ");
}
