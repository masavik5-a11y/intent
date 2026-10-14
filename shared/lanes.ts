// The two lanes of a day, plan and actual, and the rule that nothing in one lane
// overlaps (docs/PRD.md, section 7, rule 6).

import {
  addDays,
  daysBetween,
  MINUTE_STEP,
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

/** Where a moment sits in minutes from the midnight of `origin`. */
export function minuteFrom(origin: DateKey, at: LocalMoment): number {
  return daysBetween(origin, at.date) * MINUTES_PER_DAY + at.minute;
}

/**
 * The stretch of a planned span that is still free in the actual lane: its start
 * pushed past any entry that covers it, and its end brought forward to the first
 * entry that starts inside it. In minutes from the midnight of `plan.date`. Null when
 * the lane already covers the whole plan.
 */
function freeStretch(
  plan: LaneSpan,
  lane: readonly LaneSpan[],
): { start: number; end: number } | null {
  const taken = lane
    .map((entry) => spanBounds(plan.date, entry))
    .sort((a, b) => a.start - b.start);
  let start = plan.startMin;
  const planEnd = plan.startMin + plan.durationMin;
  // Sorted by start, so a chain of entries pushes the start past each in turn.
  for (const entry of taken) {
    if (entry.start <= start && start < entry.end) start = entry.end;
  }
  let end = planEnd;
  for (const entry of taken) {
    if (start < entry.start && entry.start < end) end = entry.start;
  }
  return start < end ? { start, end } : null;
}

/**
 * Where an actual entry for a planned span begins: its planned start, pushed past
 * whatever already ran into it in the actual lane. Null when the lane covers the whole
 * plan. In minutes from the midnight of `plan.date`.
 */
export function actualStartFor(
  plan: LaneSpan,
  lane: readonly LaneSpan[],
): number | null {
  return freeStretch(plan, lane)?.start ?? null;
}

/**
 * The actual times Done records for a planned span (PRD section 7, rule 5): the plan,
 * with the start pushed past whatever already ran into it in the actual lane, keeping
 * the planned end; ended early where another entry begins inside it; and on a block
 * still running at `now`, ending now, at the 5-minute mark below it (at least 5
 * minutes long). Null when no 5 minutes of the plan are free. `lane` is the actual
 * lane around the span without the block itself, as for findOverlap.
 */
export function defaultActual(
  plan: LaneSpan,
  lane: readonly LaneSpan[],
  now: LocalMoment,
): LaneSpan | null {
  const free = freeStretch(plan, lane);
  if (free === null) return null;
  const nowStep =
    Math.floor(minuteFrom(plan.date, now) / MINUTE_STEP) * MINUTE_STEP;
  const end = Math.min(free.end, Math.max(nowStep, free.start + MINUTE_STEP));
  if (end - free.start < MINUTE_STEP) return null;
  return {
    date: plan.date,
    startMin: free.start,
    durationMin: end - free.start,
  };
}

/**
 * What a running block has recorded so far, minute by minute: where Done would start
 * it, up to `now` (not rounded, so the bar grows every minute). Null before it has
 * any time of its own. Done at this moment records the same, rounded.
 */
export function liveActual(
  plan: LaneSpan,
  lane: readonly LaneSpan[],
  now: LocalMoment,
): LaneSpan | null {
  const free = freeStretch(plan, lane);
  if (free === null) return null;
  const end = Math.min(free.end, minuteFrom(plan.date, now));
  if (end <= free.start) return null;
  return {
    date: plan.date,
    startMin: free.start,
    durationMin: end - free.start,
  };
}

/**
 * Untracked time (PRD section 7, rule 8): the stretches of `window` that no entry of
 * the actual lane covers, at least `minLength` minutes long. In minutes from the
 * midnight of `window.date`, so a stretch after midnight starts from 1440 on.
 */
export function untrackedGaps(
  lane: readonly LaneSpan[],
  window: LaneSpan,
  minLength = 0,
): LaneSpan[] {
  const windowEnd = window.startMin + window.durationMin;
  const taken = lane
    .map((entry) => spanBounds(window.date, entry))
    .sort((a, b) => a.start - b.start);
  const gaps: LaneSpan[] = [];
  const addGap = (start: number, end: number) => {
    if (end - start > 0 && end - start >= minLength) {
      gaps.push({
        date: window.date,
        startMin: start,
        durationMin: end - start,
      });
    }
  };
  let cursor = window.startMin;
  for (const entry of taken) {
    if (cursor >= windowEnd) break;
    if (entry.end <= cursor) continue;
    if (entry.start > cursor) addGap(cursor, Math.min(entry.start, windowEnd));
    cursor = Math.max(cursor, entry.end);
  }
  if (cursor < windowEnd) addGap(cursor, windowEnd);
  return gaps;
}
