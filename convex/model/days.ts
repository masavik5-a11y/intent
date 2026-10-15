import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  isReturning,
  isScalePoint,
  REFLECTION_FIELDS,
  RETURNING_LOOK_BACK_DAYS,
  type ReflectionField,
} from "../../shared/days";
import {
  cleanText,
  MAX_FOCUS_LENGTH,
  MAX_REFLECTION_LENGTH,
} from "../../shared/text";
import { addDays, isDateKey, type DateKey } from "../../shared/time";
import { appError } from "../lib/errors";

// The only module that writes the days table (CLAUDE.md, rule 4). At most one row per
// user and date, made the first time something is written for that day: its main
// focus (PRD P5) and its evening review (R1, R2).

type DayFields = Omit<Doc<"days">, "_id" | "_creationTime" | "userId" | "date">;

/** What the reflection step saves. Left out keeps a field; null clears it. */
export type ReflectionChanges = { [F in ReflectionField]?: string | null } & {
  rating?: number | null;
  energy?: number | null;
};

/** The user's record of `date`, or null when nothing has been written for it. */
export async function getForDate(
  ctx: QueryCtx,
  userId: Id<"users">,
  date: DateKey,
): Promise<Doc<"days"> | null> {
  return await ctx.db
    .query("days")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).eq("date", checkDate(date)),
    )
    .unique();
}

/** Sets or clears (null or blank) what makes the day a win. */
export async function setMainFocus(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: DateKey,
  mainFocus: string | null,
): Promise<void> {
  await write(ctx, userId, date, {
    mainFocus: clearable(mainFocus, MAX_FOCUS_LENGTH),
  });
}

/** Saves the answers to the three prompts, the rating and the energy (PRD R2). */
export async function saveReflection(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: DateKey,
  changes: ReflectionChanges,
): Promise<void> {
  const patch: Partial<DayFields> = {};
  for (const field of REFLECTION_FIELDS) {
    const change = changes[field];
    if (change !== undefined) {
      patch[field] = clearable(change, MAX_REFLECTION_LENGTH);
    }
  }
  if (changes.rating !== undefined) patch.rating = scale(changes.rating);
  if (changes.energy !== undefined) patch.energy = scale(changes.energy);
  await write(ctx, userId, date, patch);
}

/** The review of `date` is closed: from now on the day counts as reviewed. */
export async function closeReview(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: DateKey,
): Promise<void> {
  await write(ctx, userId, date, { reviewedAt: Date.now() });
}

/**
 * Whether today opens with "Welcome back. Plan today?" (shared/days.ts, isReturning):
 * the latest day of the last 14 with anything recorded (a block marked, an entry
 * logged, a review closed), read newest first through the date index and stopping
 * at the first; and whether anything is dated before today at all.
 */
export async function returning(
  ctx: QueryCtx,
  userId: Id<"users">,
  today: DateKey,
): Promise<boolean> {
  checkDate(today);
  const from = addDays(today, -RETURNING_LOOK_BACK_DAYS);
  let lastRecorded: DateKey | null = null;
  const blocks = ctx.db
    .query("blocks")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).gte("date", from).lte("date", today),
    )
    .order("desc");
  for await (const block of blocks) {
    if (block.status !== "planned") {
      lastRecorded = block.date;
      break;
    }
  }
  const days = ctx.db
    .query("days")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).gte("date", from).lte("date", today),
    )
    .order("desc");
  for await (const day of days) {
    if (day.reviewedAt !== undefined) {
      if (lastRecorded === null || day.date > lastRecorded) {
        lastRecorded = day.date;
      }
      break;
    }
  }
  const before = await ctx.db
    .query("blocks")
    .withIndex("by_userId_and_date", (q) =>
      q.eq("userId", userId).lt("date", today),
    )
    .first();
  return isReturning({ lastRecorded, usedBefore: before !== null, today });
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Applies a patch to the day's row, creating it the first time. A field set to
 * undefined is removed; a patch that only removes needs no new row.
 */
async function write(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: DateKey,
  patch: Partial<DayFields>,
): Promise<void> {
  const existing = await getForDate(ctx, userId, date);
  if (existing !== null) {
    await ctx.db.patch("days", existing._id, patch);
    return;
  }
  const fields = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<DayFields>;
  if (Object.keys(fields).length === 0) return;
  await ctx.db.insert("days", { userId, date, ...fields });
}

function checkDate(date: string): DateKey {
  if (!isDateKey(date)) throw appError("INVALID_INPUT");
  return date;
}

/** Trimmed text; undefined when blank or null (clear it); refused when too long. */
function clearable(value: string | null, max: number): string | undefined {
  if (value === null) return undefined;
  const cleaned = cleanText(value, max);
  if (cleaned === null) throw appError("INVALID_INPUT");
  return cleaned;
}

/** A point on the 1-to-5 scale, or undefined to clear it. */
function scale(value: number | null): number | undefined {
  if (value === null) return undefined;
  if (!isScalePoint(value)) throw appError("INVALID_INPUT");
  return value;
}
