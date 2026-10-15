import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Recurrences from "./model/recurrences";
import { vDateKey } from "./schema";

const vSkipped = v.array(v.object({ date: vDateKey, blockedBy: v.string() }));

/** The signed-in user's repeating rules (PRD P3). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await Recurrences.listForUser(ctx, userId);
  },
});

/**
 * Makes a block repeat on `weekdays` from its date, until `endDate` if given. Returns
 * the dates of the first window that did not fit and what is there.
 */
export const repeat = mutation({
  args: {
    blockId: v.id("blocks"),
    weekdays: v.array(v.number()),
    endDate: v.optional(vDateKey),
  },
  returns: v.object({ skipped: vSkipped }),
  handler: async (ctx, { blockId, ...settings }) => {
    const userId = await requireUser(ctx);
    return await Recurrences.repeatBlock(ctx, userId, blockId, settings);
  },
});

/** In a change: left out keeps the field, null clears it. */
const clearableText = v.optional(v.union(v.string(), v.null()));

/**
 * "This and following" (PRD P3): changes the rule of the block's occurrence from its
 * date on: what (title, activity, category, focus), when (start, length), and on which
 * weekdays until when. Returns the dates of the window that did not fit.
 */
export const changeFrom = mutation({
  args: {
    blockId: v.id("blocks"),
    title: v.optional(v.string()),
    focus: clearableText,
    activityId: v.optional(v.union(v.id("activities"), v.null())),
    categoryId: v.optional(v.id("categories")),
    plannedStartMin: v.optional(v.number()),
    plannedDurationMin: v.optional(v.number()),
    weekdays: v.optional(v.array(v.number())),
    endDate: v.optional(v.union(vDateKey, v.null())),
  },
  returns: v.object({ skipped: vSkipped }),
  handler: async (ctx, { blockId, ...changes }) => {
    const userId = await requireUser(ctx);
    return await Recurrences.changeFrom(ctx, userId, blockId, changes);
  },
});

/**
 * Deleting "this and following": the rule ends the day before the block's date, and
 * the occurrences from then on that are still to do go with the block.
 */
export const endFrom = mutation({
  args: { blockId: v.id("blocks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Recurrences.endFrom(ctx, userId, args.blockId);
    return null;
  },
});

/**
 * Opening a date beyond the materialised window (docs/ARCHITECTURE.md, section 10):
 * the user's rules are materialised through it, at most a year ahead.
 */
export const materializeThrough = mutation({
  args: { date: vDateKey },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Recurrences.materializeThrough(ctx, userId, args.date, Date.now());
    return null;
  },
});

/** Rules handled per run of the daily job; the rest follow in the next. */
const RULES_PER_RUN = 25;

/**
 * The daily job (convex/crons.ts): every user's rules through UTC today + 15, a page
 * at a time, each page scheduling the next.
 */
export const materializeAll = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("recurrences")
      .paginate({ numItems: RULES_PER_RUN, cursor: args.cursor ?? null });
    await Recurrences.materializeWindow(ctx, page.page, Date.now());
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.recurrences.materializeAll, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
