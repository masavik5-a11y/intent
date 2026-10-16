import {
  blockSpan,
  hasPlan,
  isRunning,
  liveActualLane,
  planLaneOf,
} from "@shared/blocks";
import { gridSegment, type GridSegment } from "@shared/grid";
import { minuteFrom, untrackedGaps, type LaneSpan } from "@shared/lanes";
import { isSleepCategory } from "@shared/categories";
import type { DayTotals } from "@shared/summary";
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

/**
 * The title an actual card shows. An unplanned entry in a drift category names the
 * category first, "Drift · phone" (DESIGN.md section 4); one without a title of its
 * own is just "Drift".
 */
export function entryTitle(
  block: Doc<"blocks">,
  category: Doc<"categories"> | undefined,
): string {
  if (hasPlan(block) || category?.kind !== "drift") return block.title;
  return block.title === category.name
    ? block.title
    : `${category.name} · ${block.title}`;
}

/** A stretch of the actual lane in grid minutes, such as untracked time. */
export interface GridStretch {
  top: number;
  height: number;
}

/**
 * Untracked time in `date`'s grid (PRD U4, section 7 rule 8): the stretches before now
 * that nothing in the actual lane covers, the running block's bar counting as covered.
 * On today it ends at this minute, so it grows with the now line; a past day is
 * untracked wherever nothing was recorded; a day to come has none.
 */
export function untrackedStretches(
  blocks: readonly Doc<"blocks">[],
  date: DateKey,
  gridStartMin: number,
  now: LocalMoment,
): GridStretch[] {
  const elapsed = Math.min(
    Math.max(minuteFrom(date, now) - gridStartMin, 0),
    MINUTES_PER_DAY,
  );
  return untrackedGaps(liveActualLane(blocks, now), {
    date,
    startMin: gridStartMin,
    durationMin: elapsed,
  }).map((gap) => ({
    top: gap.startMin - gridStartMin,
    height: gap.durationMin,
  }));
}

export interface DayNote {
  block: Doc<"blocks">;
  /** "11:00–12:30": the plan, or for an unplanned entry what happened. */
  time: string;
  /** "11:00", where it begins. */
  start: string;
  text: string;
}

/**
 * The notes written on the day's blocks (PRD A5, R3), in the order of the day. A block
 * that crosses into the next day's grid is listed on the day it begins.
 */
export function dayNotes(
  blocks: readonly Doc<"blocks">[],
  date: DateKey,
  gridStartMin: number,
): DayNote[] {
  const notes: (DayNote & { top: number })[] = [];
  for (const block of blocks) {
    if (block.note === undefined) continue;
    const span = blockSpan(block);
    const segment = gridSegment(date, gridStartMin, span);
    if (segment === null || segment.startsBefore) continue;
    notes.push({
      block,
      time: formatTimeRange(span.startMin, span.durationMin),
      start: minutesToLabel(span.startMin),
      text: block.note,
      top: segment.top,
    });
  }
  return notes
    .sort((a, b) => a.top - b.top)
    .map(({ top: _top, ...note }) => note);
}

/** The three totals as the day shows them, with their labels (DESIGN.md section 4a). */
export function totalsItems(
  totals: DayTotals,
): { label: string; value: string }[] {
  return [
    { label: "On purpose", value: formatDuration(totals.onPurposeMin) },
    { label: "Drift", value: formatDuration(totals.driftMin) },
    { label: "Untracked", value: formatDuration(totals.untrackedMin) },
  ];
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
  const note = block.note === undefined ? undefined : `note: ${block.note}`;
  return [block.title, block.focus, what, note]
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
    block.note === undefined ? undefined : `note: ${block.note}`,
  ];
  if (segment.startsBefore) {
    parts.push(`continues from ${formatDayLabel(addDays(day, -1))}`);
  }
  if (segment.endsAfter) {
    parts.push(`continues into ${formatDayLabel(addDays(day, 1))}`);
  }
  return parts.filter((part) => part !== undefined && part !== "").join(", ");
}

/**
 * The stretches of `date`'s grid that long sleep fills, for the grid to draw
 * compressed (DESIGN.md section 3): the plan lane's blocks in a sleep category.
 * The grid folds those long enough (shared/grid.ts, sleepFolds).
 */
export function sleepStretches(
  blocks: readonly Doc<"blocks">[],
  categories: readonly Doc<"categories">[],
  date: DateKey,
  gridStartMin: number,
): GridStretch[] {
  const sleeping = new Set(
    categories.filter(isSleepCategory).map((category) => category._id),
  );
  return planLane(blocks, date, gridStartMin)
    .filter((item) => sleeping.has(item.block.categoryId))
    .map(({ segment }) => ({ top: segment.top, height: segment.height }));
}
