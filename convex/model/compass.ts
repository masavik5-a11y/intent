import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { cleanText, MAX_COMPASS_LENGTH } from "../../shared/text";
import { appError } from "../lib/errors";

// The only module that writes the compass table (CLAUDE.md, rule 4). One row per
// user: the vision and the anti-vision, the user's own words (PRD V1).

export type CompassField = "vision" | "antiVision";

export async function getForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"compass"> | null> {
  return await ctx.db
    .query("compass")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/**
 * Saves one of the two texts, creating the row the first time. Blank text clears it.
 * `updatedAt` records when either was last saved: the weekly review asks once a
 * quarter whether it is still true (PRD V5).
 */
export async function saveText(
  ctx: MutationCtx,
  userId: Id<"users">,
  field: CompassField,
  text: string,
): Promise<void> {
  const cleaned = cleanText(text, MAX_COMPASS_LENGTH);
  if (cleaned === null) throw appError("INVALID_INPUT");
  const updatedAt = Date.now();
  const existing = await getForUser(ctx, userId);
  if (existing === null) {
    await ctx.db.insert("compass", {
      userId,
      updatedAt,
      ...(cleaned === undefined ? {} : { [field]: cleaned }),
    });
    return;
  }
  // A field set to undefined in a patch is removed from the document.
  await ctx.db.patch("compass", existing._id, {
    [field]: cleaned,
    updatedAt,
  });
}
