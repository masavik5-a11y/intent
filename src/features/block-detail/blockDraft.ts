import {
  effectiveIntent,
  INTENT_FIELDS,
  type IntentField,
} from "@shared/blocks";
import { isValidDuration, isValidMinute } from "@shared/time";
import type { Doc, Id } from "@/lib/api";

// The block detail form's state and what it sends. Pure, so it is tested alone.

/** What the form holds while you edit. Text as typed; blank means "not this block's own". */
export type BlockDraft = { [F in IntentField]: string } & {
  title: string;
  focus: string;
  activityId: Id<"activities"> | null;
  categoryId: Id<"categories">;
  plannedStartMin: number;
  plannedDurationMin: number;
};

export function draftOf(block: Doc<"blocks">): BlockDraft {
  return {
    title: block.title,
    focus: block.focus ?? "",
    activityId: block.activityId ?? null,
    categoryId: block.categoryId,
    plannedStartMin: block.plannedStartMin,
    plannedDurationMin: block.plannedDurationMin,
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

/** Arguments for blocks.update: only what changed; emptied text is sent as null. */
export function updateArgs(block: Doc<"blocks">, draft: BlockDraft) {
  const before = draftOf(block);
  const args: { [F in IntentField]?: string | null } & {
    blockId: Id<"blocks">;
    title?: string;
    focus?: string | null;
    activityId?: Id<"activities"> | null;
    categoryId?: Id<"categories">;
    plannedStartMin?: number;
    plannedDurationMin?: number;
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
