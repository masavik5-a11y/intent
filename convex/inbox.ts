import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Inbox from "./model/inbox";
import { vDateKey } from "./schema";

/** The signed-in user's inbox, oldest first (PRD P8). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await Inbox.listForUser(ctx, userId);
  },
});

/** Captures something without a date, to schedule later. */
export const capture = mutation({
  args: {
    title: v.string(),
    note: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
  },
  returns: v.id("inboxItems"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Inbox.capture(ctx, userId, args);
  },
});

/** Lets an item go. */
export const remove = mutation({
  args: { itemId: v.id("inboxItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Inbox.remove(ctx, userId, args.itemId);
    return null;
  },
});

/** Puts an item on a day as a planned block and takes it out of the inbox. */
export const schedule = mutation({
  args: {
    itemId: v.id("inboxItems"),
    date: vDateKey,
    plannedStartMin: v.number(),
    plannedDurationMin: v.number(),
    title: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
    categoryId: v.optional(v.id("categories")),
  },
  returns: v.id("blocks"),
  handler: async (ctx, { itemId, ...placement }) => {
    const userId = await requireUser(ctx);
    return await Inbox.schedule(ctx, userId, itemId, placement);
  },
});
