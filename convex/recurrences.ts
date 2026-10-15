import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
