import { gridDayOf, momentOnGrid } from "@shared/grid";
import { minuteFrom } from "@shared/lanes";
import {
  addDays,
  isValidDuration,
  isValidMinute,
  type LocalMoment,
} from "@shared/time";
import type { Doc, Id } from "@/lib/api";

// The form for an unplanned entry (PRD A2, A3, A5): what it was, its category, when,
// and the note. Pure, so it is tested alone.

export interface EntryDraft {
  title: string;
  categoryId: Id<"categories">;
  /** The start as a clock time on the grid the entry begins in. */
  startClockMin: number;
  durationMin: number;
  note: string;
}

export function entryDraftOf(entry: Doc<"blocks">): EntryDraft {
  return {
    title: entry.title,
    categoryId: entry.categoryId,
    startClockMin: entry.actualStartMin ?? 0,
    durationMin: entry.actualDurationMin ?? 0,
    note: entry.note ?? "",
  };
}

/**
 * Where the draft's start puts the entry: the reading of the typed clock time nearest
 * to where the entry starts now, on its own grid or the grid before or after
 * (shared/grid.ts, momentOnGrid). So 01:00 for an entry at 13:00 is the next calendar
 * day, at the bottom of the same grid, and 05:10 for an entry at 04:30 is forty
 * minutes later, not most of a day earlier. A tie keeps the entry's own grid.
 */
export function entryStart(
  entry: Doc<"blocks">,
  draft: EntryDraft,
  gridStartMin: number,
): LocalMoment {
  const current = entry.actualStartMin ?? 0;
  const grid = gridDayOf({ date: entry.date, minute: current }, gridStartMin);
  let best: { moment: LocalMoment; distance: number } | null = null;
  for (const day of [grid, addDays(grid, -1), addDays(grid, 1)]) {
    const moment = momentOnGrid(day, gridStartMin, draft.startClockMin);
    const distance = Math.abs(minuteFrom(entry.date, moment) - current);
    if (best === null || distance < best.distance) best = { moment, distance };
  }
  // The loop runs three times, so best is always set.
  return best?.moment ?? momentOnGrid(grid, gridStartMin, draft.startClockMin);
}

/** What is wrong with the draft, in the words the form shows, or null. */
export function entryProblem(draft: EntryDraft): string | null {
  if (!isValidMinute(draft.startClockMin)) {
    return "Use a start time in 5-minute steps.";
  }
  if (!isValidDuration(draft.durationMin)) {
    return "Use a length from 5 minutes to 24 hours.";
  }
  return null;
}

/**
 * Arguments for blocks.update: only what changed. A blank title goes back to the
 * category's name, as when it was logged; an emptied note is sent as null.
 */
export function entryUpdateArgs(
  entry: Doc<"blocks">,
  draft: EntryDraft,
  gridStartMin: number,
  categories: readonly Doc<"categories">[],
) {
  const before = entryDraftOf(entry);
  const args: {
    blockId: Id<"blocks">;
    title?: string;
    categoryId?: Id<"categories">;
    date?: Doc<"blocks">["date"];
    actualStartMin?: number;
    actualDurationMin?: number;
    note?: string | null;
  } = { blockId: entry._id };
  const category = categories.find((item) => item._id === draft.categoryId);
  const title =
    draft.title.trim() === "" ? (category?.name ?? entry.title) : draft.title;
  if (title !== before.title) args.title = title;
  if (draft.categoryId !== before.categoryId) {
    args.categoryId = draft.categoryId;
  }
  if (draft.startClockMin !== before.startClockMin) {
    const start = entryStart(entry, draft, gridStartMin);
    if (start.date !== entry.date) args.date = start.date;
    args.actualStartMin = start.minute;
  }
  if (draft.durationMin !== before.durationMin) {
    args.actualDurationMin = draft.durationMin;
  }
  if (draft.note !== before.note) {
    args.note = draft.note.trim() === "" ? null : draft.note;
  }
  return args;
}
