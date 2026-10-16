import { defineSchema, defineTable } from "convex/server";
import { v, type VString } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import type { ColorKey } from "../shared/categories";
import type { DateKey } from "../shared/time";

// Tables and fields are added in the milestone that needs them (docs/ARCHITECTURE.md,
// section 5). The schema checks shapes; convex/model/ checks the rules.

/**
 * A local calendar day, "YYYY-MM-DD". The type is a promise the schema cannot check:
 * every write goes through a model function that validates it with isDateKey.
 */
export const vDateKey = v.string() as VString<DateKey>;

/** A colour key from shared/categories.ts, validated by the model like vDateKey. */
export const vColorKey = v.string() as VString<ColorKey>;

export const vCategoryKind = v.union(
  v.literal("intentional"),
  v.literal("maintenance"),
  v.literal("drift"),
);

/** What became of a block; shared/blocks.ts, BLOCK_STATUSES. */
export const vBlockStatus = v.union(
  v.literal("planned"),
  v.literal("done"),
  v.literal("partial"),
  v.literal("skipped"),
);

/** Why a block was skipped; shared/blocks.ts, SKIP_REASONS. */
export const vSkipReason = v.union(
  v.literal("tired"),
  v.literal("noTime"),
  v.literal("choseOther"),
  v.literal("forgot"),
  v.literal("other"),
);

/**
 * The intent of an activity, and a block's overrides of it. Unset on a block means
 * "inherit from the activity" (shared/blocks.ts, effectiveIntent).
 */
export const intentFields = {
  doneWhen: v.optional(v.string()),
  why: v.optional(v.string()),
  how: v.optional(v.string()),
  ifThen: v.optional(v.string()),
  minimumVersion: v.optional(v.string()),
  costOfSkipping: v.optional(v.string()),
};

