import { planLaneOf } from "@shared/blocks";
import { momentAt, momentOnGrid } from "@shared/grid";
import { firstFreeSpan } from "@shared/lanes";
import {
  MINUTE_STEP,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "@shared/time";
import type { Doc } from "@/lib/api";

// Quick add (DESIGN.md section 7): pure parts, tested without rendering.

const MAX_SUGGESTIONS = 8;

/**
 * Activities whose name matches what was typed: names that start with it first,
 * then names that contain it, each alphabetical. Archived ones never show.
 */
export function matchActivities(
  activities: readonly Doc<"activities">[],
  typed: string,
): Doc<"activities">[] {
  const query = fold(typed.trim());
  const active = activities.filter((activity) => !activity.archived);
  const byName = (a: Doc<"activities">, b: Doc<"activities">) =>
    a.name.localeCompare(b.name);
  if (query === "") return active.sort(byName).slice(0, MAX_SUGGESTIONS);
  const starts = active.filter((activity) =>
    fold(activity.name).startsWith(query),
  );
  const contains = active.filter(
    (activity) =>
      !fold(activity.name).startsWith(query) &&
      fold(activity.name).includes(query),
  );
  return [...starts.sort(byName), ...contains.sort(byName)].slice(
    0,
    MAX_SUGGESTIONS,
  );
}

/** Lower case without accents, so "medi" finds "Meditácia". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Where a new block starts when nothing was clicked: on today, the next 5-minute mark
 * from now; on any other day, the wake time. Either way moved past the blocks in its
 * way, so the suggestion fits.
 */
export function suggestedStart({
  day,
  gridStartMin,
  wakeMin,
  now,
  isToday,
  durationMin,
  blocks,
}: {
  day: DateKey;
  gridStartMin: number;
  wakeMin: number;
  now: LocalMoment;
  isToday: boolean;
  durationMin: number;
  blocks: readonly Doc<"blocks">[];
}): LocalMoment {
  const from = isToday
    ? roundUpToStep(now)
    : momentOnGrid(day, gridStartMin, wakeMin);
  const free = firstFreeSpan(
    { date: from.date, startMin: from.minute, durationMin },
    planLaneOf(blocks),
  );
  return free === null ? from : { date: free.date, minute: free.startMin };
}

function roundUpToStep(now: LocalMoment): LocalMoment {
  const minute = Math.ceil(now.minute / MINUTE_STEP) * MINUTE_STEP;
  return minute < MINUTES_PER_DAY
    ? { date: now.date, minute }
    : momentAt(now.date, 0, minute);
}
