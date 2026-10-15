import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DateKey } from "../shared/time";
import { api } from "./_generated/api";
import { expectAppError, newTest, signedIn } from "./test.helpers";

const THU = "2026-10-15" as DateKey;
const FRI = "2026-10-16" as DateKey;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T19:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("days", () => {
  test("every function requires a session", async () => {
    const t = newTest();
    await expectAppError(
      t.query(api.days.get, { date: THU }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      t.mutation(api.days.setMainFocus, { date: THU, mainFocus: "Ship it" }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      t.mutation(api.days.saveReflection, { date: THU, rating: 3 }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      t.mutation(api.days.closeReview, { date: THU }),
      "UNAUTHENTICATED",
    );
  });

  test("a day is null until something is written for it", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    expect(await as.query(api.days.get, { date: THU })).toBeNull();
  });

  test("the main focus is trimmed, one row per day, and blank clears it", async () => {
    const t = newTest();
    const { userId, as } = await signedIn(t);
    await as.mutation(api.days.setMainFocus, {
      date: FRI,
      mainFocus: "  Finish the course outline.  ",
    });
    await as.mutation(api.days.setMainFocus, {
      date: FRI,
      mainFocus: "Finish the outline.",
    });
    expect(await as.query(api.days.get, { date: FRI })).toMatchObject({
      userId,
      date: FRI,
      mainFocus: "Finish the outline.",
    });
    expect(await t.run((ctx) => ctx.db.query("days").collect())).toHaveLength(
      1,
    );

    await as.mutation(api.days.setMainFocus, { date: FRI, mainFocus: "  " });
    const cleared = await as.query(api.days.get, { date: FRI });
    expect(cleared?.mainFocus).toBeUndefined();
  });

  test("clearing a day that has no row writes nothing", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await as.mutation(api.days.setMainFocus, { date: FRI, mainFocus: null });
    expect(await t.run((ctx) => ctx.db.query("days").collect())).toEqual([]);
  });

  test("the reflection keeps what is left out and clears what is null", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await as.mutation(api.days.saveReflection, {
      date: THU,
      wentWell: " The script came together. ",
      drifted: "Phone after lunch, waiting for a reply.",
      changeTomorrow: "Phone in the other room after lunch.",
      rating: 4,
      energy: 3,
    });
    await as.mutation(api.days.saveReflection, {
      date: THU,
      drifted: null,
      energy: null,
    });
    const day = await as.query(api.days.get, { date: THU });
    expect(day).toMatchObject({
      wentWell: "The script came together.",
      changeTomorrow: "Phone in the other room after lunch.",
      rating: 4,
    });
    expect(day?.drifted).toBeUndefined();
    expect(day?.energy).toBeUndefined();
    // Writing the review does not close it.
    expect(day?.reviewedAt).toBeUndefined();
  });

  test("a rating and an energy are 1 to 5", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    for (const rating of [0, 6, 2.5]) {
      await expectAppError(
        as.mutation(api.days.saveReflection, { date: THU, rating }),
        "INVALID_INPUT",
      );
    }
    await expectAppError(
      as.mutation(api.days.saveReflection, { date: THU, energy: 9 }),
      "INVALID_INPUT",
    );
  });

  test("text too long is refused", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await expectAppError(
      as.mutation(api.days.setMainFocus, {
        date: THU,
        mainFocus: "x".repeat(121),
      }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.days.saveReflection, {
        date: THU,
        wentWell: "x".repeat(1001),
      }),
      "INVALID_INPUT",
    );
  });

  test("closing the review records when, and keeps the main focus", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await as.mutation(api.days.setMainFocus, {
      date: THU,
      mainFocus: "Script the reel.",
    });
    await as.mutation(api.days.closeReview, { date: THU });
    expect(await as.query(api.days.get, { date: THU })).toMatchObject({
      mainFocus: "Script the reel.",
      reviewedAt: Date.parse("2026-10-15T19:30:00Z"),
    });
  });

  test("a date that is not a real day is refused", async () => {
    const t = newTest();
    const { as } = await signedIn(t);
    await expectAppError(
      as.query(api.days.get, { date: "2026-02-30" as DateKey }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.days.closeReview, { date: "tomorrow" as DateKey }),
      "INVALID_INPUT",
    );
  });

  test("each user sees only their own days", async () => {
    const t = newTest();
    const me = await signedIn(t, "me@intent.test");
    const other = await signedIn(t, "other@intent.test");
    await me.as.mutation(api.days.setMainFocus, {
      date: THU,
      mainFocus: "Mine.",
    });
    expect(await other.as.query(api.days.get, { date: THU })).toBeNull();
    await other.as.mutation(api.days.setMainFocus, {
      date: THU,
      mainFocus: "Theirs.",
    });
    expect((await me.as.query(api.days.get, { date: THU }))?.mainFocus).toBe(
      "Mine.",
    );
  });
});

