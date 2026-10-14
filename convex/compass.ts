import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Compass from "./model/compass";

/** The signed-in user's vision and anti-vision, or null before either is written. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await Compass.getForUser(ctx, userId);
  },
});

/** Saves the vision or the anti-vision. Blank text clears it. */
export const save = mutation({
  args: {
    field: v.union(v.literal("vision"), v.literal("antiVision")),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Compass.saveText(ctx, userId, args.field, args.text);
    return null;
  },
});
