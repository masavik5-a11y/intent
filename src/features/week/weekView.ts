import { weekDays } from "@shared/pace";
import {
  formatDateRange,
  weekdayLabel,
  dateKeyParts,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import { gridPosition } from "@shared/grid";
import type { Doc } from "@/lib/api";
import type { GridCard } from "@/features/day/DayGrid";
import { dayTense } from "@/features/day/dayView";
import { actualCards, planCards } from "@/features/day/gridCards";

// The week view (PRD P6; DESIGN.md section 7): seven days side by side, the plan lane
// for each, and beside it what happened on days that have begun. Worked out without
// React so it can be tested.

export interface WeekColumn {
  date: DateKey;
  tense: "past" | "today" | "future";
  /** "Mon 12" */
  label: string;
  plan: GridCard[];
  /** What happened; empty on a day still to come. */
  actual: GridCard[];
  /** Grid position of the now line, on today's column only. */
  nowPosition: number | null;
}

/** The seven columns of the week holding `first`. */
export function weekColumns({
  blocks,
  categories,
  activities,
  first,
  weekStartsOn,
  gridStartMin,
  now,
  today,
}: {
  blocks: readonly Doc<"blocks">[];
  categories: readonly Doc<"categories">[];
  activities: readonly Doc<"activities">[];
  first: DateKey;
  weekStartsOn: number;
  gridStartMin: number;
  now: LocalMoment;
  today: DateKey;
}): WeekColumn[] {
  return weekDays(first, weekStartsOn).map((date) => {
    const tense = dayTense(date, today);
    const common = {
      blocks,
      date,
      gridStartMin,
      now,
      categories,
      activities,
      selectedId: undefined,
    };
    return {
      date,
      tense,
      label: `${weekdayLabel(date)} ${dateKeyParts(date).day}`,
      plan: planCards(common),
      actual: tense === "future" ? [] : actualCards(common),
      nowPosition:
        tense === "today" ? gridPosition(date, gridStartMin, now) : null,
    };
  });
}

/** "12–18 Oct", with "This week" in front when it holds today. */
export function weekTitle(
  days: readonly DateKey[],
  today: DateKey,
): { title: string; range: string } {
  const first = days[0] ?? today;
  const last = days[days.length - 1] ?? today;
  const range = formatDateRange(first, last);
  const current = first <= today && today <= last;
  return { title: current ? "This week" : range, range };
}
