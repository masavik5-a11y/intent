import {
  actualLaneOf,
  effectiveIntent,
  isRunning,
  planLaneOf,
  planSpan,
} from "@shared/blocks";
import { entriesAfter, liveActual, spanBounds } from "@shared/lanes";
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
  /** Minutes it has had so far, for Partly's quick choices. */
  soFarMin: number;
  /** The activity asks for a draining bar (PRD U2). */
  pressure: boolean;
  intent: NowIntent;
}

export interface NowView {
  /**
   * The block running now: the plan holds this minute and it is not marked yet. Null
   * between blocks, and once the current block is marked done or skipped.
   */
  current: NowCurrent | null;
  /**
   * Between blocks, the block that ended last and is not marked yet, so it can be
   * marked with one tap. Null while a block runs.
   */
  toMark: NowBlock | null;
  /** The next two blocks after now, leaving out those skipped ahead of time. */
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
  const next = entriesAfter(
    lane.filter((entry) => entry.block.status !== "skipped"),
    now,
    UP_NEXT,
  ).map((entry) => describe(entry.block));
  const running = lane.find((entry) => isRunning(entry.block, now));
  if (running === undefined) {
    const ended = lastEndedUnmarked(lane, now);
    return {
      current: null,
      toMark: ended === undefined ? null : describe(ended),
      next,
    };
  }

  const current = describe(running.block);
  const intent = effectiveIntent(running.block, current.activity ?? null);
  const others = blocks.filter((block) => block._id !== running.block._id);
  const soFar = liveActual(planSpan(running.block), actualLaneOf(others), now);
  return {
    toMark: null,
    current: {
      ...current,
      countdown: countdown(running, now),
      soFarMin: soFar?.durationMin ?? 0,
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

/** The unmarked block whose plan ended most recently, at or before `now`. */
function lastEndedUnmarked(
  lane: ReturnType<typeof planLaneOf<PlannedBlockDoc>>,
  now: LocalMoment,
): PlannedBlockDoc | undefined {
  let latest: { block: PlannedBlockDoc; end: number } | undefined;
  for (const entry of lane) {
    if (entry.block.status !== "planned") continue;
    const { end } = spanBounds(now.date, entry);
    if (end > now.minute) continue;
    if (latest === undefined || end > latest.end) {
      latest = { block: entry.block, end };
    }
  }
  return latest?.block;
}

/** "Gym ended at 12:30", for the block left to mark between blocks. */
export function endedText(item: NowBlock): string {
  const { block } = item;
  return `${block.title} ended at ${minutesToLabel(block.plannedStartMin + block.plannedDurationMin)}`;
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
