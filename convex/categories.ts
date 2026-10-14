import { query } from "./_generated/server";
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
