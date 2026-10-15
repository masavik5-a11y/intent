// Repeating blocks (PRD P3; docs/ARCHITECTURE.md, section 10). A rule says on which
// weekdays, from which date and until which, a block repeats; it is materialised into
// ordinary blocks. This file answers which dates a rule produces and which of them
// become blocks.

import { placeSpans, type LaneSpan } from "./lanes";
import {
  addDays,
  daysBetween,
  formatDayLabel,
  isValidDuration,
  isValidMinute,
  weekdayOf,
  type DateKey,
  type Weekday,
} from "./time";

/** When a block repeats: weekdays (0 = Sunday … 6 = Saturday), from, until. */
export interface RepeatRule {
  weekdays: readonly number[];
  startDate: DateKey;
  /** The last date it may produce; unset, it goes on. */
  endDate?: DateKey | undefined;
}

/** A rule with the plan each occurrence gets. */
export interface RulePlan extends RepeatRule {
  startMin: number;
  durationMin: number;
}

/**
 * The daily run materialises through UTC today plus this many days: today + 14 in
 * every time zone, the day it starts on being the 15th (decided 2026-10-15).
 */
export const MATERIALIZE_AHEAD_DAYS = 15;

/** Opening a date further ahead materialises it on demand, up to this far from UTC today. */
export const ON_DEMAND_MAX_DAYS = 366;

/** The most dates one call looks at, so a rule can never loop for long. */
const MAX_SPAN_DAYS = 2 * ON_DEMAND_MAX_DAYS;

export const ALL_WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

/** At least one weekday, each a whole number 0 to 6, none twice. */
export function isValidWeekdays(weekdays: readonly number[]): boolean {
  return (
    weekdays.length > 0 &&
    weekdays.every(isWeekday) &&
    new Set(weekdays).size === weekdays.length
  );
}

/** The weekdays sorted, each once. */
export function normalizeWeekdays(weekdays: readonly number[]): Weekday[] {
  return [...new Set(weekdays.filter(isWeekday))].sort((a, b) => a - b);
}

/**
 * What is wrong with a rule, or null: weekdays as above, a start on the 5-minute step
 * within the day and a length of 5 minutes to 24 hours, as a block's plan, and an end
 * date, if any, not before the start date.
 */
export function ruleProblem(
  rule: RulePlan,
): "INVALID_INPUT" | "INVALID_TIME" | null {
  if (!isValidWeekdays(rule.weekdays)) return "INVALID_INPUT";
  if (rule.endDate !== undefined && rule.endDate < rule.startDate) {
    return "INVALID_INPUT";
  }
  if (!isValidMinute(rule.startMin) || !isValidDuration(rule.durationMin)) {
    return "INVALID_TIME";
  }
  return null;
}

/**
 * The dates a rule produces from `from` to `to`, both included: those on its
 * weekdays, not before its start, not after its end. At most two years are looked at.
 */
export function ruleDates(
  rule: RepeatRule,
  from: DateKey,
  to: DateKey,
): DateKey[] {
  const first = from < rule.startDate ? rule.startDate : from;
  const last =
    rule.endDate !== undefined && rule.endDate < to ? rule.endDate : to;
  const span = daysBetween(first, last);
  if (span < 0) return [];
  const dates: DateKey[] = [];
  for (let offset = 0; offset <= Math.min(span, MAX_SPAN_DAYS); offset += 1) {
    const date = addDays(first, offset);
    if (rule.weekdays.includes(weekdayOf(date))) dates.push(date);
  }
  return dates;
}

/**
 * The dates the next materialisation creates (decided 2026-10-15): only after
 * `materializedThrough`, so an occurrence deleted by hand is never made again; not
 * before `notBefore`; through `through`.
 */
export function datesToMaterialize(
  rule: RepeatRule & { materializedThrough: DateKey },
  through: DateKey,
  notBefore: DateKey,
): DateKey[] {
  const next = addDays(rule.materializedThrough, 1);
  return ruleDates(rule, next < notBefore ? notBefore : next, through);
}

/**
 * Which of `dates` become blocks: not a date that already has this rule's block (run
 * twice, it creates nothing new), and not one where the occurrence would overlap a
 * block in the plan lane, which stays where it is (decided 2026-10-15). `lane` is the
 * plan lane around the dates, as for findOverlap; the new occurrences count too, so
 * two of them never collide.
 */
export function planOccurrences<E extends LaneSpan>({
  rule,
  dates,
  taken,
  lane,
}: {
  rule: Pick<RulePlan, "startMin" | "durationMin">;
  dates: readonly DateKey[];
  /** Dates that already hold a block of this rule. */
  taken: ReadonlySet<string>;
  lane: readonly E[];
}): { create: LaneSpan[]; skipped: { date: DateKey; by: E | LaneSpan }[] } {
  const candidates = dates
    .filter((date) => !taken.has(date))
    .map((date) => ({
      date,
      startMin: rule.startMin,
      durationMin: rule.durationMin,
    }));
  const { placed, blocked } = placeSpans(candidates, lane);
  return {
    create: placed,
    skipped: blocked.map(({ candidate, by }) => ({ date: candidate.date, by })),
  };
}

/**
 * Whether some rule still has dates to make up to `through`: it has not been
 * materialised that far, it has not ended before the dates it would add, and it has
 * begun by then. The day view asks this before calling on the server.
 */
export function needsMaterializing(
  rules: readonly (RepeatRule & { materializedThrough: DateKey })[],
  through: DateKey,
): boolean {
  return rules.some(
    (rule) =>
      rule.materializedThrough < through &&
      rule.startDate <= through &&
      (rule.endDate === undefined || rule.endDate > rule.materializedThrough),
  );
}

const WEEKDAY_NAMES = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** The week as the settings start it: Monday first by default. */
export function weekdayOrder(weekStartsOn: number): Weekday[] {
  return ALL_WEEKDAYS.map(
    (_, index) => ((weekStartsOn + index) % 7) as Weekday,
  );
}

/** "Every day", "Weekdays", "Weekends", or "Mon, Wed, Fri" (Monday first). */
export function weekdaysLabel(weekdays: readonly number[]): string {
  const days = normalizeWeekdays(weekdays);
  const key = days.join("");
  if (key === "0123456") return "Every day";
  if (key === "12345") return "Weekdays";
  if (key === "06") return "Weekends";
  return weekdayOrder(1)
    .filter((day) => days.includes(day))
    .map((day) => WEEKDAY_NAMES[day])
    .join(", ");
}

/** "Every day", "Mon, Wed, Fri · until Sun 20 Dec" */
export function repeatLabel(rule: RepeatRule): string {
  const days = weekdaysLabel(rule.weekdays);
  return rule.endDate === undefined
    ? days
    : `${days} · until ${formatDayLabel(rule.endDate)}`;
}
