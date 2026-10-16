// Urgency, computed and never stored (docs/ARCHITECTURE.md, section 16): how much of a
// block is left, weekly pace against a target, and days left to a goal.

import { liveActualLane, type BlockTimes } from "./blocks";
import { spanBounds, type LaneSpan } from "./lanes";
import {
  addDays,
  daysBetween,
  formatDuration,
  MINUTE_STEP,
  MINUTES_PER_DAY,
  weekdayOf,
  type DateKey,
  type LocalMoment,
} from "./time";

export interface Countdown {
  /** Minutes until the planned end; 0 once it has passed. */
  minutesLeft: number;
  /** minutesLeft as a share of the planned length, 1 at the start, 0 at the end. */
  fractionLeft: number;
  /** Minutes past the planned end; 0 until then. */
  minutesOver: number;
}

/**
 * How much of a planned span is left at `now`: the draining bar on the now panel
 * (PRD U2). Before the span starts the whole of it is left.
 */
export function countdown(span: LaneSpan, now: LocalMoment): Countdown {
  const { start, end } = spanBounds(now.date, span);
  const elapsed = Math.min(Math.max(now.minute - start, 0), span.durationMin);
  const minutesLeft = span.durationMin - elapsed;
  return {
    minutesLeft,
    fractionLeft: span.durationMin === 0 ? 0 : minutesLeft / span.durationMin,
    minutesOver: Math.max(now.minute - end, 0),
  };
}

// ---------------------------------------------------------------------------
// Weekly pace and days left (PRD U5, U6, and section 7, "Pace rules")
// ---------------------------------------------------------------------------

export const DAYS_PER_WEEK = 7;

/** The first day of the week holding `date`, the week starting on `weekStartsOn`. */
export function weekStart(date: DateKey, weekStartsOn: number): DateKey {
  const back = (weekdayOf(date) - weekStartsOn + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return addDays(date, -back);
}

/** The seven days of the week holding `date`, in order. */
export function weekDays(date: DateKey, weekStartsOn: number): DateKey[] {
  const first = weekStart(date, weekStartsOn);
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
    addDays(first, index),
  );
}

/**
 * Days of `today`'s week that count as completed (pace rule 2): those before today,
 * and today itself once its review is closed. So the morning never starts "behind".
 */
export function completedDays(
  today: DateKey,
  weekStartsOn: number,
  todayReviewed: boolean,
): number {
  const before = daysBetween(weekStart(today, weekStartsOn), today);
  return before + (todayReviewed ? 1 : 0);
}

/**
 * Actual minutes per category in the grids of the week starting on `first` (pace
 * rule 1): seven day grids from `gridStartMin` on `first`, counting the running block
 * up to `now`. `blocks` holds the blocks dated from the day before `first` to the
 * day after the week, so tails across its edges are cut where the week begins and
 * ends.
 */
export function weekProgress<
  C,
  B extends BlockTimes & { _id: unknown; categoryId: C },
>(
  blocks: readonly B[],
  first: DateKey,
  gridStartMin: number,
  now: LocalMoment,
): Map<C, number> {
  const windowStart = gridStartMin;
  const windowEnd = gridStartMin + DAYS_PER_WEEK * MINUTES_PER_DAY;
  const minutes = new Map<C, number>();
  for (const entry of liveActualLane(blocks, now)) {
    const { start, end } = spanBounds(first, entry);
    const inside = Math.min(end, windowEnd) - Math.max(start, windowStart);
    if (inside <= 0) continue;
    const category = entry.block.categoryId;
    minutes.set(category, (minutes.get(category) ?? 0) + inside);
  }
  return minutes;
}

export interface WeeklyPace {
  targetMin: number;
  progressMin: number;
  /** Target × completed days ÷ 7, to the minute. */
  expectedMin: number;
  /** Days left in the week, today included until its review is closed. */
  daysLeft: number;
  /**
   * Where progress stands: the target is reached, or it is ahead of or behind the
   * expected amount by `differenceMin`, or within five minutes of it.
   */
  state: "reached" | "ahead" | "behind" | "onPace";
  /** Progress minus expected, rounded to 5 minutes; positive when ahead. */
  differenceMin: number;
  /**
   * When behind with days left: minutes a day, rounded up to 5, that reach the target
   * by the end of the week (pace rule 3). Null otherwise.
   */
  perDayMin: number | null;
}

/** Weekly pace against a target (PRD U5; section 7, pace rules 2 and 3). */
export function weeklyPace(
  targetMin: number,
  progressMin: number,
  completed: number,
): WeeklyPace {
  const done = Math.min(Math.max(completed, 0), DAYS_PER_WEEK);
  const expectedMin = Math.round((targetMin * done) / DAYS_PER_WEEK);
  const daysLeft = DAYS_PER_WEEK - done;
  const differenceMin = roundTo(progressMin - expectedMin, MINUTE_STEP);
  const base = { targetMin, progressMin, expectedMin, daysLeft, differenceMin };
  if (progressMin >= targetMin) {
    return { ...base, state: "reached", perDayMin: null };
  }
  if (differenceMin === 0) return { ...base, state: "onPace", perDayMin: null };
  if (differenceMin > 0) return { ...base, state: "ahead", perDayMin: null };
  const perDayMin =
    daysLeft === 0
      ? null
      : Math.ceil((targetMin - progressMin) / daysLeft / MINUTE_STEP) *
        MINUTE_STEP;
  return { ...base, state: "behind", perDayMin };
}

function roundTo(value: number, step: number): number {
  // Math.round rounds -2.5 up; round the size, then put the sign back.
  const rounded = Math.round(Math.abs(value) / step) * step;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/**
 * The pace line (DESIGN.md sections 4a and 9), a plain fact with no judgement:
 * "Deep work 9h of 15h · 3 days left · behind by 1h 30m · 2h a day".
 */
export function paceText(name: string, pace: WeeklyPace): string {
  const parts = [
    `${name} ${formatDuration(pace.progressMin)} of ${formatDuration(pace.targetMin)}`,
    daysLeftInWeekText(pace.daysLeft),
  ];
  switch (pace.state) {
    case "reached":
      parts.push("target reached");
      break;
    case "onPace":
      parts.push("on pace");
      break;
    case "ahead":
      parts.push(`ahead by ${formatDuration(pace.differenceMin)}`);
      break;
    case "behind":
      parts.push(`behind by ${formatDuration(-pace.differenceMin)}`);
      if (pace.perDayMin !== null) {
        parts.push(`${formatDuration(pace.perDayMin)} a day`);
      }
      break;
  }
  return parts.join(" · ");
}

function daysLeftInWeekText(days: number): string {
  if (days === 0) return "week closed";
  return days === 1 ? "1 day left" : `${days} days left`;
}

/**
 * Calendar days from `today` to a goal's due date (PRD section 7, pace rule 4):
 * 0 on the day, negative once it is past.
 */
export function daysLeft(dueDate: DateKey, today: DateKey): number {
  return daysBetween(today, dueDate);
}

/** "38 days left", "1 day left", "due today", "3 days over": plain facts. */
export function daysLeftText(days: number): string {
  if (days === 0) return "due today";
  if (days < 0) return days === -1 ? "1 day over" : `${-days} days over`;
  return days === 1 ? "1 day left" : `${days} days left`;
}
