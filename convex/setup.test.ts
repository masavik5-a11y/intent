import { afterEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_CATEGORIES } from "../shared/categories";
import { DEFAULT_SETTINGS } from "../shared/settings";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  expectAppError,
  newTest,
  signedIn,
  type TestConvex,
} from "./test.helpers";

function categoriesOf(t: TestConvex, userId: Id<"users">) {
  return t.run((ctx) =>
    ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
  );
}

describe("setup.ensure", () => {
  test("requires a session", async () => {
    const t = newTest();
    await expectAppError(
      t.mutation(api.setup.ensure, { timeZone: "Europe/Prague" }),
      "UNAUTHENTICATED",
    );
  });

  test("creates settings with the device's time zone and the defaults", async () => {
    const t = newTest();
    const { userId, as } = await signedIn(t);
    await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
    expect(await as.query(api.settings.get)).toMatchObject({
      userId,
      timeZone: "Europe/Prague",
      ...DEFAULT_SETTINGS,
    });
  });

  test("seeds the default categories in order", async () => {
    const t = newTest();
    const { userId, as } = await signedIn(t);
    await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
    // toMatchObject on an array also checks its length.
    expect(await categoriesOf(t, userId)).toMatchObject(
      DEFAULT_CATEGORIES.map((category, sortOrder) => ({
        ...category,
        userId,
        sortOrder,
        archived: false,
      })),
    );
  });

  test("changes nothing the second time, even from another time zone", async () => {
    const t = newTest();
    const { userId, as } = await signedIn(t);
    await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
    // The user renames a category before the next visit.
    const [first] = await categoriesOf(t, userId);
    if (first === undefined) throw new Error("no categories were seeded");
    await t.run((ctx) =>
      ctx.db.patch("categories", first._id, { name: "Creating" }),
    );

    await as.mutation(api.setup.ensure, { timeZone: "America/New_York" });

    const settings = await t.run((ctx) => ctx.db.query("settings").collect());
    expect(settings).toHaveLength(1);
    expect(settings[0]?.timeZone).toBe("Europe/Prague");
    const categories = await categoriesOf(t, userId);
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(categories[0]?.name).toBe("Creating");
  });

  test("keeps each user's rows apart", async () => {
    const t = newTest();
    const me = await signedIn(t, "me@intent.test");
    const other = await signedIn(t, "other@intent.test");
    await me.as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
    await other.as.mutation(api.setup.ensure, { timeZone: "Asia/Tokyo" });

    expect(await me.as.query(api.settings.get)).toMatchObject({
      userId: me.userId,
      timeZone: "Europe/Prague",
    });
    expect(await other.as.query(api.settings.get)).toMatchObject({
      userId: other.userId,
      timeZone: "Asia/Tokyo",
    });
    expect(await categoriesOf(t, me.userId)).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
    expect(await categoriesOf(t, other.userId)).toHaveLength(
      DEFAULT_CATEGORIES.length,
    );
  });

  test("rejects a malformed time zone and stores nothing", async () => {
    const t = newTest();
    const { userId, as } = await signedIn(t);
    await expectAppError(
      as.mutation(api.setup.ensure, { timeZone: "not a zone" }),
      "INVALID_INPUT",
    );
    expect(await as.query(api.settings.get)).toBeNull();
    expect(await categoriesOf(t, userId)).toEqual([]);
  });
});

describe("settings.get", () => {
  test("requires a session", async () => {
    const t = newTest();
    await expectAppError(t.query(api.settings.get), "UNAUTHENTICATED");
  });

  test("is null before the first visit", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    expect(await as.query(api.settings.get)).toBeNull();
  });
});

describe("settings.setWakeAndSleep", () => {
  test("requires a session", async () => {
    const t = newTest();
    await expectAppError(
      t.mutation(api.settings.setWakeAndSleep, {
        wakeMin: 420,
        sleepMin: 1380,
      }),
      "UNAUTHENTICATED",
    );
  });

  test("stores the waking hours", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
    await as.mutation(api.settings.setWakeAndSleep, {
      wakeMin: 390,
      sleepMin: 60, // 01:00, after midnight
    });
    expect(await as.query(api.settings.get)).toMatchObject({
      wakeMin: 390,
      sleepMin: 60,
    });
  });

  test.each([
    [425.5, 1380],
    [422, 1380],
    [420, 1440],
    [-5, 1380],
  ])("rejects wake %d and sleep %d", async (wakeMin, sleepMin) => {
    const t = newTest();
    const { as } = await signedIn(t);
    await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
    await expectAppError(
      as.mutation(api.settings.setWakeAndSleep, { wakeMin, sleepMin }),
      "INVALID_TIME",
    );
  });

  test("before the first visit there is nothing to change", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await expectAppError(
      as.mutation(api.settings.setWakeAndSleep, {
        wakeMin: 420,
        sleepMin: 1380,
      }),
      "NOT_FOUND",
    );
  });
});

describe("setup.complete", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("marks setup as done once; later calls keep the first time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    const t = newTest();
    const { as } = await signedIn(t);
    await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
    expect(
      (await as.query(api.settings.get))?.setupCompletedAt,
    ).toBeUndefined();

    await as.mutation(api.setup.complete, {});
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
    await as.mutation(api.setup.complete, {});

    expect((await as.query(api.settings.get))?.setupCompletedAt).toBe(
      Date.parse("2026-10-14T10:00:00Z"),
    );
  });

  test("requires a session", async () => {
    const t = newTest();
    await expectAppError(t.mutation(api.setup.complete, {}), "UNAUTHENTICATED");
  });
});
