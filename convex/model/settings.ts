import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_SETTINGS, isTimeZoneName } from "../../shared/settings";
import { isValidMinute } from "../../shared/time";
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

/** The user's settings row; NOT_FOUND before the first visit has created it. */
async function requireForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"settings">> {
  const settings = await getForUser(ctx, userId);
  if (settings === null) throw appError("NOT_FOUND");
  return settings;
}

/** When the day usually starts and ends: what the grid's Fit zoom shows whole. */
export async function setWakeAndSleep(
  ctx: MutationCtx,
  userId: Id<"users">,
  wakeMin: number,
  sleepMin: number,
): Promise<void> {
  if (!isValidMinute(wakeMin) || !isValidMinute(sleepMin)) {
    throw appError("INVALID_TIME");
  }
  const settings = await requireForUser(ctx, userId);
  await ctx.db.patch("settings", settings._id, { wakeMin, sleepMin });
}

/** Marks first-run setup as done. The first time counts; later calls change nothing. */
export async function completeSetup(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const settings = await requireForUser(ctx, userId);
  if (settings.setupCompletedAt !== undefined) return;
  await ctx.db.patch("settings", settings._id, {
    setupCompletedAt: Date.now(),
  });
}
