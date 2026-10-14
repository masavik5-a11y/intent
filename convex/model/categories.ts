import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_CATEGORIES } from "../../shared/categories";
import { appError } from "../lib/errors";

// The only module that writes the categories table (CLAUDE.md, rule 4).

/** More than anyone needs; keeps every read of the table bounded. */
export const MAX_CATEGORIES = 50;

/** The user's categories, archived ones included, in creation order. */
export async function listForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"categories">[]> {
  return await ctx.db
    .query("categories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_CATEGORIES);
}

/** The user's category, or NOT_FOUND when it is missing or someone else's. */
export async function getOwned(
  ctx: QueryCtx,
  userId: Id<"users">,
  categoryId: Id<"categories">,
): Promise<Doc<"categories">> {
  const category = await ctx.db.get("categories", categoryId);
  if (category === null || category.userId !== userId) {
    throw appError("NOT_FOUND");
  }
  return category;
}

/**
 * Gives a user the default categories (docs/DESIGN.md, section 5), unless they have
 * any category at all: once seeded, what they edit or archive stays as they left it.
 */
export async function seedDefaults(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const first = await ctx.db
    .query("categories")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (first !== null) return;
  for (const [sortOrder, category] of DEFAULT_CATEGORIES.entries()) {
    await ctx.db.insert("categories", {
      userId,
      ...category,
      sortOrder,
      archived: false,
    });
  }
}
