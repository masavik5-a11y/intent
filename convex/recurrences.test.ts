import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DateKey } from "../shared/time";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  expectAppError,
  newTest,
  signedIn,
  type TestConvex,
} from "./test.helpers";

// Repeating blocks (PRD P3; docs/ARCHITECTURE.md, section 10). "Now" is Thursday
// 15 Oct 2026, 10:00 UTC, so the window runs through Friday 30 Oct.
const THU = "2026-10-15" as DateKey;
const d = (value: string) => value as DateKey;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** A signed-in user with the default categories. */
async function setUp(t: TestConvex, email = "me@intent.test") {
  const { userId, as } = await signedIn(t, email);
  await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
  const categories = await t.run((ctx) =>
    ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(20),
  );
  const byName = (name: string): Id<"categories"> => {
    const found = categories.find((category) => category.name === name);
    if (found === undefined) throw new Error(`no category ${name}`);
    return found._id;
  };
  return { userId, as, body: byName("Body"), sleep: byName("Sleep") };
}

type Caller = Awaited<ReturnType<typeof setUp>>["as"];

async function plan(
  as: Caller,
  categoryId: Id<"categories">,
  date: DateKey,
  startMin: number,
  minutes: number,
  title: string,
) {
  return await as.mutation(api.blocks.create, {
    date,
    title,
    categoryId,
    plannedStartMin: startMin,
    plannedDurationMin: minutes,
  });
}

/** Every block of the user, in date and time order. */
async function allBlocks(t: TestConvex, userId: Id<"users">) {
  const blocks = await t.run((ctx) =>
    ctx.db
      .query("blocks")
      .withIndex("by_userId_and_date", (q) => q.eq("userId", userId))
      .collect(),
  );
  return blocks.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.plannedStartMin ?? 0) - (b.plannedStartMin ?? 0),
  );
}

function datesOf(blocks: Doc<"blocks">[], title: string) {
  return blocks.filter((block) => block.title === title).map((b) => b.date);
}

