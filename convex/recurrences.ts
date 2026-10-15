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
