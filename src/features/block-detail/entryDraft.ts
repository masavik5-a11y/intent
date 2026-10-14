import { gridDayOf, momentOnGrid } from "@shared/grid";
import { isValidDuration, isValidMinute, type LocalMoment } from "@shared/time";
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
 * Where the draft's start puts the entry: read on the grid of the day the entry begins
 * in now, so 01:00 on a grid that starts at 05:00 is the next calendar day, at the
 * bottom (shared/grid.ts, momentOnGrid).
 */
export function entryStart(
  entry: Doc<"blocks">,
  draft: EntryDraft,
  gridStartMin: number,
): LocalMoment {
  const grid = gridDayOf(
    { date: entry.date, minute: entry.actualStartMin ?? 0 },
    gridStartMin,
  );
  return momentOnGrid(grid, gridStartMin, draft.startClockMin);
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
