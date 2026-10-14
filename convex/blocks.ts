import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Blocks from "./model/blocks";
import { intentFields, vDateKey } from "./schema";

/** In an update: left out keeps the field, null clears it. */
const clearableText = v.optional(v.union(v.string(), v.null()));

/** The blocks the day view of `date` can show: dated the day before, the day, and after. */
export const listForDay = query({
  args: { date: vDateKey },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Blocks.listForDay(ctx, userId, args.date);
  },
});

/** Plans a block. From an activity, the title and category default to the activity's. */
export const create = mutation({
  args: {
    date: vDateKey,
    title: v.optional(v.string()),
    focus: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
    categoryId: v.optional(v.id("categories")),
    plannedStartMin: v.number(),
    plannedDurationMin: v.number(),
    ...intentFields,
  },
  returns: v.id("blocks"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Blocks.create(ctx, userId, args);
  },
});

/** Changes a block's plan. Fields left out stay as they are; null clears one. */
export const update = mutation({
  args: {
    blockId: v.id("blocks"),
    title: v.optional(v.string()),
    focus: clearableText,
    activityId: v.optional(v.union(v.id("activities"), v.null())),
    categoryId: v.optional(v.id("categories")),
    date: v.optional(vDateKey),
    plannedStartMin: v.optional(v.number()),
    plannedDurationMin: v.optional(v.number()),
    doneWhen: clearableText,
    why: clearableText,
    how: clearableText,
    ifThen: clearableText,
    minimumVersion: clearableText,
    costOfSkipping: clearableText,
  },
  returns: v.null(),
  handler: async (ctx, { blockId, ...changes }) => {
    const userId = await requireUser(ctx);
    await Blocks.update(ctx, userId, blockId, changes);
    return null;
  },
});

export const remove = mutation({
  args: { blockId: v.id("blocks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Blocks.remove(ctx, userId, args.blockId);
    return null;
  },
});
