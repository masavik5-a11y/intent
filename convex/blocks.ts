import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Blocks from "./model/blocks";
import { intentFields, vDateKey, vSkipReason } from "./schema";

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

/** Logs an unplanned entry: something that happened without a plan (PRD A3). */
export const logEntry = mutation({
  args: {
    date: vDateKey,
    title: v.optional(v.string()),
    categoryId: v.id("categories"),
    activityId: v.optional(v.id("activities")),
    actualStartMin: v.number(),
    actualDurationMin: v.number(),
  },
  returns: v.id("blocks"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Blocks.logEntry(ctx, userId, args);
  },
});

/**
 * Changes a block: its plan, its intent, and for a block that has them, what happened
 * and the note. Fields left out stay as they are; null clears one.
 */
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
    actualStartMin: v.optional(v.number()),
    actualDurationMin: v.optional(v.number()),
    note: clearableText,
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

/** Done, Partly, Skip, Undo (PRD A1, A4) or Start the minimum (PRD V3). */
export const setStatus = mutation({
  args: {
    blockId: v.id("blocks"),
    action: v.union(
      v.object({ type: v.literal("done") }),
      v.object({ type: v.literal("partial"), minutes: v.number() }),
      v.object({ type: v.literal("skip"), reason: v.optional(vSkipReason) }),
      v.object({ type: v.literal("undo") }),
      v.object({ type: v.literal("startMinimum") }),
    ),
    /** The device's local day and minute when the button was pressed. */
    now: v.object({ date: vDateKey, minute: v.number() }),
  },
  returns: v.null(),
  handler: async (ctx, { blockId, action, now }) => {
    const userId = await requireUser(ctx);
    await Blocks.setStatus(ctx, userId, blockId, action, now);
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
