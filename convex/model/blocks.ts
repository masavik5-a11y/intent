import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  actualLaneOf,
  applyStatus,
  blockShapeProblem,
  hasActual,
  hasPlan,
  INTENT_FIELDS,
  planLaneOf,
  type IntentField,
  type StatusAction,
  type StatusProblem,
} from "../../shared/blocks";
import { findOverlap, overlapWindow, placeSpans } from "../../shared/lanes";
import { copyablePlan, shiftedPlan } from "../../shared/planning";
import { planOccurrences } from "../../shared/recurrence";
import { DEFAULT_SETTINGS } from "../../shared/settings";
import {
  cleanName,
  cleanText,
  MAX_FOCUS_LENGTH,
  MAX_INTENT_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
} from "../../shared/text";
import type { ErrorCode } from "../../shared/errors";
import {
  addDays,
  daysBetween,
  isDateKey,
  MINUTES_PER_DAY,
  type DateKey,
  type LocalMoment,
} from "../../shared/time";
import { appError } from "../lib/errors";
import * as Activities from "./activities";
import * as Categories from "./categories";
import * as Settings from "./settings";

// The only module that writes the blocks table (CLAUDE.md, rule 4). It enforces the
// invariants in docs/ARCHITECTURE.md, section 5: every write checks the fields the
// block will have (shared/blocks.ts, blockShapeProblem) and that it fits both lanes.

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

/** An unplanned entry (PRD A3): only what happened, so status `done` and no plan. */
export interface NewEntry {
  /** The calendar day it began on. */
  date: DateKey;
  /** Defaults to the activity's name, else the category's: "Drift". */
  title?: string;
  categoryId: Id<"categories">;
  /** What it was, when it was one of the activities (a gap filled in the review). */
  activityId?: Id<"activities">;
  /** Minutes from the midnight of `date`, below 1440. */
  actualStartMin: number;
  actualDurationMin: number;
}

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
  /** What happened (PRD A2): only a block that has actual times can change them. */
  actualStartMin?: number;
  actualDurationMin?: number;
  /** The one-line note after the fact (PRD A5). */
  note?: string | null;
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

  checkShape(fields);
  await assertFree(ctx, userId, fields);
  return await ctx.db.insert("blocks", { userId, ...fields });
}

