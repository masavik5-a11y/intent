import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_GOALS, type GoalStatus } from "../../shared/goals";
import {
  cleanName,
  cleanText,
  MAX_INTENT_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../shared/text";
import { isDateKey, type DateKey } from "../../shared/time";
import { appError } from "../lib/errors";
import * as Activities from "./activities";

// The only module that writes the goals table (CLAUDE.md, rule 4).

type GoalFields = Omit<Doc<"goals">, "_id" | "_creationTime" | "userId">;

export interface NewGoal {
  title: string;
  why?: string;
  dueDate?: DateKey;
  /** The device's today: hours invested count from this day. */
  today: DateKey;
}

/** Fields left out stay as they are; null clears an optional one. */
export interface GoalChanges {
  title?: string;
  why?: string | null;
  dueDate?: DateKey | null;
}

/** The user's goal, or NOT_FOUND when it is missing or someone else's. */
export async function getOwned(
  ctx: QueryCtx,
  userId: Id<"users">,
  goalId: Id<"goals">,
): Promise<Doc<"goals">> {
  const goal = await ctx.db.get("goals", goalId);
  if (goal === null || goal.userId !== userId) throw appError("NOT_FOUND");
  return goal;
}

/** The user's goals, closed ones included, in creation order. */
export async function listForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"goals">[]> {
  return await ctx.db
    .query("goals")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_GOALS);
}

export async function create(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: NewGoal,
): Promise<Id<"goals">> {
  const count = (await listForUser(ctx, userId)).length;
  if (count >= MAX_GOALS) throw appError("INVALID_INPUT");
  const fields: GoalFields = {
    title: requiredTitle(input.title),
    createdOn: checkDate(input.today),
    status: "active",
    sortOrder: count,
  };
  const why = input.why === undefined ? undefined : optionalWhy(input.why);
  if (why !== undefined) fields.why = why;
  if (input.dueDate !== undefined) fields.dueDate = checkDate(input.dueDate);
  return await ctx.db.insert("goals", { userId, ...fields });
}

export async function update(
  ctx: MutationCtx,
  userId: Id<"users">,
  goalId: Id<"goals">,
  changes: GoalChanges,
): Promise<void> {
  const goal = await getOwned(ctx, userId, goalId);
  // A field set to undefined in a patch is removed from the document.
  const patch: Partial<GoalFields> = {};
  if (changes.title !== undefined) patch.title = requiredTitle(changes.title);
  if (changes.why !== undefined) {
    patch.why = changes.why === null ? undefined : optionalWhy(changes.why);
  }
  if (changes.dueDate !== undefined) {
    patch.dueDate =
      changes.dueDate === null ? undefined : checkDate(changes.dueDate);
  }
  await ctx.db.patch("goals", goal._id, patch);
}

/** Marks a goal done or dropped, or reopens it. Its activities stay linked. */
export async function setStatus(
  ctx: MutationCtx,
  userId: Id<"users">,
  goalId: Id<"goals">,
  status: GoalStatus,
): Promise<void> {
  const goal = await getOwned(ctx, userId, goalId);
  await ctx.db.patch("goals", goal._id, { status });
}

/** Blocks read at most for one goal's hours; more than years of daily blocks. */
const MAX_INVESTED_BLOCKS = 4000;

export interface Invested {
  goalId: Id<"goals">;
  /** Actual minutes recorded on its activities' blocks since the goal was made. */
  minutes: number;
  /** The read stopped at its limit, so there is at least this much. */
  capped: boolean;
}

/**
 * Hours invested in each goal (PRD U6, decided 2026-10-16): the actual minutes of the
 * blocks of the activities that point at it, dated from the day the goal was made on.
 * Read per activity through blocks' by_activityId_and_date index, so only those
 * blocks are read, and at most MAX_INVESTED_BLOCKS per goal. The running block is not
 * counted until it is marked: a query does not read the clock.
 */
export async function invested(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Invested[]> {
  const goals = await listForUser(ctx, userId);
  const activities = await Activities.listForUser(ctx, userId);
  const result: Invested[] = [];
  for (const goal of goals) {
    let minutes = 0;
    let budget = MAX_INVESTED_BLOCKS;
    for (const activity of activities) {
      if (activity.goalId !== goal._id || budget <= 0) continue;
      const blocks = await ctx.db
        .query("blocks")
        .withIndex("by_activityId_and_date", (q) =>
          q.eq("activityId", activity._id).gte("date", goal.createdOn),
        )
        .take(budget);
      budget -= blocks.length;
      for (const block of blocks) {
        if (block.userId === userId) minutes += block.actualDurationMin ?? 0;
      }
    }
    result.push({ goalId: goal._id, minutes, capped: budget <= 0 });
  }
  return result;
}

function checkDate(date: string): DateKey {
  if (!isDateKey(date)) throw appError("INVALID_INPUT");
  return date;
}

function requiredTitle(title: string): string {
  const cleaned = cleanName(title, MAX_TITLE_LENGTH);
  if (cleaned === null) throw appError("INVALID_INPUT");
  return cleaned;
}

function optionalWhy(text: string): string | undefined {
  const cleaned = cleanText(text, MAX_INTENT_LENGTH);
  if (cleaned === null) throw appError("INVALID_INPUT");
  return cleaned;
}