describe("recurrences.repeat", () => {
  test("requires a session", async () => {
    const t = newTest();
    const { as, body } = await setUp(t);
    const blockId = await plan(as, body, THU, 660, 90, "Gym");
    await expectAppError(
      t.mutation(api.recurrences.repeat, { blockId, weekdays: [4] }),
      "UNAUTHENTICATED",
    );
    await expectAppError(t.query(api.recurrences.list, {}), "UNAUTHENTICATED");
  });

  test("the block becomes the first occurrence, and the window fills at once", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const blockId = await plan(as, body, THU, 660, 90, "Gym");
    await as.mutation(api.blocks.update, { blockId, focus: "Push day" });

    expect(
      await as.mutation(api.recurrences.repeat, {
        blockId,
        weekdays: [5, 1, 3], // Mon, Wed, Fri
      }),
    ).toEqual({ skipped: [] });

    const [rule] = await as.query(api.recurrences.list, {});
    expect(rule).toMatchObject({
      userId,
      title: "Gym",
      focus: "Push day",
      categoryId: body,
      startMin: 660,
      durationMin: 90,
      weekdays: [1, 3, 5],
      startDate: THU,
      materializedThrough: "2026-10-30",
    });
    const blocks = await allBlocks(t, userId);
    // Thursday's own block, then Mon, Wed, Fri through Friday 30 Oct.
    expect(datesOf(blocks, "Gym")).toEqual([
      THU,
      "2026-10-16",
      "2026-10-19",
      "2026-10-21",
      "2026-10-23",
      "2026-10-26",
      "2026-10-28",
      "2026-10-30",
    ]);
    for (const block of blocks) {
      expect(block).toMatchObject({
        recurrenceId: rule?._id,
        status: "planned",
        focus: "Push day",
        plannedStartMin: 660,
        plannedDurationMin: 90,
      });
      expect(block.detached).toBeUndefined();
    }
  });

  test("an end date in the window stops it there", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const blockId = await plan(as, body, THU, 660, 90, "Gym");
    await as.mutation(api.recurrences.repeat, {
      blockId,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      endDate: d("2026-10-18"),
    });
    expect(datesOf(await allBlocks(t, userId), "Gym")).toEqual([
      THU,
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  test("a date where the time is taken is left out and named; that block stays", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const dentist = await plan(as, body, d("2026-10-21"), 690, 60, "Dentist");
    const blockId = await plan(as, body, THU, 660, 90, "Gym");
    expect(
      await as.mutation(api.recurrences.repeat, {
        blockId,
        weekdays: [3], // Wednesdays
      }),
    ).toEqual({ skipped: [{ date: "2026-10-21", blockedBy: "Dentist" }] });
    const blocks = await allBlocks(t, userId);
    expect(datesOf(blocks, "Gym")).toEqual([THU, "2026-10-28"]);
    expect(blocks.find((block) => block._id === dentist)).toMatchObject({
      date: "2026-10-21",
      plannedStartMin: 690,
    });
  });

  test("sleep crosses midnight: every night fits, one runs into a morning block", async () => {
    const t = newTest();
    const { userId, as, body, sleep } = await setUp(t);
    await plan(as, body, d("2026-10-18"), 360, 60, "Run"); // Sunday 06:00
    const blockId = await plan(as, sleep, THU, 1380, 480, "Sleep");
    const result = await as.mutation(api.recurrences.repeat, {
      blockId,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    // Saturday's sleep would run until Sunday 07:00, into the run.
    expect(result).toEqual({
      skipped: [{ date: "2026-10-17", blockedBy: "Run" }],
    });
    const nights = datesOf(await allBlocks(t, userId), "Sleep");
    expect(nights).toHaveLength(16 - 1);
    expect(nights).not.toContain("2026-10-17");
    expect(nights.at(-1)).toBe("2026-10-30");
  });

  test("a block planned beyond the window waits for the window to reach it", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const blockId = await plan(as, body, d("2026-12-01"), 660, 90, "Gym");
    await as.mutation(api.recurrences.repeat, { blockId, weekdays: [2] });
    const [rule] = await as.query(api.recurrences.list, {});
    expect(rule?.materializedThrough).toBe("2026-12-01");
    expect(datesOf(await allBlocks(t, userId), "Gym")).toEqual(["2026-12-01"]);
  });

  test("refuses what cannot repeat", async () => {
    const t = newTest();
    const { as, body } = await setUp(t);
    const blockId = await plan(as, body, THU, 660, 90, "Gym");
    for (const weekdays of [[], [7], [1, 1]]) {
      await expectAppError(
        as.mutation(api.recurrences.repeat, { blockId, weekdays }),
        "INVALID_INPUT",
      );
    }
    await expectAppError(
      as.mutation(api.recurrences.repeat, {
        blockId,
        weekdays: [1],
        endDate: d("2026-10-14"),
      }),
      "INVALID_INPUT",
    );
    const entry = await as.mutation(api.blocks.logEntry, {
      date: THU,
      categoryId: body,
      actualStartMin: 420,
      actualDurationMin: 30,
    });
    await expectAppError(
      as.mutation(api.recurrences.repeat, { blockId: entry, weekdays: [1] }),
      "INVALID_INPUT",
    );
    // Already repeating: changing it is "this and following".
    await as.mutation(api.recurrences.repeat, { blockId, weekdays: [4] });
    await expectAppError(
      as.mutation(api.recurrences.repeat, { blockId, weekdays: [1] }),
      "INVALID_INPUT",
    );
  });

  test("someone else's block is not found, and their rules are not listed", async () => {
    const t = newTest();
    const me = await setUp(t);
    const other = await setUp(t, "other@intent.test");
    const blockId = await plan(me.as, me.body, THU, 660, 90, "Gym");
    await expectAppError(
      other.as.mutation(api.recurrences.repeat, { blockId, weekdays: [4] }),
      "NOT_FOUND",
    );
    await me.as.mutation(api.recurrences.repeat, { blockId, weekdays: [4] });
    expect(await other.as.query(api.recurrences.list, {})).toEqual([]);
  });
});
