import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Activities from "./model/activities";
import { intentFields } from "./schema";

/** In an update: left out keeps the field, null clears it. */
const clearableText = v.optional(v.union(v.string(), v.null()));

/** The signed-in user's activities, archived ones included. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await Activities.listForUser(ctx, userId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    categoryId: v.id("categories"),
    icon: v.optional(v.string()),
    defaultDurationMin: v.number(),
    notify: v.boolean(),
    pressure: v.boolean(),
    ...intentFields,
  },
  returns: v.id("activities"),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    return await Activities.create(ctx, userId, args);
  },
});

/** Changes an activity. Fields left out stay as they are; null clears one. */
export const update = mutation({
  args: {
    activityId: v.id("activities"),
    name: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    icon: v.optional(v.union(v.string(), v.null())),
    defaultDurationMin: v.optional(v.number()),
    notify: v.optional(v.boolean()),
    pressure: v.optional(v.boolean()),
    doneWhen: clearableText,
    why: clearableText,
    how: clearableText,
    ifThen: clearableText,
    minimumVersion: clearableText,
    costOfSkipping: clearableText,
  },
  returns: v.null(),
  handler: async (ctx, { activityId, ...changes }) => {
    const userId = await requireUser(ctx);
    await Activities.update(ctx, userId, activityId, changes);
    return null;
  },
});

/** Archives an activity, or restores it with `archived: false`. */
export const setArchived = mutation({
  args: { activityId: v.id("activities"), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Activities.setArchived(ctx, userId, args.activityId, args.archived);
    return null;
  },
});
