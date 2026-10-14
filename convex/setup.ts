import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Categories from "./model/categories";
import * as Settings from "./model/settings";

/**
 * Called by the app on every signed-in visit. The first time, it creates the user's
 * settings with the device's time zone and seeds the default categories; after that
 * it changes nothing. Running it from the client, not from a sign-up hook, is what
 * lets it read the device's time zone, and covers accounts made before M1.
 */
export const ensure = mutation({
  args: { timeZone: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await Settings.ensureForUser(ctx, userId, args.timeZone);
    await Categories.seedDefaults(ctx, userId);
    return null;
  },
});