/** Logs an unplanned entry in the actual lane (PRD A3). */
export async function logEntry(
  ctx: MutationCtx,
  userId: Id<"users">,
  input: NewEntry,
): Promise<Id<"blocks">> {
  const date = checkDate(input.date);
  const category = await Categories.getOwned(ctx, userId, input.categoryId);
  const activity =
    input.activityId === undefined
      ? null
      : await Activities.getOwned(ctx, userId, input.activityId);
  const typed = input.title === undefined ? "" : input.title.trim();
  const fields: BlockFields = {
    date,
    title: requiredTitle(
      typed !== "" ? typed : (activity?.name ?? category.name),
    ),
    categoryId: category._id,
    status: "done",
    actualStartMin: input.actualStartMin,
    actualDurationMin: input.actualDurationMin,
  };
  if (activity !== null) fields.activityId = activity._id;
  checkShape(fields);
  await assertFree(ctx, userId, fields);
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
  if (changes.note !== undefined) {
    patch.note = clearableText(changes.note, MAX_NOTE_LENGTH);
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

  const timesChange =
    changes.date !== undefined ||
    changes.plannedStartMin !== undefined ||
    changes.plannedDurationMin !== undefined ||
    changes.actualStartMin !== undefined ||
    changes.actualDurationMin !== undefined;
  if (changes.date !== undefined) patch.date = checkDate(changes.date);
  if (changes.plannedStartMin !== undefined) {
    patch.plannedStartMin = changes.plannedStartMin;
  }
  if (changes.plannedDurationMin !== undefined) {
    patch.plannedDurationMin = changes.plannedDurationMin;
  }
  // Setting actual times on a block without them would make a planned or skipped
  // block look done; the shape check refuses that.
  if (changes.actualStartMin !== undefined) {
    patch.actualStartMin = changes.actualStartMin;
  }
  if (changes.actualDurationMin !== undefined) {
    patch.actualDurationMin = changes.actualDurationMin;
  }

  const next = { ...fieldsOf(block), ...patch };
  checkShape(next);
  if (timesChange) await assertFree(ctx, userId, next, block._id);
  await ctx.db.patch("blocks", block._id, patch);
}

/**
 * Done, Partly, Skip, Undo (PRD A1, A4) or Start the minimum (PRD V3), as
 * shared/blocks.ts applyStatus decides.
 * `now` is the device's local day and minute: Done on a running block ends then, and
 * the device's clock is the one the screen showed when the button was pressed.
 */
export async function setStatus(
  ctx: MutationCtx,
  userId: Id<"users">,
  blockId: Id<"blocks">,
  action: StatusAction,
  now: LocalMoment,
): Promise<void> {
  const block = await getOwned(ctx, userId, blockId);
  checkMoment(now);
  const others = await othersAround(ctx, userId, block.date, block._id);
  const result = applyStatus(block, action, actualLaneOf(others), now);
  if ("problem" in result) throw appError(STATUS_ERRORS[result.problem]);
  const next = { ...fieldsOf(block), ...result.fields };
  checkShape(next);
  assertFreeAmong(next, others);
  // Fields set to undefined (actual times on Skip and Undo) are removed.
  await ctx.db.patch("blocks", block._id, result.fields);
}

const STATUS_ERRORS: Record<StatusProblem, ErrorCode> = {
  UNPLANNED: "INVALID_INPUT",
  NOT_STARTED: "NOT_STARTED",
  NO_ROOM: "NO_ROOM",
  INVALID_TIME: "INVALID_TIME",
  MARKED: "INVALID_INPUT",
};

/** What "Copy from a date" did: how many it copied, and what did not fit. */
export interface CopyResult {
  copied: number;
  /** Each with what stood in its way. */
  skipped: { title: string; startMin: number; blockedBy: string }[];
}

/**
 * Copies the plan of `from`'s grid onto `to` (PRD P2; decided 2026-10-15): the plan
 * lane only (times, title, activity, category, focus, done-when and the other
 * overrides), as plain blocks still to do. Blocks a rule made are left out, since the
 * rule puts them there itself. A block that would overlap anything on `to` is left
 * out and listed; nothing already there moves.
 */
export async function copyPlan(
  ctx: MutationCtx,
  userId: Id<"users">,
  from: DateKey,
  to: DateKey,
): Promise<CopyResult> {
  checkDate(from);
  checkDate(to);
  if (from === to) throw appError("INVALID_INPUT");
  const settings = await Settings.getForUser(ctx, userId);
  const gridStartMin = settings?.gridStartMin ?? DEFAULT_SETTINGS.gridStartMin;
  const source = copyablePlan(
    await listForDay(ctx, userId, from),
    from,
    gridStartMin,
  );
  if (source.length === 0) return { copied: 0, skipped: [] };

  // A copy lands on `to` or, after midnight, the day after: read what can collide.
  const around = await listBetween(
    ctx,
    userId,
    addDays(to, -1),
    addDays(to, 2),
  );
  const { placed, blocked } = placeSpans(
    source.map((block) => ({ ...shiftedPlan(block, from, to), block })),
    planLaneOf(around),
  );
  for (const { block, date, startMin, durationMin } of placed) {
    const fields: BlockFields = {
      date,
      title: block.title,
      categoryId: block.categoryId,
      plannedStartMin: startMin,
      plannedDurationMin: durationMin,
      status: "planned",
    };
    if (block.activityId !== undefined) fields.activityId = block.activityId;
    if (block.focus !== undefined) fields.focus = block.focus;
    for (const field of INTENT_FIELDS) {
      const text = block[field];
      if (text !== undefined) fields[field] = text;
    }
    checkShape(fields);
    await ctx.db.insert("blocks", { userId, ...fields });
  }
  return {
    copied: placed.length,
    skipped: blocked.map(({ candidate, by }) => ({
      title: candidate.block.title,
      startMin: candidate.startMin,
      blockedBy: "block" in by ? by.block.title : "",
    })),
  };
}

/** A date a rule could not fill, and the block that was there. */
export interface SkippedOccurrence {
  date: DateKey;
  blockedBy: string;
}

/** At most this many days of occurrences are placed against one read of the lane. */
const OCCURRENCE_CHUNK_DAYS = MAX_RANGE_DAYS - 2;

/**
 * Makes a rule's occurrences on `dates` (ascending): plain planned blocks linked to
 * the rule (docs/ARCHITECTURE.md, section 10). A date that already has one of this
 * rule's blocks is left alone, so running it twice creates nothing new. One that
 * would overlap a block in the plan lane is not made; nothing there moves (decided
 * 2026-10-15). Says which dates were left out and what stood there.
 */
export async function materializeOccurrences(
  ctx: MutationCtx,
  userId: Id<"users">,
  rule: Doc<"recurrences">,
  dates: readonly DateKey[],
): Promise<SkippedOccurrence[]> {
  const skipped: SkippedOccurrence[] = [];
  let index = 0;
  while (index < dates.length) {
    const first = dates[index];
    if (first === undefined) break;
    const chunk = dates
      .slice(index)
      .filter((date) => daysBetween(first, date) < OCCURRENCE_CHUNK_DAYS);
    index += chunk.length;
    const last = chunk[chunk.length - 1] ?? first;
    // Reads this transaction's own writes, so earlier chunks and rules count too.
    const around = await listBetween(
      ctx,
      userId,
      addDays(first, -1),
      addDays(last, 1),
    );
    const taken = new Set<string>(
      around
        .filter((block) => block.recurrenceId === rule._id)
        .map((block) => block.date),
    );
    const plan = planOccurrences({
      rule,
      dates: chunk,
      taken,
      lane: planLaneOf(around),
    });
    for (const span of plan.create) {
      const fields: BlockFields = {
        date: span.date,
        title: rule.title,
        categoryId: rule.categoryId,
        plannedStartMin: span.startMin,
        plannedDurationMin: span.durationMin,
        status: "planned",
        recurrenceId: rule._id,
      };
      if (rule.activityId !== undefined) fields.activityId = rule.activityId;
      if (rule.focus !== undefined) fields.focus = rule.focus;
      checkShape(fields);
      await ctx.db.insert("blocks", { userId, ...fields });
    }
    for (const { date, by } of plan.skipped) {
      skipped.push({
        date,
        blockedBy: "block" in by ? by.block.title : rule.title,
      });
    }
  }
  return skipped;
}

/** Makes a block the first occurrence of the rule made from it. */
export async function linkToRule(
  ctx: MutationCtx,
  userId: Id<"users">,
  blockId: Id<"blocks">,
  ruleId: Id<"recurrences">,
): Promise<void> {
  const block = await getOwned(ctx, userId, blockId);
  await ctx.db.patch("blocks", block._id, {
    recurrenceId: ruleId,
    detached: undefined,
  });
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

/** A local day and minute from the device: a real day, a whole minute in it. */
function checkMoment(now: LocalMoment): void {
  checkDate(now.date);
  if (
    !Number.isInteger(now.minute) ||
    now.minute < 0 ||
    now.minute >= MINUTES_PER_DAY
  ) {
    throw appError("INVALID_INPUT");
  }
}

/** Invariants 1 to 4, on the fields a block is about to have. */
function checkShape(fields: BlockFields): void {
  const problem = blockShapeProblem(fields);
  if (problem !== null) throw appError(problem);
}

/** A stored block without the fields the database owns. */
function fieldsOf(block: Doc<"blocks">): BlockFields {
  const { _id: _, _creationTime: __, userId: ___, ...fields } = block;
  return fields;
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

/** The user's blocks that can share time with one dated `date`, except `blockId`. */
async function othersAround(
  ctx: QueryCtx,
  userId: Id<"users">,
  date: DateKey,
  blockId: Id<"blocks"> | undefined,
): Promise<Doc<"blocks">[]> {
  const [first, , last] = overlapWindow(date);
  return (await listBetween(ctx, userId, first, last)).filter(
    (other) => other._id !== blockId,
  );
}

/**
 * Invariant 5: in neither lane does a block share time with another, including the
 * tails of blocks that cross midnight from the day before, or into the day after.
 * `blockId` is the block being changed, which may stay where it is.
 */
async function assertFree(
  ctx: QueryCtx,
  userId: Id<"users">,
  block: BlockFields,
  blockId?: Id<"blocks">,
): Promise<void> {
  assertFreeAmong(block, await othersAround(ctx, userId, block.date, blockId));
}

/** Invariant 5 against blocks already loaded with othersAround. */
function assertFreeAmong(
  block: BlockFields,
  others: readonly Doc<"blocks">[],
): void {
  const inPlan =
    hasPlan(block) &&
    findOverlap(
      {
        date: block.date,
        startMin: block.plannedStartMin,
        durationMin: block.plannedDurationMin,
      },
      planLaneOf(others),
    ) !== null;
  const inActual =
    hasActual(block) &&
    findOverlap(
      {
        date: block.date,
        startMin: block.actualStartMin,
        durationMin: block.actualDurationMin,
      },
      actualLaneOf(others),
    ) !== null;
  if (inPlan || inActual) throw appError("OVERLAP");
}
