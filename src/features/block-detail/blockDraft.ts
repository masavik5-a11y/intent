import {
  actualStartFromClock,
  effectiveIntent,
  INTENT_FIELDS,
  type IntentField,
} from "@shared/blocks";
import { isValidDuration, isValidMinute, MINUTES_PER_DAY } from "@shared/time";
import type { Doc, Id, PlannedBlockDoc } from "@/lib/api";

// The block detail form's state and what it sends. Pure, so it is tested alone.

/** What the form holds while you edit. Text as typed; blank means "not this block's own". */
export type BlockDraft = { [F in IntentField]: string } & {
  title: string;
  focus: string;
  activityId: Id<"activities"> | null;
  categoryId: Id<"categories">;
  plannedStartMin: number;
  plannedDurationMin: number;
  /**
   * What happened, for a block marked done or partly (PRD A2): the start as a clock
   * time, and the length. Null on a block without actual times.
   */
  actualClockMin: number | null;
  actualDurationMin: number | null;
  /** The one-line note after the fact (PRD A5). */
  note: string;
};

export function draftOf(block: PlannedBlockDoc): BlockDraft {
  return {
    title: block.title,
    focus: block.focus ?? "",
    activityId: block.activityId ?? null,
    categoryId: block.categoryId,
    plannedStartMin: block.plannedStartMin,
    plannedDurationMin: block.plannedDurationMin,
    actualClockMin:
      block.actualStartMin === undefined
        ? null
        : block.actualStartMin % MINUTES_PER_DAY,
    actualDurationMin: block.actualDurationMin ?? null,
    note: block.note ?? "",
    doneWhen: block.doneWhen ?? "",
    why: block.why ?? "",
    how: block.how ?? "",
    ifThen: block.ifThen ?? "",
    minimumVersion: block.minimumVersion ?? "",
    costOfSkipping: block.costOfSkipping ?? "",
  };
}

/** What is wrong with a draft, in the words the form shows, or null. */
export function draftProblem(draft: BlockDraft): string | null {
  if (draft.title.trim() === "") return "Give it a title.";
  if (!isValidMinute(draft.plannedStartMin)) {
    return "Use a start time in 5-minute steps.";
  }
  if (!isValidDuration(draft.plannedDurationMin)) {
    return "Use a length from 5 minutes to 24 hours.";
  }
  return null;
}

/**
 * The actual start the draft's clock time means, in minutes from the block's day
 * (shared/blocks.ts, actualStartFromClock). Undefined for a block without actual
 * times; null when the time cannot be read on that block's day.
 */
export function actualStartOf(
  block: PlannedBlockDoc,
  draft: BlockDraft,
): number | null | undefined {
  if (draft.actualClockMin === null || block.actualStartMin === undefined) {
    return undefined;
  }
  return actualStartFromClock(draft.actualClockMin, block.actualStartMin);
}

/** What is wrong with the draft's actual times, in the words the form shows, or null. */
export function actualProblem(
  block: PlannedBlockDoc,
  draft: BlockDraft,
): string | null {
  if (draft.actualClockMin === null) return null;
  if (!isValidMinute(draft.actualClockMin)) {
    return "Use a start time in 5-minute steps.";
  }
  if (actualStartOf(block, draft) === null) {
    return "That start would fall on the day before. Pick one closer to the plan.";
  }
  if (
    draft.actualDurationMin !== null &&
    !isValidDuration(draft.actualDurationMin)
  ) {
    return "Use a length from 5 minutes to 24 hours.";
  }
  return null;
}

/**
 * Whether the draft changes the block's plan: what it is (title, activity, category,
 * focus) or when (start, length). What a repeating rule copies from a block.
 */
export function planChanged(
  block: PlannedBlockDoc,
  draft: BlockDraft,
): boolean {
  const before = draftOf(block);
  return (
    draft.title.trim() !== before.title ||
    draft.focus.trim() !== before.focus ||
    draft.activityId !== before.activityId ||
    draft.categoryId !== before.categoryId ||
    draft.plannedStartMin !== before.plannedStartMin ||
    draft.plannedDurationMin !== before.plannedDurationMin
  );
}

/** Arguments for blocks.update: only what changed; emptied text is sent as null. */
export function updateArgs(block: PlannedBlockDoc, draft: BlockDraft) {
  const before = draftOf(block);
  const args: { [F in IntentField]?: string | null } & {
    blockId: Id<"blocks">;
    title?: string;
    focus?: string | null;
    activityId?: Id<"activities"> | null;
    categoryId?: Id<"categories">;
    plannedStartMin?: number;
    plannedDurationMin?: number;
    actualStartMin?: number;
    actualDurationMin?: number;
    note?: string | null;
  } = { blockId: block._id };
  if (draft.title !== before.title) args.title = draft.title;
  if (draft.focus !== before.focus) {
    args.focus = draft.focus.trim() === "" ? null : draft.focus;
  }
  if (draft.activityId !== before.activityId) {
    args.activityId = draft.activityId;
  }
  if (draft.categoryId !== before.categoryId) {
    args.categoryId = draft.categoryId;
  }
  if (draft.plannedStartMin !== before.plannedStartMin) {
    args.plannedStartMin = draft.plannedStartMin;
  }
  if (draft.plannedDurationMin !== before.plannedDurationMin) {
    args.plannedDurationMin = draft.plannedDurationMin;
  }
  if (draft.actualClockMin !== before.actualClockMin) {
    const start = actualStartOf(block, draft);
    if (typeof start === "number") args.actualStartMin = start;
  }
  // Only while the block has actual times: after Undo it has none to change.
  if (
    block.actualDurationMin !== undefined &&
    draft.actualDurationMin !== null &&
    draft.actualDurationMin !== before.actualDurationMin
  ) {
    args.actualDurationMin = draft.actualDurationMin;
  }
  if (draft.note !== before.note) {
    args.note = draft.note.trim() === "" ? null : draft.note;
  }
  for (const field of INTENT_FIELDS) {
    if (draft[field] === before[field]) continue;
    args[field] = draft[field].trim() === "" ? null : draft[field];
  }
  return args;
}

/**
 * For each intent field, the activity's text the block would inherit if it had none
 * of its own: what the form shows greyed in an empty field.
 */
export function inheritedIntent(activity: Doc<"activities"> | undefined): {
  [F in IntentField]: string | null;
} {
  const intent = effectiveIntent({}, activity ?? null);
  return {
    doneWhen: intent.doneWhen?.text ?? null,
    why: intent.why?.text ?? null,
    how: intent.how?.text ?? null,
    ifThen: intent.ifThen?.text ?? null,
    minimumVersion: intent.minimumVersion?.text ?? null,
    costOfSkipping: intent.costOfSkipping?.text ?? null,
  };
}
