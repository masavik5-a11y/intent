import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Settings from "./model/settings";

/** The signed-in user's settings, or null until the first visit has created them. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await Settings.getForUser(ctx, userId);
  },
});

/** Sets when the day usually starts and ends, in minutes from midnight. */
export const setWakeAndSleep = mutation({
  args: { wakeMin: v.number(), sleepMin: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Settings.setWakeAndSleep(ctx, userId, args.wakeMin, args.sleepMin);
    return null;
  },
});
