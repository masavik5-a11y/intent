import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  INTENT_FIELDS,
  planEntry,
  type IntentField,
} from "../../shared/blocks";
import { findOverlap, overlapWindow, type LaneSpan } from "../../shared/lanes";
import {
  cleanName,
  cleanText,
  MAX_FOCUS_LENGTH,
  MAX_INTENT_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../shared/text";
import {
  daysBetween,
  isDateKey,
  isValidDuration,
  isValidMinute,
  type DateKey,
} from "../../shared/time";
import { appError } from "../lib/errors";
import * as Activities from "./activities";
import * as Categories from "./categories";

// The only module that writes the blocks table (CLAUDE.md, rule 4). It enforces the
// invariants in docs/ARCHITECTURE.md, section 5. In M1 every block is planned and
// every edit changes the plan; M2 adds actual times and the edit rule.

/** One lane holds at most 288 five-minute blocks a day, so this never cuts a day short. */
const MAX_BLOCKS_PER_DAY = 600;
/** The widest range one read may cover (docs/ARCHITECTURE.md, section 7). */
const MAX_RANGE_DAYS = 62;

type BlockFields = Omit<Doc<"blocks">, "_id" | "_creationTime" | "userId">;

export type NewBlock = { [F in IntentField]?: string } & {
  date: DateKey;
  /** Defaults to the activity's name. */
  title?: string;
  focus?: string;
  activityId?: Id<"activities">;
  /** Defaults to the activity's category. */
  categoryId?: Id<"categories">;
  plannedStartMin: number;
  plannedDurationMin: number;
};

/** Fields left out stay as they are; null clears an optional field. */
export type BlockChanges = { [F in IntentField]?: string | null } & {
  title?: string;
  focus?: string | null;
  /** Choosing another activity also moves the block to its category. */
  activityId?: Id<"activities"> | null;
  categoryId?: Id<"categories">;
  date?: DateKey;
  plannedStartMin?: number;
  plannedDurationMin?: number;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The user's block, or NOT_FOUND when it is missing or someone else's. */
export async function getOwned(
  ctx: QueryCtx,
  userId: Id<"users">,
  blockId: Id<"blocks">,
): Promise<Doc<"blocks">> {
  const block = await ctx.db.get("blocks", blockId);
  if (block === null || block.userId !== userId) throw appError("NOT_FOUND");
  return block;
}

/** The user's blocks dated `first` to `last`, both included, by date. */
export async function listBetween(
  ctx: QueryCtx,
  userId: Id<"users">,
  first: DateKey,
  last: DateKey,
): Promise<Doc<"blocks">[]> {
  const days = daysBetween(first, last) + 1;
  if (days < 1 || days > MAX_RANGE_DAYS) throw appError("INVALID_INPUT");
  return await ctx.db
    .query("blocks")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).gte("date", first).lte("date", last),
    )
    .take(days * MAX_BLOCKS_PER_DAY);
}

/**
 * Everything the day view of `date` can show: blocks dated the day before (tails
 * across midnight), the day, and the day after (before the grid's start, at the
 * bottom). See docs/ARCHITECTURE.md, section 4.
 */
