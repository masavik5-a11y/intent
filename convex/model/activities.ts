import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";

// The only module that writes the activities table (CLAUDE.md, rule 4).

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
