import { daysLeft, daysLeftText } from "@shared/pace";
import {
  formatDayLabel,
  formatDuration,
  MINUTES_PER_HOUR,
  parseDateKey,
  parseDuration,
  type DateKey,
} from "@shared/time";
import { MAX_INTENT_LENGTH, MAX_TITLE_LENGTH } from "@shared/text";
import { isValidWeeklyTarget } from "@shared/goals";
import type { Doc, Id } from "@/lib/api";

// What the goals list and the weekly targets show and send, worked out without React.

/**
 * Active goals by due date, the soonest first, goals without a date after them in the
 * order they were made (DESIGN.md section 7, Compass). Then the done and dropped ones.
 */
export function sortGoals(goals: readonly Doc<"goals">[]): {
  active: Doc<"goals">[];
  closed: Doc<"goals">[];
} {
  const byDue = (a: Doc<"goals">, b: Doc<"goals">) => {
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === undefined) return 1;
      if (b.dueDate === undefined) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder;
  };
  return {
    active: goals.filter((goal) => goal.status === "active").sort(byDue),
    closed: goals
      .filter((goal) => goal.status !== "active")
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** "Sat 21 Nov · 36 days left", "Mon 12 Oct · 4 days over", or null without a date. */
export function dueText(goal: Doc<"goals">, today: DateKey): string | null {
  if (goal.dueDate === undefined) return null;
  return `${formatDayLabel(goal.dueDate)} · ${daysLeftText(daysLeft(goal.dueDate, today))}`;
}

/** "20h 30m invested", "No hours yet", or "40h+ invested" when the read was capped. */
export function investedText(
  invested: { minutes: number; capped: boolean } | undefined,
): string | null {
  if (invested === undefined) return null;
  if (invested.minutes === 0) return "No hours yet";
  return `${formatDuration(invested.minutes)}${invested.capped ? "+" : ""} invested`;
}

/** The goal chip beside the why: "Launch the course · 38 days left". */
export function goalChipText(goal: Doc<"goals">, today: DateKey): string {
  return goal.dueDate === undefined
    ? goal.title
    : `${goal.title} · ${daysLeftText(daysLeft(goal.dueDate, today))}`;
}

/** What the goal form holds while you type. */
export interface GoalDraft {
  title: string;
  why: string;
  /** "YYYY-MM-DD" from the date field, or "" for none. */
  dueDate: string;
}

export function goalDraftOf(goal: Doc<"goals"> | null): GoalDraft {
  return {
    title: goal?.title ?? "",
    why: goal?.why ?? "",
    dueDate: goal?.dueDate ?? "",
  };
}

/** What is wrong with a draft, in the form's words, or null. */
export function goalDraftProblem(draft: GoalDraft): string | null {
  if (draft.title.trim() === "") return "Give it a name.";
  if (draft.title.trim().length > MAX_TITLE_LENGTH)
    return "Use a shorter name.";
  if (draft.why.trim().length > MAX_INTENT_LENGTH) return "Use a shorter why.";
  if (draft.dueDate !== "" && parseDateKey(draft.dueDate) === null) {
    return "Choose a date, or leave it empty.";
  }
  return null;
}

/** Arguments for goals.create. Call only when goalDraftProblem is null. */
export function goalCreateArgs(draft: GoalDraft, today: DateKey) {
  const args: {
    title: string;
    why?: string;
    dueDate?: DateKey;
    today: DateKey;
  } = { title: draft.title, today };
  if (draft.why.trim() !== "") args.why = draft.why;
  const due = parseDateKey(draft.dueDate);
  if (due !== null) args.dueDate = due;
  return args;
}

/** Arguments for goals.update: only what changed; emptied fields are sent as null. */
export function goalUpdateArgs(goal: Doc<"goals">, draft: GoalDraft) {
  const before = goalDraftOf(goal);
  const args: {
    goalId: Id<"goals">;
    title?: string;
    why?: string | null;
    dueDate?: DateKey | null;
  } = { goalId: goal._id };
  if (draft.title !== before.title) args.title = draft.title;
  if (draft.why !== before.why) {
    args.why = draft.why.trim() === "" ? null : draft.why;
  }
  if (draft.dueDate !== before.dueDate) {
    args.dueDate = parseDateKey(draft.dueDate);
  }
  return args;
}

/**
 * A typed weekly target in minutes (PRD U5): a plain number is hours ("15", "7.5",
 * "7,5"), anything else a length ("7h 30m", "90m"). Empty clears it (null). Undefined
 * when it is not a target: off the 5-minute step, zero, or more than the week.
 */
export function parseWeeklyTarget(text: string): number | null | undefined {
  const value = text.trim().replace(",", ".");
  if (value === "") return null;
  const hours = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
  const minutes =
    hours !== null
      ? Math.round(hours * MINUTES_PER_HOUR * 1000) / 1000
      : parseDuration(value);
  if (minutes === null || !isValidWeeklyTarget(minutes)) return undefined;
  return minutes;
}

/** A target as the field shows it: 900 -> "15", 450 -> "7.5", 455 -> "7h 35m". */
export function weeklyTargetText(minutes: number | undefined): string {
  if (minutes === undefined) return "";
  const hours = minutes / MINUTES_PER_HOUR;
  return Number.isInteger(hours * 2) ? String(hours) : formatDuration(minutes);
}

/** Categories a weekly target makes sense for: not archived, and not drift. */
export function targetCategories(
  categories: readonly Doc<"categories">[],
): Doc<"categories">[] {
  return categories.filter(
    (category) => !category.archived && category.kind !== "drift",
  );
}
