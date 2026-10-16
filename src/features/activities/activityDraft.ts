import { INTENT_FIELDS, type IntentField } from "@shared/blocks";
import { pressureByDefault } from "@shared/categories";
import { isIconName, type IconName } from "@shared/icons";
import { isValidDuration } from "@shared/time";
import type { Doc, Id } from "@/lib/api";

// The activity editor's state and how it turns into create and update arguments.
// Pure, so the rules are tested without rendering anything.

/** What the editor holds while you type. Text is kept as typed; blank means unset. */
export type ActivityDraft = { [F in IntentField]: string } & {
  name: string;
  categoryId: Id<"categories"> | null;
  /** Null: use the category's icon. */
  icon: IconName | null;
  defaultDurationMin: number;
  notify: boolean;
  pressure: boolean;
  /** The goal its blocks work toward (PRD U6), or null. */
  goalId: Id<"goals"> | null;
};

export const DEFAULT_DURATION_MIN = 60;

const NO_INTENT: { [F in IntentField]: string } = {
  doneWhen: "",
  why: "",
  how: "",
  ifThen: "",
  minimumVersion: "",
  costOfSkipping: "",
};

/** A blank activity in `category`, or in the first category that is not archived. */
export function newDraft(
  categories: readonly Doc<"categories">[],
  category?: Doc<"categories">,
): ActivityDraft {
  const chosen = category ?? categories.find((item) => !item.archived);
  return {
    ...NO_INTENT,
    name: "",
    categoryId: chosen?._id ?? null,
    icon: null,
    defaultDurationMin: DEFAULT_DURATION_MIN,
    notify: true,
    pressure: pressureByDefault(chosen),
    goalId: null,
  };
}

/** The editor's state for an existing activity. */
export function draftOf(activity: Doc<"activities">): ActivityDraft {
  const intent = { ...NO_INTENT };
  for (const field of INTENT_FIELDS) intent[field] = activity[field] ?? "";
  return {
    ...intent,
    name: activity.name,
    categoryId: activity.categoryId,
    icon:
      activity.icon !== undefined && isIconName(activity.icon)
        ? activity.icon
        : null,
    defaultDurationMin: activity.defaultDurationMin,
    notify: activity.notify,
    pressure: activity.pressure,
    goalId: activity.goalId ?? null,
  };
}

/** What is wrong with a draft, in the words the editor shows, or null when it can be saved. */
export function draftProblem(draft: ActivityDraft): string | null {
  if (draft.name.trim() === "") return "Give it a name.";
  if (draft.categoryId === null) return "Choose a category.";
  if (!isValidDuration(draft.defaultDurationMin)) {
    return "Use a length from 5 minutes to 24 hours, in 5-minute steps.";
  }
  return null;
}

/** Arguments for activities.create. Call only when draftProblem is null. */
export function createArgs(draft: ActivityDraft, categoryId: Id<"categories">) {
  const args: { [F in IntentField]?: string } & {
    name: string;
    categoryId: Id<"categories">;
    icon?: string;
    defaultDurationMin: number;
    notify: boolean;
    pressure: boolean;
    goalId?: Id<"goals">;
  } = {
    name: draft.name,
    categoryId,
    defaultDurationMin: draft.defaultDurationMin,
    notify: draft.notify,
    pressure: draft.pressure,
  };
  if (draft.icon !== null) args.icon = draft.icon;
  if (draft.goalId !== null) args.goalId = draft.goalId;
  for (const field of INTENT_FIELDS) {
    if (draft[field].trim() !== "") args[field] = draft[field];
  }
  return args;
}

/**
 * Arguments for activities.update: only what changed. Text emptied in the editor is
 * sent as null, which clears it.
 */
export function updateArgs(activity: Doc<"activities">, draft: ActivityDraft) {
  const before = draftOf(activity);
  const args: { [F in IntentField]?: string | null } & {
    activityId: Id<"activities">;
    name?: string;
    categoryId?: Id<"categories">;
    icon?: string | null;
    defaultDurationMin?: number;
    notify?: boolean;
    pressure?: boolean;
    goalId?: Id<"goals"> | null;
  } = { activityId: activity._id };
  if (draft.name !== before.name) args.name = draft.name;
  if (draft.categoryId !== null && draft.categoryId !== before.categoryId) {
    args.categoryId = draft.categoryId;
  }
  if (draft.icon !== before.icon) args.icon = draft.icon;
  if (draft.defaultDurationMin !== before.defaultDurationMin) {
    args.defaultDurationMin = draft.defaultDurationMin;
  }
  if (draft.notify !== before.notify) args.notify = draft.notify;
  if (draft.pressure !== before.pressure) args.pressure = draft.pressure;
  if (draft.goalId !== before.goalId) args.goalId = draft.goalId;
  for (const field of INTENT_FIELDS) {
    if (draft[field] === before[field]) continue;
    args[field] = draft[field].trim() === "" ? null : draft[field];
  }
  return args;
}

export interface CategoryGroup {
  category: Doc<"categories">;
  activities: Doc<"activities">[];
}

/**
 * Activities that are not archived, grouped under their category in the categories'
 * order and sorted by name. Categories without activities are left out.
 */
export function groupByCategory(
  activities: readonly Doc<"activities">[],
  categories: readonly Doc<"categories">[],
): CategoryGroup[] {
  return categories
    .map((category) => ({
      category,
      activities: activities
        .filter(
          (activity) =>
            !activity.archived && activity.categoryId === category._id,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.activities.length > 0);
}

/**
 * The goals an activity can point at: the active ones, and the one it points at now
 * even if that is closed, so opening the form never drops a link silently.
 */
export function goalChoices(
  goals: readonly Doc<"goals">[],
  current: Id<"goals"> | null,
): Doc<"goals">[] {
  return goals.filter(
    (goal) => goal.status === "active" || goal._id === current,
  );
}
