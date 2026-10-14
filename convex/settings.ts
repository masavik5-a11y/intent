import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import * as Settings from "./model/settings";

/** The signed-in user's settings, or null until the first visit has created them. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    return await Settings.getForUser(ctx, userId);
  },
});
