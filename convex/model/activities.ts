import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { INTENT_FIELDS, type IntentField } from "../../shared/blocks";
import { isIconName } from "../../shared/icons";
import {
  cleanName,
  cleanText,
  MAX_INTENT_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../shared/text";
import { isValidDuration } from "../../shared/time";
import { appError } from "../lib/errors";
import * as Categories from "./categories";

// The only module that writes the activities table (CLAUDE.md, rule 4).

/** A library no one will outgrow; keeps every read of the table bounded. */
export const MAX_ACTIVITIES = 500;

type ActivityFields = Omit<
  Doc<"activities">,
  "_id" | "_creationTime" | "userId"
>;

export type NewActivity = { [F in IntentField]?: string } & {
  name: string;
  categoryId: Id<"categories">;
  icon?: string;
  defaultDurationMin: number;
  notify: boolean;
  pressure: boolean;
  goalId?: Id<"goals">;
};

/** Fields left out stay as they are; null clears an optional field. */
export type ActivityChanges = { [F in IntentField]?: string | null } & {
  name?: string;
  categoryId?: Id<"categories">;
  icon?: string | null;
  defaultDurationMin?: number;
  notify?: boolean;
  pressure?: boolean;
  /** The goal its blocks work toward; null unlinks it (PRD U6). */
  goalId?: Id<"goals"> | null;
};

/** The user's activity, or NOT_FOUND when it is missing or someone else's. */
export async function getOwned(
  ctx: QueryCtx,
  userId: Id<"users">,
  activityId: Id<"activities">,
): Promise<Doc<"activities">> {
  const activity = await ctx.db.get("activities", activityId);
  if (activity === null || activity.userId !== userId) {
    throw appError("NOT_FOUND");
  }
  return activity;
}

/** The user's activities, archived ones included, in creation order. */
export async function listForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"activities">[]> {
  return await ctx.db
    .query("activities")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_ACTIVITIES);
}

export async function create(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: NewActivity,
): Promise<Id<"activities">> {
  await Categories.getOwned(ctx, userId, input.categoryId);
  const count = (await listForUser(ctx, userId)).length;
  if (count >= MAX_ACTIVITIES) throw appError("INVALID_INPUT");

  const fields: ActivityFields = {
    name: requiredName(input.name),
    categoryId: input.categoryId,
    defaultDurationMin: checkDuration(input.defaultDurationMin),
    notify: input.notify,
    pressure: input.pressure,
    archived: false,
  };
  if (input.icon !== undefined) fields.icon = checkIcon(input.icon);
  if (input.goalId !== undefined) {
    fields.goalId = await ownedGoal(ctx, userId, input.goalId);
  }
  for (const field of INTENT_FIELDS) {
    const text = optionalText(input[field]);
    if (text !== undefined) fields[field] = text;
  }
  return await ctx.db.insert("activities", { userId, ...fields });
}

/**
 * Changes an activity. Blocks made from it inherit its intent when shown, so a new
 * why reaches every block that has not overridden it, past ones too (ARCHITECTURE.md,
 * section 5, "Effective intent").
 */
export async function update(
  ctx: MutationCtx,
  userId: Id<"users">,
  activityId: Id<"activities">,
  changes: ActivityChanges,
): Promise<void> {
  const activity = await getOwned(ctx, userId, activityId);
  // A field set to undefined in a patch is removed from the document.
  const patch: Partial<ActivityFields> = {};
  if (changes.name !== undefined) patch.name = requiredName(changes.name);
  if (changes.categoryId !== undefined) {
    await Categories.getOwned(ctx, userId, changes.categoryId);
    patch.categoryId = changes.categoryId;
  }
  if (changes.icon !== undefined) {
    patch.icon = changes.icon === null ? undefined : checkIcon(changes.icon);
  }
  if (changes.defaultDurationMin !== undefined) {
    patch.defaultDurationMin = checkDuration(changes.defaultDurationMin);
  }
  if (changes.notify !== undefined) patch.notify = changes.notify;
  if (changes.pressure !== undefined) patch.pressure = changes.pressure;
  if (changes.goalId !== undefined) {
    patch.goalId =
      changes.goalId === null
        ? undefined
        : await ownedGoal(ctx, userId, changes.goalId);
  }
  for (const field of INTENT_FIELDS) {
    const change = changes[field];
    if (change !== undefined) {
      patch[field] = change === null ? undefined : optionalText(change);
    }
  }
  await ctx.db.patch("activities", activity._id, patch);
}

/**
 * Archiving hides an activity from the pickers. Its blocks keep pointing at it, so
 * their intent still shows; restoring brings it back as it was.
 */
export async function setArchived(
  ctx: MutationCtx,
  userId: Id<"users">,
  activityId: Id<"activities">,
  archived: boolean,
): Promise<void> {
  const activity = await getOwned(ctx, userId, activityId);
  await ctx.db.patch("activities", activity._id, { archived });
}

/** A goal of the user's to link to, or NOT_FOUND. */
async function ownedGoal(
  ctx: QueryCtx,
  userId: Id<"users">,
  goalId: Id<"goals">,
): Promise<Id<"goals">> {
  const goal = await ctx.db.get("goals", goalId);
  if (goal === null || goal.userId !== userId) throw appError("NOT_FOUND");
  return goal._id;
}

function requiredName(name: string): string {
  const cleaned = cleanName(name, MAX_TITLE_LENGTH);
  if (cleaned === null) throw appError("INVALID_INPUT");
  return cleaned;
}

function checkDuration(minutes: number): number {
  if (!isValidDuration(minutes)) throw appError("INVALID_TIME");
  return minutes;
}

function checkIcon(icon: string): string {
  if (!isIconName(icon)) throw appError("INVALID_INPUT");
  return icon;
}

function optionalText(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = cleanText(value, MAX_INTENT_LENGTH);
  if (cleaned === null) throw appError("INVALID_INPUT");
  return cleaned;
}
