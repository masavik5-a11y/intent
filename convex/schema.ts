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
    ...intentFields,
  }).index("by_userId", ["userId"]),

  // M1 has plan fields only. M2 adds the actual times and the other statuses, and
  // makes the plan times optional for unplanned entries.
  blocks: defineTable({
    userId: v.id("users"),
    date: vDateKey,
    title: v.string(),
    focus: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
    categoryId: v.id("categories"),

    /** Minutes from the local midnight of `date`. Start + duration may pass 1440. */
    plannedStartMin: v.number(),
    plannedDurationMin: v.number(),

    status: v.literal("planned"),

    ...intentFields,
  }).index("by_userId_and_date", ["userId", "date"]),
});
