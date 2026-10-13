import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

// The signed-in user, or null when there is no session.
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get("users", userId);
    if (user === null) return null;
    return { email: user.email ?? null };
  },
});
