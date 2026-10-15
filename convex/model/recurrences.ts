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
import {
  cleanName,
  cleanText,
  MAX_FOCUS_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../shared/text";
import { appError } from "../lib/errors";
import * as Activities from "./activities";
import * as Blocks from "./blocks";
import * as Categories from "./categories";

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
  const current =
    block.recurrenceId === undefined
      ? null
      : await ctx.db.get("recurrences", block.recurrenceId);
  if (
    current !== null &&
    block.date >= current.startDate &&
    coversDate(current, block.date)
  ) {
    // It repeats already; changing that rule is "this and following". A block its
    // rule no longer reaches (the rule ended before it) may start a rule of its own.
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

/**
 * What "this and following" may change (PRD P3; decided 2026-10-15): the plan every
 * occurrence gets, and when the rule repeats. Left out keeps; null clears.
 */
export interface RuleChanges {
  title?: string;
  focus?: string | null;
  /** Choosing another activity also moves the rule to its category. */
  activityId?: Id<"activities"> | null;
  categoryId?: Id<"categories">;
  plannedStartMin?: number;
  plannedDurationMin?: number;
  weekdays?: readonly number[];
  /** Null: it goes on. */
  endDate?: DateKey | null;
}

/** Whether a rule produces dates up to and including `date`. */
export function coversDate(rule: Doc<"recurrences">, date: DateKey): boolean {
  return rule.endDate === undefined || rule.endDate >= date;
}

/**
 * "This and following" (decided 2026-10-15): changes the rule from the date of the
 * block it is made from. From the rule's first date the rule itself changes; from a
 * later one it ends the day before and a new rule carries on with the change, so the
 * days already past keep the plan they had. The block gets the new plan; the later
 * occurrences still to do are made anew (one deleted by hand may come back), and the
 * marked or detached ones stay where they are. Returns the dates of the window that
 * did not fit.
 */
export async function changeFrom(
  ctx: MutationCtx,
  userId: Id<"users">,
  blockId: Id<"blocks">,
  changes: RuleChanges,
): Promise<RepeatResult> {
  const block = await Blocks.getOwned(ctx, userId, blockId);
  if (!hasPlan(block) || block.recurrenceId === undefined) {
    throw appError("INVALID_INPUT");
  }
  const rule = await getOwned(ctx, userId, block.recurrenceId);
  const from = block.date;
  if (!coversDate(rule, from)) throw appError("INVALID_INPUT");

  const next = await changedFields(ctx, userId, rule, changes);
  if (next.endDate !== undefined && next.endDate < from) {
    throw appError("INVALID_INPUT");
  }
  const problem = ruleProblem({ ...next, startDate: from });
  if (problem !== null) throw appError(problem);

  let target: Id<"recurrences">;
  if (from <= rule.startDate) {
    await ctx.db.replace(
      "recurrences",
      rule._id,
      withoutUnset({
        ...next,
        userId,
        startDate: from,
        materializedThrough: from,
      }),
    );
    target = rule._id;
  } else {
    await ctx.db.patch("recurrences", rule._id, {
      endDate: addDays(from, -1),
    });
    target = await ctx.db.insert(
      "recurrences",
      withoutUnset({
        ...next,
        userId,
        startDate: from,
        materializedThrough: from,
      }),
    );
  }

  await Blocks.clearOccurrencesFrom(ctx, rule._id, from, target, block._id);
  const planChanges =
    changes.title !== undefined ||
    changes.focus !== undefined ||
    changes.activityId !== undefined ||
    changes.categoryId !== undefined ||
    changes.plannedStartMin !== undefined ||
    changes.plannedDurationMin !== undefined;
  if (block.detached === true && !planChanges) {
    // Only when it repeats changed: a block moved by hand keeps its own plan.
    await Blocks.moveToRule(ctx, userId, block._id, target);
  } else {
    await Blocks.followRule(ctx, userId, block._id, target, {
      title: next.title,
      focus: next.focus,
      activityId: next.activityId,
      categoryId: next.categoryId,
      plannedStartMin: next.startMin,
      plannedDurationMin: next.durationMin,
    });
  }
  const updated = await getOwned(ctx, userId, target);
  const end = windowEnd(Date.now());
  const through = [rule.materializedThrough, end, from].reduce((a, b) =>
    a > b ? a : b,
  );
  const skipped = await materialize(
    ctx,
    userId,
    updated,
    through,
    addDays(from, 1),
  );
  return { skipped };
}

/**
 * Deleting "this and following" (decided 2026-10-15): the rule ends the day before
 * the block's date. That block goes, and so do the later occurrences still to do;
 * marked or detached ones stay as plain blocks.
 */
export async function endFrom(
  ctx: MutationCtx,
  userId: Id<"users">,
  blockId: Id<"blocks">,
): Promise<void> {
  const block = await Blocks.getOwned(ctx, userId, blockId);
  if (block.recurrenceId === undefined) throw appError("INVALID_INPUT");
  const rule = await getOwned(ctx, userId, block.recurrenceId);
  const from = block.date;
  // The rule is kept, ended, so the blocks that stay still say where they came from.
  await ctx.db.patch("recurrences", rule._id, { endDate: addDays(from, -1) });
  await Blocks.clearOccurrencesFrom(ctx, rule._id, from, rule._id, block._id);
  await Blocks.remove(ctx, userId, block._id);
}

/** The rule's fields with `changes` applied and checked: text, ownership, weekdays. */
async function changedFields(
  ctx: QueryCtx,
  userId: Id<"users">,
  rule: Doc<"recurrences">,
  changes: RuleChanges,
): Promise<
  Omit<RuleFields, "userId" | "startDate" | "materializedThrough"> & {
    focus: string | undefined;
    activityId: Id<"activities"> | undefined;
    endDate: DateKey | undefined;
  }
> {
  let title = rule.title;
  if (changes.title !== undefined) {
    const cleaned = cleanName(changes.title, MAX_TITLE_LENGTH);
    if (cleaned === null) throw appError("INVALID_INPUT");
    title = cleaned;
  }
  let focus = rule.focus;
  if (changes.focus !== undefined) {
    const cleaned =
      changes.focus === null
        ? undefined
        : cleanText(changes.focus, MAX_FOCUS_LENGTH);
    if (cleaned === null) throw appError("INVALID_INPUT");
    focus = cleaned;
  }
  let activityId = rule.activityId;
  let categoryId = rule.categoryId;
  if (changes.activityId === null) {
    activityId = undefined;
  } else if (changes.activityId !== undefined) {
    const activity = await Activities.getOwned(ctx, userId, changes.activityId);
    if (activity._id !== rule.activityId) categoryId = activity.categoryId;
    activityId = activity._id;
  }
  if (changes.categoryId !== undefined) {
    await Categories.getOwned(ctx, userId, changes.categoryId);
    categoryId = changes.categoryId;
  }
  let weekdays = rule.weekdays;
  if (changes.weekdays !== undefined) {
    if (!isValidWeekdays(changes.weekdays)) throw appError("INVALID_INPUT");
    weekdays = normalizeWeekdays(changes.weekdays);
  }
  let endDate = rule.endDate;
  if (changes.endDate === null) {
    endDate = undefined;
  } else if (changes.endDate !== undefined) {
    if (!isDateKey(changes.endDate)) throw appError("INVALID_INPUT");
    endDate = changes.endDate;
  }
  return {
    title,
    focus,
    activityId,
    categoryId,
    startMin: changes.plannedStartMin ?? rule.startMin,
    durationMin: changes.plannedDurationMin ?? rule.durationMin,
    weekdays,
    endDate,
  };
}

/** A rule's fields without the optional ones that are unset. */
function withoutUnset(
  fields: RuleFields & {
    focus: string | undefined;
    activityId: Id<"activities"> | undefined;
    endDate: DateKey | undefined;
  },
): RuleFields {
  const { focus, activityId, endDate, ...rest } = fields;
  const result: RuleFields = { ...rest };
  if (focus !== undefined) result.focus = focus;
  if (activityId !== undefined) result.activityId = activityId;
  if (endDate !== undefined) result.endDate = endDate;
  return result;
}