export async function listForDay(
  ctx: QueryCtx,
  userId: Id<"users">,
  date: DateKey,
): Promise<Doc<"blocks">[]> {
  const [first, , last] = overlapWindow(checkDate(date));
  return await listBetween(ctx, userId, first, last);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function create(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: NewBlock,
): Promise<Id<"blocks">> {
  const date = checkDate(input.date);
  checkPlanTimes(input.plannedStartMin, input.plannedDurationMin);
  const activity =
    input.activityId === undefined
      ? null
      : await Activities.getOwned(ctx, userId, input.activityId);
  const categoryId = input.categoryId ?? activity?.categoryId;
  if (categoryId === undefined) throw appError("INVALID_INPUT");
  await Categories.getOwned(ctx, userId, categoryId);
  const title = requiredTitle(input.title ?? activity?.name ?? "");

  const fields: BlockFields = {
    date,
    title,
    categoryId,
    plannedStartMin: input.plannedStartMin,
    plannedDurationMin: input.plannedDurationMin,
    status: "planned",
  };
  if (activity !== null) fields.activityId = activity._id;
  const focus = optionalText(input.focus, MAX_FOCUS_LENGTH);
  if (focus !== undefined) fields.focus = focus;
  for (const field of INTENT_FIELDS) {
    const text = optionalText(input[field], MAX_INTENT_LENGTH);
    if (text !== undefined) fields[field] = text;
  }

  await assertFreeInPlan(ctx, userId, {
    date,
    startMin: fields.plannedStartMin,
    durationMin: fields.plannedDurationMin,
  });
  return await ctx.db.insert("blocks", { userId, ...fields });
}

export async function update(
  ctx: MutationCtx,
  userId: Id<"users">,
  blockId: Id<"blocks">,
  changes: BlockChanges,
): Promise<void> {
  const block = await getOwned(ctx, userId, blockId);
  // A field set to undefined in a patch is removed from the document.
  const patch: Partial<BlockFields> = {};

  if (changes.title !== undefined) patch.title = requiredTitle(changes.title);
  if (changes.focus !== undefined) {
    patch.focus = clearableText(changes.focus, MAX_FOCUS_LENGTH);
  }
  for (const field of INTENT_FIELDS) {
    const change = changes[field];
    if (change !== undefined) {
      patch[field] = clearableText(change, MAX_INTENT_LENGTH);
    }
  }

  if (changes.activityId === null) {
    patch.activityId = undefined;
  } else if (changes.activityId !== undefined) {
    const activity = await Activities.getOwned(ctx, userId, changes.activityId);
    patch.activityId = activity._id;
    if (activity._id !== block.activityId) {
      patch.categoryId = activity.categoryId;
    }
  }
  if (changes.categoryId !== undefined) {
    await Categories.getOwned(ctx, userId, changes.categoryId);
    patch.categoryId = changes.categoryId;
  }

  if (
    changes.date !== undefined ||
    changes.plannedStartMin !== undefined ||
    changes.plannedDurationMin !== undefined
  ) {
    const date =
      changes.date === undefined ? block.date : checkDate(changes.date);
    const startMin = changes.plannedStartMin ?? block.plannedStartMin;
    const durationMin = changes.plannedDurationMin ?? block.plannedDurationMin;
    checkPlanTimes(startMin, durationMin);
    await assertFreeInPlan(ctx, userId, {
      id: block._id,
      date,
      startMin,
      durationMin,
    });
    patch.date = date;
    patch.plannedStartMin = startMin;
    patch.plannedDurationMin = durationMin;
  }

  await ctx.db.patch("blocks", block._id, patch);
}

export async function remove(
  ctx: MutationCtx,
  userId: Id<"users">,
  blockId: Id<"blocks">,
): Promise<void> {
  const block = await getOwned(ctx, userId, blockId);
  await ctx.db.delete("blocks", block._id);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Invariant 6: a real calendar day. The UI never sends anything else. */
function checkDate(date: string): DateKey {
  if (!isDateKey(date)) throw appError("INVALID_INPUT");
  return date;
}

/** Invariant 4: minutes on the 5-minute step, start in a day, 5 minutes to a day long. */
function checkPlanTimes(startMin: number, durationMin: number): void {
  if (!isValidMinute(startMin) || !isValidDuration(durationMin)) {
    throw appError("INVALID_TIME");
  }
}

/** Invariant 7: a title of 1 to 80 characters after trimming. */
function requiredTitle(title: string): string {
  const cleaned = cleanName(title, MAX_TITLE_LENGTH);
  if (cleaned === null) throw appError("INVALID_INPUT");
  return cleaned;
}

/** Optional text, trimmed; undefined when blank or not given. */
function optionalText(
  value: string | undefined,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = cleanText(value, max);
  if (cleaned === null) throw appError("INVALID_INPUT");
  return cleaned;
}

/** Like optionalText, where null means "clear it". */
function clearableText(value: string | null, max: number): string | undefined {
  return value === null ? undefined : optionalText(value, max);
}

/**
 * Invariant 5: no two blocks share time in the plan lane, including the tails of
 * blocks that cross midnight from the day before, or into the day after.
 */
async function assertFreeInPlan(
  ctx: QueryCtx,
  userId: Id<"users">,
  candidate: LaneSpan & { id?: Id<"blocks"> },
): Promise<void> {
  const [first, , last] = overlapWindow(candidate.date);
  const lane = (await listBetween(ctx, userId, first, last)).map(planEntry);
  if (findOverlap(candidate, lane) !== null) throw appError("OVERLAP");
}
