import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Blocks from "./model/blocks";
import { vDateKey } from "./schema";

/** The device's local day and minute when the button was pressed. */
const vNow = v.object({ date: vDateKey, minute: v.number() });

/**
 * Shifts the rest of a day by some minutes (PRD T11): every block of its grid still
 * ahead and not marked, or none. Says how many moved.
 */
export const shiftRest = mutation({
  args: { date: vDateKey, minutes: v.number(), now: vNow },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Blocks.shiftRest(
      ctx,
      userId,
      args.date,
      args.now,
      args.minutes,
    );
  },
});

/**
 * Moves a block of `day`'s grid to tomorrow (PRD T11); one that has begun stays,
 * skipped, and is copied. Says the day it went to.
 */
export const pushToTomorrow = mutation({
  args: { blockId: v.id("blocks"), day: vDateKey, now: vNow },
  returns: vDateKey,
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Blocks.pushToTomorrow(
      ctx,
      userId,
      args.blockId,
      args.day,
      args.now,
    );
  },
});
