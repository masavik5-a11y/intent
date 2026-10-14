/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { DateKey } from "../shared/time";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// The schema checks shapes only; the rules live in convex/model/ and are tested there.
describe("schema", () => {
  test("accepts one document of each M1 table", async () => {
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
    });
  });
});
