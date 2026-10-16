import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Categories from "./model/categories";

/** The signed-in user's categories, archived ones included, in their order. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const categories = await Categories.listForUser(ctx, userId);
    return categories.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Hours a week intended for a category, in minutes (PRD U5); null clears it. */
export const setWeeklyTarget = mutation({
  args: {
    categoryId: v.id("categories"),
    minutes: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Categories.setWeeklyTarget(
      ctx,
      userId,
      args.categoryId,
      args.minutes,
    );
    return null;
  },
});
