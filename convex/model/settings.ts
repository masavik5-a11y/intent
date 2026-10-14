import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_SETTINGS, isTimeZoneName } from "../../shared/settings";
import { appError } from "../lib/errors";

// The only module that writes the settings table (CLAUDE.md, rule 4).
// Invariant: at most one settings row per user.

export async function getForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"settings"> | null> {
  return await ctx.db
    .query("settings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Creates the user's settings with the defaults and the device's time zone, unless
 * they exist already. An existing row is left as it is, time zone included.
 */
export async function ensureForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  timeZone: string,
): Promise<Id<"settings">> {
  if (!isTimeZoneName(timeZone)) throw appError("INVALID_INPUT");
  const existing = await getForUser(ctx, userId);
  if (existing !== null) return existing._id;
  return await ctx.db.insert("settings", {
    userId,
    timeZone,
    ...DEFAULT_SETTINGS,
  });
}
