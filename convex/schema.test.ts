/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { DateKey } from "../shared/time";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// The schema checks shapes only; the rules live in convex/model/ and are tested there.
describe("schema", () => {
  test("accepts one document of each table so far, and every kind of block", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "me@intent.test" });
      await ctx.db.insert("settings", {
        userId,
        timeZone: "Europe/Prague",
        gridStartMin: 300,
        weekStartsOn: 1,
        wakeMin: 420,
        sleepMin: 1380,
      });
      await ctx.db.insert("compass", { userId, updatedAt: 0 });
      const categoryId = await ctx.db.insert("categories", {
        userId,
        name: "Body",
        kind: "intentional",
        colorKey: "teal",
        icon: "dumbbell",
        sortOrder: 1,
        archived: false,
      });
      const activityId = await ctx.db.insert("activities", {
        userId,
        name: "Gym",
        categoryId,
        defaultDurationMin: 90,
        notify: true,
        pressure: false,
        archived: false,
        why: "Energy for the camera.",
      });
      const blockId = await ctx.db.insert("blocks", {
        userId,
        date: "2026-10-14" as DateKey,
        title: "Gym",
        activityId,
        categoryId,
        plannedStartMin: 660,
        plannedDurationMin: 90,
        status: "planned",
      });
      const block = await ctx.db.get("blocks", blockId);
      expect(block?.date).toBe("2026-10-14");

      // M2: a block marked done, a skipped one, and an unplanned entry.
      await ctx.db.insert("blocks", {
        userId,
        date: "2026-10-14" as DateKey,
        title: "Write",
        categoryId,
        plannedStartMin: 540,
        plannedDurationMin: 60,
        status: "partial",
        actualStartMin: 540,
        actualDurationMin: 30,
        minimumChosen: true,
        note: "Only the outline.",
      });
      await ctx.db.insert("blocks", {
        userId,
        date: "2026-10-14" as DateKey,
        title: "Read",
        categoryId,
        plannedStartMin: 1200,
        plannedDurationMin: 30,
        status: "skipped",
        skipReason: "tired",
      });
      await ctx.db.insert("blocks", {
        userId,
        date: "2026-10-14" as DateKey,
        title: "Phone",
        categoryId,
        status: "done",
        actualStartMin: 780,
        actualDurationMin: 45,
      });

      // M3: a day record, a repeating rule, and its occurrences, one detached.
      await ctx.db.insert("days", {
        userId,
        date: "2026-10-14" as DateKey,
        mainFocus: "Script the reel.",
        wentWell: "The hook.",
        drifted: "Phone after lunch.",
        changeTomorrow: "Phone away after lunch.",
        rating: 4,
        energy: 3,
        reviewedAt: 0,
      });
      const recurrenceId = await ctx.db.insert("recurrences", {
        userId,
        activityId,
        title: "Gym",
        categoryId,
        startMin: 660,
        durationMin: 90,
        weekdays: [1, 3, 5],
        startDate: "2026-10-12" as DateKey,
        endDate: "2026-12-31" as DateKey,
        materializedThrough: "2026-10-30" as DateKey,
      });
      await ctx.db.insert("blocks", {
        userId,
        date: "2026-10-16" as DateKey,
        title: "Gym",
        activityId,
        categoryId,
        plannedStartMin: 660,
        plannedDurationMin: 90,
        status: "planned",
        recurrenceId,
      });
      await ctx.db.insert("blocks", {
        userId,
        date: "2026-10-19" as DateKey,
        title: "Gym",
        activityId,
        categoryId,
        plannedStartMin: 1080,
        plannedDurationMin: 90,
        status: "planned",
        recurrenceId,
        detached: true,
      });

      // M5: a goal, an activity pointing at it, and a category with a target.
      const goalId = await ctx.db.insert("goals", {
        userId,
        title: "Launch the course",
        why: "People asked for it.",
        dueDate: "2026-11-21" as DateKey,
        createdOn: "2026-10-16" as DateKey,
        status: "active",
        sortOrder: 0,
      });
      await ctx.db.insert("goals", {
        userId,
        title: "Read more",
        createdOn: "2026-10-16" as DateKey,
        status: "dropped",
        sortOrder: 1,
      });
      await ctx.db.patch("activities", activityId, { goalId });
      await ctx.db.patch("categories", categoryId, { weeklyTargetMin: 900 });
    });
  });
});
