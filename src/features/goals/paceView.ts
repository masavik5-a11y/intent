import {
  completedDays,
  DAYS_PER_WEEK,
  paceText,
  weekProgress,
  weeklyPace,
  type WeeklyPace,
} from "@shared/pace";
import { addDays, type DateKey, type LocalMoment } from "@shared/time";
import type { Doc } from "@/lib/api";

// Weekly pace per category with a target (PRD U5), for the now panel and the week.

export interface CategoryPace {
  category: Doc<"categories">;
  pace: WeeklyPace;
  /** "Deep work 9h of 15h · 3 days left · behind by 1h 30m · 2h a day" */
  text: string;
}

/** The dates a week's pace reads: the day before its first, through the day after. */
export function weekReadRange(first: DateKey): { from: DateKey; to: DateKey } {
  return { from: addDays(first, -1), to: addDays(first, DAYS_PER_WEEK) };
}

/**
 * Completed days of the week starting on `first`, as of `today`: none for a week
 * still to come, all seven for one that is over, and for this week the days before
 * today plus today once it is reviewed (pace rule 2).
 */
export function completedInWeek(
  first: DateKey,
  today: DateKey,
  weekStartsOn: number,
  todayReviewed: boolean,
): number {
  if (first > today) return 0;
  if (addDays(first, DAYS_PER_WEEK - 1) < today) return DAYS_PER_WEEK;
  return completedDays(today, weekStartsOn, todayReviewed);
}

/**
 * The pace of each category that has a weekly target, in the categories' order, for
 * the week starting on `first`. `blocks` covers weekReadRange(first).
 */
export function weekPaces({
  blocks,
  categories,
  first,
  today,
  weekStartsOn,
  gridStartMin,
  now,
  todayReviewed,
}: {
  blocks: readonly Doc<"blocks">[];
  categories: readonly Doc<"categories">[];
  first: DateKey;
  today: DateKey;
  weekStartsOn: number;
  gridStartMin: number;
  now: LocalMoment;
  todayReviewed: boolean;
}): CategoryPace[] {
  const progress = weekProgress(blocks, first, gridStartMin, now);
  const completed = completedInWeek(first, today, weekStartsOn, todayReviewed);
  const paces: CategoryPace[] = [];
  for (const category of categories) {
    if (category.archived || category.weeklyTargetMin === undefined) continue;
    const pace = weeklyPace(
      category.weeklyTargetMin,
      progress.get(category._id) ?? 0,
      completed,
    );
    paces.push({ category, pace, text: paceText(category.name, pace) });
  }
  return paces;
}
