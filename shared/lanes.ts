// The two lanes of a day, plan and actual, and the rule that nothing in one lane
// overlaps (docs/PRD.md, section 7, rule 6).

import {
  addDays,
  daysBetween,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "./time";

/**
 * A stretch of floating local time: a calendar day and minutes from its midnight. The
 * end may pass 1440, which is a span that crosses midnight into the next day.
 */
export interface LaneSpan {
  date: DateKey;
  startMin: number;
  durationMin: number;
}

/** A span that belongs to something with an id, such as a block in the plan lane. */
export interface LaneEntry<Id> extends LaneSpan {
  id: Id;
}

/** Start and end of a span in minutes from the midnight of `origin`. */
export function spanBounds(
  origin: DateKey,
  span: LaneSpan,
): { start: number; end: number } {
  const start =
    daysBetween(origin, span.date) * MINUTES_PER_DAY + span.startMin;
  return { start, end: start + span.durationMin };
}

/** Whether two spans share any minute. Touching, end to start, is not overlapping. */
export function spansOverlap(a: LaneSpan, b: LaneSpan): boolean {
  const first = spanBounds(a.date, a);
  const second = spanBounds(a.date, b);
  return first.start < second.end && second.start < first.end;
}

/**
 * The days whose entries can overlap a span on `date`: the day before (its spans may
 * cross midnight into `date`), the day itself, and the day after (a span on `date` may
 * cross into it). A span is at most a day long, so nothing further away can collide.
 */
export function overlapWindow(date: DateKey): [DateKey, DateKey, DateKey] {
  return [addDays(date, -1), date, addDays(date, 1)];
}

/**
 * The entry of `lane` that `candidate` would collide with, or null when it fits. When
 * several collide, the one that starts first. An entry with the candidate's own id is
 * skipped, so an edit can be checked against the lane it already sits in. `lane` must
 * hold the entries of every day in overlapWindow(candidate.date).
 */
export function findOverlap<Id, E extends LaneEntry<Id>>(
  candidate: LaneSpan & { id?: Id },
  lane: readonly E[],
): E | null {
  let first: { entry: E; start: number } | null = null;
  for (const entry of lane) {
    if (candidate.id !== undefined && entry.id === candidate.id) continue;
    if (!spansOverlap(candidate, entry)) continue;
    const { start } = spanBounds(candidate.date, entry);
    if (first === null || start < first.start) first = { entry, start };
  }
  return first?.entry ?? null;
}

/**
 * The first place at or after `span`'s start where a span of its length fits, moving
 * past each entry it would collide with. Null when nothing fits within a day of the
 * start. `lane` holds the entries around the candidate, as for findOverlap.
 */
export function firstFreeSpan<Id, E extends LaneEntry<Id>>(
  span: LaneSpan,
  lane: readonly E[],
): LaneSpan | null {
  let candidate = span;
  // Each step moves past a different entry, so this many steps are always enough.
  for (let step = 0; step <= lane.length; step += 1) {
    const blocking = findOverlap(candidate, lane);
    if (blocking === null) return candidate;
    // Start again where the blocking entry ends, counted from the candidate's day.
    const end = spanBounds(candidate.date, blocking).end;
    const days = Math.floor(end / MINUTES_PER_DAY);
    candidate = {
      date: addDays(candidate.date, days),
      startMin: end - days * MINUTES_PER_DAY,
      durationMin: span.durationMin,
    };
    const moved = spanBounds(span.date, candidate).start - span.startMin;
    if (moved > MINUTES_PER_DAY) return null;
  }
  return null;
}

/** The entry that holds the moment `at`, if any: the current block. */
export function entryAt<Id, E extends LaneEntry<Id>>(
  lane: readonly E[],
  at: LocalMoment,
): E | null {
  return (
    lane.find((entry) => {
      const { start, end } = spanBounds(at.date, entry);
      return start <= at.minute && at.minute < end;
    }) ?? null
  );
}

/** Up to `count` entries that start after `at`, soonest first: up next. */
export function entriesAfter<Id, E extends LaneEntry<Id>>(
  lane: readonly E[],
  at: LocalMoment,
  count: number,
): E[] {
  return lane
    .map((entry) => ({ entry, start: spanBounds(at.date, entry).start }))
    .filter(({ start }) => start > at.minute)
    .sort((a, b) => a.start - b.start)
    .slice(0, count)
    .map(({ entry }) => entry);
}