export default defineSchema({
  ...authTables,

  // One row per user, created on the first signed-in visit.
  settings: defineTable({
    userId: v.id("users"),
    /** IANA name from the device, e.g. "Europe/Prague". */
    timeZone: v.string(),
    /** Where the day grid starts, in minutes from midnight. */
    gridStartMin: v.number(),
    /** 0 = Sunday … 6 = Saturday. */
    weekStartsOn: v.number(),
    /** The waking part of the day, which the grid's Fit zoom shows whole. */
    wakeMin: v.number(),
    sleepMin: v.number(),
    /** When first-run setup was finished or skipped (ms since the epoch). */
    setupCompletedAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  // One row per user: the vision and anti-vision texts (PRD V1).
  compass: defineTable({
    userId: v.id("users"),
    vision: v.optional(v.string()),
    antiVision: v.optional(v.string()),
    /** When either text was last saved (ms since the epoch), shown as a date. */
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  categories: defineTable({
    userId: v.id("users"),
    name: v.string(),
    kind: vCategoryKind,
    colorKey: vColorKey,
    /** A name from the app's icon set. */
    icon: v.string(),
    sortOrder: v.number(),
    archived: v.boolean(),
    /** Hours a week intended for it, in minutes (PRD U5). Unset: no target. */
    weeklyTargetMin: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  activities: defineTable({
    userId: v.id("users"),
    name: v.string(),
    categoryId: v.id("categories"),
    /** Unset: the category's icon. */
    icon: v.optional(v.string()),
    defaultDurationMin: v.number(),
    /** Block-start notifications for this activity (M4). */
    notify: v.boolean(),
    /** Countdown bar, and from M4 the ten-minutes-left warning. */
    pressure: v.boolean(),
    archived: v.boolean(),
    /** The goal its blocks work toward (PRD U6). */
    goalId: v.optional(v.id("goals")),
    ...intentFields,
  }).index("by_userId", ["userId"]),

  // A block has plan times, actual times, or both (docs/ARCHITECTURE.md, section 5).
  // The model checks which combinations may exist (shared/blocks.ts,
  // blockShapeProblem).
  blocks: defineTable({
    userId: v.id("users"),
    date: vDateKey,
    title: v.string(),
    focus: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
    categoryId: v.id("categories"),

    /**
     * Minutes from the local midnight of `date`. Start + duration may pass 1440.
     * Unset on an unplanned entry.
     */
    plannedStartMin: v.optional(v.number()),
    plannedDurationMin: v.optional(v.number()),

    status: vBlockStatus,
    /**
     * What happened, in minutes from the local midnight of `date`. Set on done and
     * partly done blocks and on unplanned entries. The start may pass 1440 (a block
     * planned before midnight that began after it); the end stays within the next day.
     */
    actualStartMin: v.optional(v.number()),
    actualDurationMin: v.optional(v.number()),
    /** Only on a skipped block, and only when a reason was given. */
    skipReason: v.optional(vSkipReason),
    /** A one-line note added after the fact (PRD A5). */
    note: v.optional(v.string()),
    /** "Start the minimum" was chosen (PRD V3). */
    minimumChosen: v.optional(v.boolean()),

    ...intentFields,

    /** The repeating rule this block is an occurrence of (PRD P3). */
    recurrenceId: v.optional(v.id("recurrences")),
    /**
     * Its plan was changed by hand ("This one"): changes to the rule leave it alone.
     * Marking it, its actual times and its note never set this.
     */
    detached: v.optional(v.boolean()),
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_recurrenceId_and_date", ["recurrenceId", "date"])
    // M5: the hours a goal's activities have had, read per activity.
    .index("by_activityId_and_date", ["activityId", "date"]),

  // One row per user and day, made the first time something is written for that day:
  // the main focus (written while planning, PRD P5) and the evening review (R1, R2).
  days: defineTable({
    userId: v.id("users"),
    date: vDateKey,
    /** What makes this day a win. Shown on the now panel that day. */
    mainFocus: v.optional(v.string()),
    /** "What went well?" */
    wentWell: v.optional(v.string()),
    /** "Where did time drift, and what triggered it?" */
    drifted: v.optional(v.string()),
    /** "One change for tomorrow" */
    changeTomorrow: v.optional(v.string()),
    /** 1 to 5, optional. */
    rating: v.optional(v.number()),
    /** 1 to 5, optional. */
    energy: v.optional(v.number()),
    /** When the review was closed (ms since the epoch); unset until it is. */
    reviewedAt: v.optional(v.number()),
  }).index("by_userId_and_date", ["userId", "date"]),

  // A repeating block (PRD P3): a rule that is materialised into ordinary blocks for
  // a rolling window (docs/ARCHITECTURE.md, section 10).
  recurrences: defineTable({
    userId: v.id("users"),
    activityId: v.optional(v.id("activities")),
    title: v.string(),
    focus: v.optional(v.string()),
    categoryId: v.id("categories"),
    /** Minutes from the local midnight of each date; start + duration may pass 1440. */
    startMin: v.number(),
    durationMin: v.number(),
    /** 0 = Sunday … 6 = Saturday; at least one, each once. */
    weekdays: v.array(v.number()),
    /** The first date it produces. */
    startDate: vDateKey,
    /** The last date it may produce. Unset: it goes on. */
    endDate: v.optional(vDateKey),
    /**
     * Every date up to here has been materialised. Only later dates are ever created,
     * so an occurrence deleted by hand stays deleted.
     */
    materializedThrough: vDateKey,
  }).index("by_userId", ["userId"]),

  // Something with a why and, usually, a date (PRD U6). Activities point at one.
  goals: defineTable({
    userId: v.id("users"),
    title: v.string(),
    why: v.optional(v.string()),
    /** The finish line. Unset: a goal without a date. */
    dueDate: v.optional(vDateKey),
    /** The device's day when it was made: hours invested count from here. */
    createdOn: vDateKey,
    status: v.union(
      v.literal("active"),
      v.literal("done"),
      v.literal("dropped"),
    ),
    sortOrder: v.number(),
  }).index("by_userId", ["userId"]),

  // Things captured without a date, to be scheduled later (PRD P8).
  inboxItems: defineTable({
    userId: v.id("users"),
    /** What it is, 1 to 80 characters. */
    title: v.string(),
    /** A line more, if any. */
    note: v.optional(v.string()),
    /** Set when the capture names an activity; scheduling starts from it. */
    activityId: v.optional(v.id("activities")),
  }).index("by_userId", ["userId"]),
});
