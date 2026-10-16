import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Goals from "./model/goals";
import { vDateKey } from "./schema";

const vGoalStatus = v.union(
  v.literal("active"),
  v.literal("done"),
  v.literal("dropped"),
);

/** The signed-in user's goals, done and dropped ones included. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await Goals.listForUser(ctx, userId);
  },
});

/** Hours invested in each goal: actual minutes on its activities since it was made. */
export const invested = query({
  args: {},
  returns: v.array(
    v.object({
      goalId: v.id("goals"),
      minutes: v.number(),
      capped: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await Goals.invested(ctx, userId);
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    why: v.optional(v.string()),
    dueDate: v.optional(vDateKey),
    /** The device's day: hours invested count from here. */
    today: vDateKey,
  },
  returns: v.id("goals"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Goals.create(ctx, userId, args);
  },
});

/** Changes a goal. Fields left out stay as they are; null clears one. */
export const update = mutation({
  args: {
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    why: v.optional(v.union(v.string(), v.null())),
    dueDate: v.optional(v.union(vDateKey, v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { goalId, ...changes }) => {
    const userId = await requireUser(ctx);
    await Goals.update(ctx, userId, goalId, changes);
    return null;
  },
});

/** Marks a goal done or dropped, or reopens it. */
export const setStatus = mutation({
  args: { goalId: v.id("goals"), status: vGoalStatus },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Goals.setStatus(ctx, userId, args.goalId, args.status);
    return null;
  },
});
