import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/** The signed-in user's account details. */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get("users", userId);
    return { email: user?.email ?? null };
  },
});
