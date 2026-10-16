import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  cleanName,
  cleanText,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../shared/text";
import type { DateKey } from "../../shared/time";
import { appError } from "../lib/errors";
import * as Activities from "./activities";
import * as Blocks from "./blocks";

// The only module that writes the inboxItems table (CLAUDE.md, rule 4). The inbox
// holds things captured without a date (PRD P8) until they are scheduled onto a day,
// which makes them an ordinary block, or let go.

/** An inbox longer than this is not an inbox any more; keeps every read bounded. */
export const MAX_INBOX_ITEMS = 200;

type ItemFields = Omit<Doc<"inboxItems">, "_id" | "_creationTime" | "userId">;

export interface Capture {
  title: string;
  note?: string;
  activityId?: Id<"activities">;
}

/** Where and how a captured item becomes a block. */
export interface Placement {
  date: DateKey;
  plannedStartMin: number;
  plannedDurationMin: number;
  /** The block's title; defaults to the item's. */
  title?: string;
  activityId?: Id<"activities">;
  categoryId?: Id<"categories">;
}

/** The user's item, or NOT_FOUND when it is missing or someone else's. */
export async function getOwned(
  ctx: QueryCtx,
  userId: Id<"users">,
  itemId: Id<"inboxItems">,
): Promise<Doc<"inboxItems">> {
  const item = await ctx.db.get("inboxItems", itemId);
  if (item === null || item.userId !== userId) throw appError("NOT_FOUND");
  return item;
}

/** The user's inbox, oldest first. */
export async function listForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"inboxItems">[]> {
  return await ctx.db
    .query("inboxItems")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_INBOX_ITEMS);
}

/** Captures something for later. */
export async function capture(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: Capture,
): Promise<Id<"inboxItems">> {
  const count = (await listForUser(ctx, userId)).length;
  if (count >= MAX_INBOX_ITEMS) throw appError("INVALID_INPUT");
  const title = cleanName(input.title, MAX_TITLE_LENGTH);
  if (title === null) throw appError("INVALID_INPUT");
  const fields: ItemFields = { title };
  if (input.note !== undefined) {
    const note = cleanText(input.note, MAX_NOTE_LENGTH);
    if (note === null) throw appError("INVALID_INPUT");
    if (note !== undefined) fields.note = note;
  }
  if (input.activityId !== undefined) {
    const activity = await Activities.getOwned(ctx, userId, input.activityId);
    fields.activityId = activity._id;
  }
  return await ctx.db.insert("inboxItems", { userId, ...fields });
}

/** Lets an item go: it is removed, nothing else changes. */
export async function remove(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: Id<"inboxItems">,
): Promise<void> {
  const item = await getOwned(ctx, userId, itemId);
  await ctx.db.delete("inboxItems", item._id);
}

/**
 * Schedules an item onto a day: it becomes a planned block (checked like any new
 * block, so it never overlaps) and leaves the inbox, in one step. If the block
 * cannot be made, the item stays.
 */
export async function schedule(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: Id<"inboxItems">,
  placement: Placement,
): Promise<Id<"blocks">> {
  const item = await getOwned(ctx, userId, itemId);
  const activityId = placement.activityId ?? item.activityId;
  const blockId = await Blocks.create(ctx, userId, {
    date: placement.date,
    title: placement.title ?? item.title,
    plannedStartMin: placement.plannedStartMin,
    plannedDurationMin: placement.plannedDurationMin,
    ...(activityId === undefined ? {} : { activityId }),
    ...(placement.categoryId === undefined
      ? {}
      : { categoryId: placement.categoryId }),
  });
  await ctx.db.delete("inboxItems", item._id);
  return blockId;
}
