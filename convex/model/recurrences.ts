import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hasPlan } from "../../shared/blocks";
import {
  datesToMaterialize,
  isValidWeekdays,
  MATERIALIZE_AHEAD_DAYS,
  normalizeWeekdays,
  ON_DEMAND_MAX_DAYS,
  ruleProblem,
} from "../../shared/recurrence";
import {
  addDays,
  isDateKey,
  utcDateKey,
  type DateKey,
} from "../../shared/time";
import { appError } from "../lib/errors";
import * as Blocks from "./blocks";

// The only module that writes the recurrences table (CLAUDE.md, rule 4). A rule is
// materialised into ordinary blocks for a rolling window (docs/ARCHITECTURE.md,
// section 10); the blocks themselves are written by ./blocks.ts, which keeps the
// overlap rule.

/** A user has a handful of repeating blocks; this bounds every read of them. */
export const MAX_RULES = 200;

type RuleFields = Omit<Doc<"recurrences">, "_id" | "_creationTime">;

export interface RepeatSettings {
  /** 0 = Sunday … 6 = Saturday. */
  weekdays: readonly number[];
  endDate?: DateKey | undefined;
}

export interface RepeatResult {
  /** Dates in the first window the rule could not fill, with what was there. */
  skipped: Blocks.SkippedOccurrence[];
}

/** The user's rules, ended ones included. */
export async function listForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"recurrences">[]> {
  return await ctx.db
    .query("recurrences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .take(MAX_RULES);
}

/** The user's rule, or NOT_FOUND when it is missing or someone else's. */
export async function getOwned(
  ctx: QueryCtx,
  userId: Id<"users">,
  ruleId: Id<"recurrences">,
): Promise<Doc<"recurrences">> {
  const rule = await ctx.db.get("recurrences", ruleId);
  if (rule === null || rule.userId !== userId) throw appError("NOT_FOUND");
  return rule;
}

/** The date the window runs to: UTC today and 15 days, which covers every zone. */
export function windowEnd(nowMs: number): DateKey {
  return addDays(utcDateKey(nowMs), MATERIALIZE_AHEAD_DAYS);
}

/**
 * Makes a block repeat (PRD P3): a rule with the block's plan (title, activity,
 * category, focus, start and length) from the block's date, on `settings.weekdays`,
 * until `settings.endDate`. The block becomes its first occurrence; the rest of the
 * window is materialised at once, and the dates that did not fit are returned so the
 * screen can say so.
 */
export async function repeatBlock(
  ctx: MutationCtx,
  userId: Id<"users">,
  blockId: Id<"blocks">,
  settings: RepeatSettings,
): Promise<RepeatResult> {
  const block = await Blocks.getOwned(ctx, userId, blockId);
  if (!hasPlan(block)) throw appError("INVALID_INPUT");
  if (
    block.recurrenceId !== undefined &&
    (await ctx.db.get("recurrences", block.recurrenceId)) !== null
  ) {
    // It repeats already; changing that rule is "this and following".
    throw appError("INVALID_INPUT");
  }
  if (!isValidWeekdays(settings.weekdays)) throw appError("INVALID_INPUT");
  if (settings.endDate !== undefined && !isDateKey(settings.endDate)) {
    throw appError("INVALID_INPUT");
  }

  const fields: RuleFields = {
    userId,
    title: block.title,
    categoryId: block.categoryId,
    startMin: block.plannedStartMin,
    durationMin: block.plannedDurationMin,
    weekdays: normalizeWeekdays(settings.weekdays),
    startDate: block.date,
    // The block is the first occurrence: its date is done.
    materializedThrough: block.date,
  };
  if (block.activityId !== undefined) fields.activityId = block.activityId;
  if (block.focus !== undefined) fields.focus = block.focus;
  if (settings.endDate !== undefined) fields.endDate = settings.endDate;
  const problem = ruleProblem(fields);
  if (problem !== null) throw appError(problem);

  const ruleId = await ctx.db.insert("recurrences", fields);
  await Blocks.linkToRule(ctx, userId, block._id, ruleId);
  const rule = await getOwned(ctx, userId, ruleId);
  const end = windowEnd(Date.now());
  const skipped = await materialize(
    ctx,
    userId,
    rule,
    block.date > end ? block.date : end,
    addDays(block.date, 1),
  );
  return { skipped };
}

/**
 * Materialises a rule through `through`: every date after its `materializedThrough`
 * and not before `notBefore` gets its block, unless one is there already or the time
 * is taken. Then `materializedThrough` moves to `through`, so those dates are never
 * made again (decided 2026-10-15: a deleted occurrence stays deleted).
 */
export async function materialize(
  ctx: MutationCtx,
  userId: Id<"users">,
  rule: Doc<"recurrences">,
  through: DateKey,
  notBefore: DateKey,
): Promise<Blocks.SkippedOccurrence[]> {
  const dates = datesToMaterialize(rule, through, notBefore);
  const skipped = await Blocks.materializeOccurrences(ctx, userId, rule, dates);
  if (through > rule.materializedThrough) {
    await ctx.db.patch("recurrences", rule._id, {
      materializedThrough: through,
    });
  }
  return skipped;
}

/** Whether a rule has ended before any date it has not handled yet. */
function hasEnded(rule: Doc<"recurrences">): boolean {
  return rule.endDate !== undefined && rule.endDate <= rule.materializedThrough;
}

/**
 * The daily run (docs/ARCHITECTURE.md, section 10): every rule given is materialised
 * through UTC today + 15, never before UTC yesterday, so a date already over in every
 * zone is never filled. Rules that ended, or are far enough already, are not written.
 */
export async function materializeWindow(
  ctx: MutationCtx,
  rules: readonly Doc<"recurrences">[],
  nowMs: number,
): Promise<void> {
  const through = windowEnd(nowMs);
  const notBefore = addDays(utcDateKey(nowMs), -1);
  for (const rule of rules) {
    if (hasEnded(rule) || rule.materializedThrough >= through) continue;
    await materialize(ctx, rule.userId, rule, through, notBefore);
  }
}

/**
 * Opening a date beyond the window (decided 2026-10-15): the user's rules are
 * materialised through it, at most a year past UTC today. Dates left out here are
 * not reported; nobody asked for them yet.
 */
export async function materializeThrough(
  ctx: MutationCtx,
  userId: Id<"users">,
  date: DateKey,
  nowMs: number,
): Promise<void> {
  if (!isDateKey(date)) throw appError("INVALID_INPUT");
  const cap = addDays(utcDateKey(nowMs), ON_DEMAND_MAX_DAYS);
  const through = date > cap ? cap : date;
  const notBefore = addDays(utcDateKey(nowMs), -1);
  for (const rule of await listForUser(ctx, userId)) {
    if (hasEnded(rule) || rule.materializedThrough >= through) continue;
    if (rule.startDate > through) continue;
    await materialize(ctx, userId, rule, through, notBefore);
  }
}
