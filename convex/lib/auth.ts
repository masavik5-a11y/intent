import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";

/**
 * The signed-in user's id. Throws UNAUTHENTICATED when there is no session.
 * Every public function starts with this (CLAUDE.md, rule 5).
 */
export async function requireUser(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw appError("UNAUTHENTICATED");
  return userId;
}
