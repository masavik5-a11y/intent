import { hasStarted, liveActualLane, planLaneOf } from "@shared/blocks";
import { gridPosition, gridSegment } from "@shared/grid";
import { untrackedGaps } from "@shared/lanes";
import type { DayTotals } from "@shared/summary";
import { REFLECTION_FIELDS, type ReflectionField } from "@shared/days";
import {
  addDays,
  formatDayLabel,
  formatDuration,
  formatTimeRange,
  MINUTE_STEP,
  MINUTES_PER_DAY,
  minutesToLabel,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import type { Doc, PlannedBlockDoc } from "@/lib/api";

// The evening review (PRD section 5, R1, R2; DESIGN.md section 7), worked out without
// React: which blocks to resolve, which gaps to fill, when the now panel offers it.

/** The four steps, in order. Every one can be passed with Next (PRD R1). */
export const REVIEW_STEPS = ["resolve", "gaps", "reflect", "tomorrow"] as const;
/** A step, or the end: "Day closed" with the totals. */
export type ReviewStep = (typeof REVIEW_STEPS)[number] | "closed";

export const REVIEW_STEP_LABELS: Record<(typeof REVIEW_STEPS)[number], string> =
  {
    resolve: "Resolve",
    gaps: "Fill gaps",
    reflect: "Reflect",
    tomorrow: "Tomorrow",
  };

export function isReviewStep(value: unknown): value is ReviewStep {
  return value === "closed" || REVIEW_STEPS.some((step) => step === value);
}

/** The step after `step`; the last one leads to the end. */
export function nextStep(step: ReviewStep): ReviewStep {
  const index = REVIEW_STEPS.findIndex((item) => item === step);
  if (index === -1) return "closed";
  return REVIEW_STEPS[index + 1] ?? "closed";
}

/** The step before `step`, or null on the first. */
export function previousStep(step: ReviewStep): ReviewStep | null {
  if (step === "closed") return "tomorrow";
  const index = REVIEW_STEPS.findIndex((item) => item === step);
  return REVIEW_STEPS[index - 1] ?? null;
}

/** "Fill gaps" lists untracked stretches this long or longer (PRD section 5). */
export const MIN_GAP_MIN = 30;

/**
 * The plan-lane blocks that begin in `date`'s grid, top to bottom. A tail from the
 * day before belongs to that day's review, not this one.
 */
function blocksOfDay(
  blocks: readonly Doc<"blocks">[],
  date: DateKey,
  gridStartMin: number,
): PlannedBlockDoc[] {
  return planLaneOf(blocks)
    .map((entry) => ({
      block: entry.block,
      segment: gridSegment(date, gridStartMin, entry),
    }))
    .filter((item) => item.segment !== null && !item.segment.startsBefore)
    .sort((a, b) => (a.segment?.top ?? 0) - (b.segment?.top ?? 0))
    .map((item) => item.block);
}

/**
 * Step 1, Resolve: the day's blocks still marked "planned" that have begun by now. A
 * block still ahead tonight is not asked about.
 */
export function unresolvedBlocks(
  blocks: readonly Doc<"blocks">[],
  date: DateKey,
  gridStartMin: number,
  now: LocalMoment,
): PlannedBlockDoc[] {
  return blocksOfDay(blocks, date, gridStartMin).filter(
    (block) => block.status === "planned" && hasStarted(block, now),
  );
}

/** An untracked stretch offered for labelling, as an entry would record it. */
export interface ReviewGap {
  /** Stable while the gap stays where it is. */
  key: string;
  /** On the calendar day it begins, below 1440, on the 5-minute step. */
  start: LocalMoment;
  durationMin: number;
}

/**
 * Step 2, Fill gaps: the stretches of the day's grid before now that nothing in the
 * actual lane covers, 30 minutes or longer (shared/lanes.ts, untrackedGaps; the
 * running block's bar counts as covered). Each is cut to the 5-minute step, so it can
 * be logged as it is.
 */
export function reviewGaps(
  blocks: readonly Doc<"blocks">[],
  date: DateKey,
  gridStartMin: number,
  now: LocalMoment,
): ReviewGap[] {
  const elapsed = Math.min(
    Math.max(gridPosition(date, gridStartMin, now), 0),
    MINUTES_PER_DAY,
  );
  const gaps = untrackedGaps(
    liveActualLane(blocks, now),
    { date, startMin: gridStartMin, durationMin: elapsed },
    MIN_GAP_MIN,
  );
  const result: ReviewGap[] = [];
  for (const gap of gaps) {
    const start = Math.ceil(gap.startMin / MINUTE_STEP) * MINUTE_STEP;
    const end =
      Math.floor((gap.startMin + gap.durationMin) / MINUTE_STEP) * MINUTE_STEP;
    if (end - start < MINUTE_STEP) continue;
    const days = Math.floor(start / MINUTES_PER_DAY);
    const moment = {
      date: addDays(date, days),
      minute: start - days * MINUTES_PER_DAY,
    };
    result.push({
      key: `${moment.date}-${moment.minute}`,
      start: moment,
      durationMin: end - start,
    });
  }
  return result;
}

/** "13:00–14:10 · 1h 10m" */
export function gapLabel(gap: ReviewGap): string {
  return `${formatTimeRange(gap.start.minute, gap.durationMin)} · ${formatDuration(gap.durationMin)}`;
}

/** How long before the sleep time the now panel starts offering the review. */
export const REVIEW_BEFORE_SLEEP_MIN = 120;

/**
 * Whether the now panel offers the evening review at `now` (decided 2026-10-15): from
 * whichever comes first, the end of the day's last planned block or two hours before
 * the sleep time, until the day is reviewed. The caller checks the reviewed part.
 */
export function reviewOffered({
  blocks,
  date,
  gridStartMin,
  sleepMin,
  now,
}: {
  blocks: readonly Doc<"blocks">[];
  date: DateKey;
  gridStartMin: number;
  sleepMin: number;
  now: LocalMoment;
}): boolean {
  const nowAt = gridPosition(date, gridStartMin, now);
  const sleepAt =
    (((sleepMin - gridStartMin) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  const ends = blocksOfDay(blocks, date, gridStartMin).map(
    (block) =>
      gridPosition(date, gridStartMin, {
        date: block.date,
        minute: block.plannedStartMin,
      }) + block.plannedDurationMin,
  );
  const lastEnd = ends.length === 0 ? Infinity : Math.max(...ends);
  const from = Math.min(lastEnd, sleepAt - REVIEW_BEFORE_SLEEP_MIN);
  return nowAt >= from;
}

/** The end of the review (DESIGN.md section 9): "Day closed. 5h 10m on purpose, 50m drift." */
export function closedLine(totals: DayTotals): string {
  return `Day closed. ${formatDuration(totals.onPurposeMin)} on purpose, ${formatDuration(totals.driftMin)} drift.`;
}

/** Step 4: what the next day holds so far, "4 blocks planned, the first at 07:00". */
export function planSummary(
  blocks: readonly Doc<"blocks">[],
  date: DateKey,
  gridStartMin: number,
): string {
  const day = blocksOfDay(blocks, date, gridStartMin);
  const first = day[0];
  if (first === undefined) return "Nothing planned yet.";
  const count = day.length === 1 ? "1 block" : `${day.length} blocks`;
  return `${count} planned, the first at ${minutesToLabel(first.plannedStartMin)}.`;
}

/** The three prompts (PRD R2), as the review asks them. */
export const REFLECTION_PROMPTS: Record<ReflectionField, string> = {
  wentWell: "What went well?",
  drifted: "Where did time drift, and what triggered it?",
  changeTomorrow: "One change for tomorrow",
};

/** The same, as a past day shows the answers. */
const REFLECTION_LABELS: Record<ReflectionField, string> = {
  wentWell: "Went well",
  drifted: "Where time drifted",
  changeTomorrow: "One change for tomorrow",
};

/**
 * A reviewed day's notes for looking back (PRD R3): the answers given, then the
 * rating and the energy on one line. Empty when nothing was written.
 */
export function reviewNotes(
  day: Doc<"days"> | null | undefined,
): { label: string; text: string }[] {
  if (day === null || day === undefined) return [];
  const notes: { label: string; text: string }[] = [];
  for (const field of REFLECTION_FIELDS) {
    const text = day[field];
    if (text !== undefined) {
      notes.push({ label: REFLECTION_LABELS[field], text });
    }
  }
  const scores = [
    day.rating === undefined ? null : `Day ${day.rating} of 5`,
    day.energy === undefined ? null : `Energy ${day.energy} of 5`,
  ].filter((part) => part !== null);
  if (scores.length > 0) notes.push({ label: "", text: scores.join(" · ") });
  return notes;
}

/** What the reflection step holds while you type. */
export type ReflectionDraft = { [F in ReflectionField]: string } & {
  rating: number | null;
  energy: number | null;
};

/** The reflection as the step opens: what was saved before, else empty. */
export function reflectionDraftOf(
  day: Doc<"days"> | null | undefined,
): ReflectionDraft {
  return {
    wentWell: day?.wentWell ?? "",
    drifted: day?.drifted ?? "",
    changeTomorrow: day?.changeTomorrow ?? "",
    rating: day?.rating ?? null,
    energy: day?.energy ?? null,
  };
}

/** What days.saveReflection gets: only what changed; emptied text is sent as null. */
export type ReflectionChanges = { [F in ReflectionField]?: string | null } & {
  rating?: number | null;
  energy?: number | null;
};

export function reflectionChanges(
  day: Doc<"days"> | null | undefined,
  draft: ReflectionDraft,
): ReflectionChanges {
  const before = reflectionDraftOf(day);
  const changes: ReflectionChanges = {};
  for (const field of REFLECTION_FIELDS) {
    if (draft[field].trim() === before[field].trim()) continue;
    changes[field] = draft[field].trim() === "" ? null : draft[field];
  }
  if (draft.rating !== before.rating) changes.rating = draft.rating;
  if (draft.energy !== before.energy) changes.energy = draft.energy;
  return changes;
}

/** The day after the reviewed one, as its button names it: "tomorrow", "today", or a date. */
export function nextDayName(next: DateKey, today: DateKey): string {
  if (next === addDays(today, 1)) return "tomorrow";
  if (next === today) return "today";
  return formatDayLabel(next);
}

/**
 * The labels a gap offers at once (PRD section 5: an activity, rest, drift): the drift
 * categories, then the rest category, found by its name ("Rest on purpose" is seeded).
 * Everything else is one more tap away. Archived categories are left out.
 */
export function quickGapCategories(
  categories: readonly Doc<"categories">[],
): Doc<"categories">[] {
  const active = categories
    .filter((category) => !category.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const rest = active.find(
    (category) =>
      category.kind === "intentional" && /\brest\b/i.test(category.name),
  );
  return [
    ...active.filter((category) => category.kind === "drift"),
    ...(rest === undefined ? [] : [rest]),
  ];
}
