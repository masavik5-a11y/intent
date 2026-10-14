import { effectiveIntent, planLaneOf } from "@shared/blocks";
import { entriesAfter, entryAt } from "@shared/lanes";
import { countdown, type Countdown } from "@shared/pace";
import {
  formatDuration,
  formatTimeRange,
  MINUTES_PER_HOUR,
  minutesToLabel,
  type LocalMoment,
} from "@shared/time";
import type { Doc, PlannedBlockDoc } from "@/lib/api";

// What the now panel shows (DESIGN.md section 4a), worked out without React.

/** A block with what it needs to be drawn: its activity and category. */
export interface NowBlock {
  block: PlannedBlockDoc;
  activity: Doc<"activities"> | undefined;
  category: Doc<"categories"> | undefined;
}

/**
 * The intent the now panel may show. The cost of skipping is not here on purpose: it
 * is shown only when asked for, never on the Today screen (PRD V4).
 */
export interface NowIntent {
  doneWhen: string | null;
  why: string | null;
  how: string | null;
  ifThen: string | null;
  minimumVersion: string | null;
}

export interface NowCurrent extends NowBlock {
  countdown: Countdown;
  /** The activity asks for a draining bar (PRD U2). */
  pressure: boolean;
  intent: NowIntent;
}

export interface NowView {
  /** The block the plan says is running, or null between blocks. */
  current: NowCurrent | null;
  /** The next two blocks after now. */
  next: NowBlock[];
}

const UP_NEXT = 2;

/** The now panel's content at `now`, from the blocks loaded around today. */
export function nowView(
  blocks: readonly Doc<"blocks">[],
  activities: readonly Doc<"activities">[],
  categories: readonly Doc<"categories">[],
  now: LocalMoment,
): NowView {
  const lane = planLaneOf(blocks);
  const describe = (block: PlannedBlockDoc): NowBlock => ({
    block,
    activity: activities.find((item) => item._id === block.activityId),
    category: categories.find((item) => item._id === block.categoryId),
  });
  const running = entryAt(lane, now);
  const next = entriesAfter(lane, now, UP_NEXT).map((entry) =>
    describe(entry.block),
  );
  if (running === null) return { current: null, next };

  const current = describe(running.block);
  const intent = effectiveIntent(running.block, current.activity ?? null);
  return {
    current: {
      ...current,
      countdown: countdown(running, now),
      pressure: current.activity?.pressure ?? false,
      intent: {
        doneWhen: intent.doneWhen?.text ?? null,
        why: intent.why?.text ?? null,
        how: intent.how?.text ?? null,
        ifThen: intent.ifThen?.text ?? null,
        minimumVersion: intent.minimumVersion?.text ?? null,
      },
    },
    next,
  };
}

/** "42 min", or "1h 12m" from an hour on. */
export function formatLeft(minutes: number): string {
  return minutes < MINUTES_PER_HOUR
    ? `${minutes} min`
    : formatDuration(minutes);
}

/** The status line: "Now · 42 min left", or "Time's up · 5 min over". */
export function statusText(left: Countdown): string {
  if (left.minutesLeft > 0) return `Now · ${formatLeft(left.minutesLeft)} left`;
  return `Time's up · ${formatLeft(left.minutesOver)} over`;
}

/** The last ten minutes, when the minutes left are set in medium weight. */
export function inLastTenMinutes(left: Countdown): boolean {
  return left.minutesLeft > 0 && left.minutesLeft <= 10;
}

/** Between blocks: "Free until 14:00", or a calm line when nothing is left. */
export function freeText(next: NowBlock | undefined): string {
  return next === undefined
    ? "Nothing more planned today."
    : `Free until ${minutesToLabel(next.block.plannedStartMin)}`;
}

/** "Gym · 11:00–12:30" for the up-next list. */
export function nextLine(item: NowBlock): string {
  const { block } = item;
  return `${block.title} · ${formatTimeRange(block.plannedStartMin, block.plannedDurationMin)}`;
}