describe("days.returning", () => {
  const day = (value: string) => value as DateKey;

  /** A signed-in user with categories, and a way to put blocks on days. */
  async function user(t: ReturnType<typeof newTest>, email = "me@intent.test") {
    const { userId, as } = await signedIn(t, email);
    await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
    const categoryId = await t.run(async (ctx) => {
      const category = await ctx.db
        .query("categories")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .first();
      if (category === null) throw new Error("no category");
      return category._id;
    });
    const planned = (date: DateKey, startMin = 540) =>
      as.mutation(api.blocks.create, {
        date,
        title: "Write",
        categoryId,
        plannedStartMin: startMin,
        plannedDurationMin: 60,
      });
    const logged = (date: DateKey) =>
      as.mutation(api.blocks.logEntry, {
        date,
        categoryId,
        actualStartMin: 780,
        actualDurationMin: 30,
      });
    return { as, planned, logged };
  }

  test("requires a session", async () => {
    const t = newTest();
    await expectAppError(
      t.query(api.days.returning, { today: THU }),
      "UNAUTHENTICATED",
    );
  });

  test("a first day in the app is not a return", async () => {
    const t = newTest();
    const { as, planned } = await user(t);
    expect(await as.query(api.days.returning, { today: THU })).toBe(false);
    await planned(THU);
    expect(await as.query(api.days.returning, { today: THU })).toBe(false);
  });

  test("something recorded yesterday or today: no welcome", async () => {
    const t = newTest();
    const { as, logged } = await user(t);
    await logged(day("2026-10-14"));
    expect(await as.query(api.days.returning, { today: THU })).toBe(false);
    expect(
      await as.query(api.days.returning, { today: day("2026-10-14") }),
    ).toBe(false);
  });

  test("the last day with a status two days back or more: welcome back", async () => {
    const t = newTest();
    const { as, planned } = await user(t);
    const blockId = await planned(day("2026-10-12"));
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "skip" },
      now: { date: day("2026-10-12"), minute: 500 },
    });
    // Planned blocks since then, untouched, do not count as recorded.
    await planned(day("2026-10-13"));
    await planned(day("2026-10-14"));
    await planned(THU);
    expect(await as.query(api.days.returning, { today: THU })).toBe(true);
  });

  test("a review counts as recorded", async () => {
    const t = newTest();
    const { as, planned } = await user(t);
    await planned(day("2026-10-10"));
    await as.mutation(api.days.closeReview, { date: day("2026-10-14") });
    expect(await as.query(api.days.returning, { today: THU })).toBe(false);
    // A main focus alone is a plan, not a record.
    await as.mutation(api.days.setMainFocus, {
      date: day("2026-10-17"),
      mainFocus: "Ship it.",
    });
    expect(
      await as.query(api.days.returning, { today: day("2026-10-17") }),
    ).toBe(true);
  });

  test("nothing recorded in the last 14 days, after earlier use: welcome back", async () => {
    const t = newTest();
    const { as, logged } = await user(t);
    await logged(day("2026-09-01"));
    expect(await as.query(api.days.returning, { today: THU })).toBe(true);
  });

  test("only the caller's own days count", async () => {
    const t = newTest();
    const me = await user(t);
    const other = await user(t, "other@intent.test");
    await me.logged(day("2026-10-01"));
    await other.logged(THU);
    expect(await me.as.query(api.days.returning, { today: THU })).toBe(true);
    expect(await other.as.query(api.days.returning, { today: THU })).toBe(
      false,
    );
  });
});
