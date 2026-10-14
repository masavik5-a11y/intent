import { hasPlan, isRunning, liveActualLane, planLaneOf } from "@shared/blocks";
import { gridSegment, type GridSegment } from "@shared/grid";
import type { LaneSpan } from "@shared/lanes";
import {
  addDays,
  dateKeyParts,
  formatDayLabel,
  formatDuration,
  formatTimeRange,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  minutesToLabel,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import type { Doc, PlannedBlockDoc } from "@/lib/api";

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
  block: PlannedBlockDoc;
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
  for (const entry of planLaneOf(blocks)) {
    const segment = gridSegment(date, gridStartMin, entry);
    if (segment !== null) items.push({ block: entry.block, segment });
  }
  return items.sort((a, b) => a.segment.top - b.segment.top);
}

/**
 * How a card looks (DESIGN.md section 4). In the plan lane: still to come, running,
 * done, partly done or skipped. In the actual lane: what was recorded, the running
 * block's growing bar, or an unplanned entry.
 */
export type CardState =
  | "planned"
  | "current"
  | "done"
  | "partial"
  | "skipped"
  | "recorded"
  | "live"
  | "unplanned";

/** A plan-lane card's state at `now`. */
export function planCardState(
  block: Doc<"blocks">,
  now: LocalMoment,
): CardState {
  if (isRunning(block, now)) return "current";
  return block.status;
}

export interface ActualItem {
  block: Doc<"blocks">;
  /** What the lane shows of it, in minutes from the midnight of `span.date`. */
  span: LaneSpan;
  segment: GridSegment;
  /** The running block, growing with the now line. */
  live: boolean;
}

/**
 * The actual lane of `date`'s grid at `now`: what was recorded, and the running block
 * up to now (shared/blocks.ts, liveActualLane), top to bottom.
 */
export function actualLane(
  blocks: readonly Doc<"blocks">[],
  date: DateKey,
  gridStartMin: number,
  now: LocalMoment,
): ActualItem[] {
  const items: ActualItem[] = [];
  for (const entry of liveActualLane(blocks, now)) {
    const segment = gridSegment(date, gridStartMin, entry);
    if (segment === null) continue;
    items.push({
      block: entry.block,
      span: {
        date: entry.date,
        startMin: entry.startMin,
        durationMin: entry.durationMin,
      },
      segment,
      live: entry.live,
    });
  }
  return items.sort((a, b) => a.segment.top - b.segment.top);
}

/** An actual-lane card's state. */
export function actualCardState(item: ActualItem): CardState {
  if (item.live) return "live";
  return hasPlan(item.block) ? "recorded" : "unplanned";
}

/**
 * The time an actual card shows: "11:00–11:50"; partly done "25m of 2h · 13:00–13:25";
 * the running block reads "since 13:00"; a tail from the previous grid "until 07:00".
 */
export function actualCardTime(item: ActualItem): string {
  const { block, span, segment, live } = item;
  if (live) return `since ${minutesToLabel(span.startMin)}`;
  const time = segment.startsBefore
    ? `until ${minutesToLabel(span.startMin + span.durationMin)}`
    : formatTimeRange(span.startMin, span.durationMin);
  // Partly done leads with how much, so a narrow lane cuts the range instead.
  return block.status === "partial" && hasPlan(block)
    ? `${formatDuration(span.durationMin)} of ${formatDuration(block.plannedDurationMin)} · ${time}`
    : time;
}

/** What a screen reader says for an actual card: "Gym, 11:00 to 11:50, done". */
export function actualCardName(item: ActualItem): string {
  const { block, span, live } = item;
  const range = formatTimeRange(span.startMin, span.durationMin).replace(
    "–",
    " to ",
  );
  const what = live
    ? `running since ${minutesToLabel(span.startMin)}`
    : `${range}, ${
        !hasPlan(block)
          ? "unplanned"
          : block.status === "partial"
            ? `partly done, ${formatDuration(span.durationMin)} of ${formatDuration(block.plannedDurationMin)}`
            : "done"
      }`;
  return [block.title, block.focus, what]
    .filter((part) => part !== undefined && part !== "")
    .join(", ");
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
export function cardTime(block: PlannedBlockDoc, segment: GridSegment): string {
  const end = block.plannedStartMin + block.plannedDurationMin;
  return segment.startsBefore
    ? `until ${minutesToLabel(end)}`
    : formatTimeRange(block.plannedStartMin, block.plannedDurationMin);
}

/** How a plan card's status is read out; a block still planned says nothing more. */
const STATUS_WORDS: Record<Doc<"blocks">["status"], string | undefined> = {
  planned: undefined,
  done: "done",
  partial: "partly done",
  skipped: "skipped",
};

/**
 * What a screen reader says for a card (DESIGN.md section 11): "Sleep, 23:00 to 07:00,
 * continues into Wed 14 Oct". A block cut by the grid's edge names the day it comes
 * from or goes on into.
 */
export function cardName(
  block: PlannedBlockDoc,
  segment: GridSegment,
  day: DateKey,
): string {
  const range = formatTimeRange(
    block.plannedStartMin,
    block.plannedDurationMin,
  );
  const parts = [
    block.title,
    block.focus,
    range.replace("–", " to "),
    STATUS_WORDS[block.status],
  ];
  if (segment.startsBefore) {
    parts.push(`continues from ${formatDayLabel(addDays(day, -1))}`);
  }
  if (segment.endsAfter) {
    parts.push(`continues into ${formatDayLabel(addDays(day, 1))}`);
  }
  return parts.filter((part) => part !== undefined && part !== "").join(", ");
}
