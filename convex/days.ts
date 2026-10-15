import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Days from "./model/days";
import { vDateKey } from "./schema";

/** In an update: left out keeps the field, null clears it. */
const clearableText = v.optional(v.union(v.string(), v.null()));
const clearableNumber = v.optional(v.union(v.number(), v.null()));

/** The record of a day: its main focus and its review. Null before anything is written. */
export const get = query({
  args: { date: vDateKey },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Days.getForDate(ctx, userId, args.date);
  },
});

/** What makes the day a win (PRD P5). Null or blank clears it. */
export const setMainFocus = mutation({
  args: { date: vDateKey, mainFocus: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Days.setMainFocus(ctx, userId, args.date, args.mainFocus);
    return null;
  },
});

/** The review's three answers, the day rating and the energy (PRD R2). */
export const saveReflection = mutation({
  args: {
    date: vDateKey,
    wentWell: clearableText,
    drifted: clearableText,
    changeTomorrow: clearableText,
    rating: clearableNumber,
    energy: clearableNumber,
  },
  returns: v.null(),
  handler: async (ctx, { date, ...changes }) => {
    const userId = await requireUser(ctx);
    await Days.saveReflection(ctx, userId, date, changes);
    return null;
  },
});

/** Closes the evening review of a day (PRD R1). */
export const closeReview = mutation({
  args: { date: vDateKey },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Days.closeReview(ctx, userId, args.date);
    return null;
  },
});
