import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DateKey } from "../shared/time";
import { api, internal } from "./_generated/api";
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

/** Makes `title` repeat from Thursday at `startMin` for `minutes`, on `weekdays`. */
async function repeating(
  as: Caller,
  categoryId: Id<"categories">,
  title: string,
  startMin: number,
  minutes: number,
  weekdays: number[],
  endDate?: DateKey,
  from: DateKey = THU,
) {
  const blockId = await plan(as, categoryId, from, startMin, minutes, title);
  await as.mutation(api.recurrences.repeat, {
    blockId,
    weekdays,
    ...(endDate === undefined ? {} : { endDate }),
  });
  const rules = await as.query(api.recurrences.list, {});
  const rule = rules.find((item) => item.title === title);
  if (rule === undefined) throw new Error("no rule");
  return { blockId, rule };
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

describe("the daily materialisation", () => {
  test("run twice, it makes nothing twice", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    const before = await allBlocks(t, userId);
    await t.mutation(internal.recurrences.materializeAll, {});
    await t.mutation(internal.recurrences.materializeAll, {});
    const after = await allBlocks(t, userId);
    expect(after.map((block) => block._id)).toEqual(
      before.map((block) => block._id),
    );
    expect(datesOf(after, "Gym")).toHaveLength(16); // 15 Oct to 30 Oct
  });

  test("a day later, the window moves on by one date", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { rule } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    vi.setSystemTime(new Date("2026-10-16T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    const gym = datesOf(await allBlocks(t, userId), "Gym");
    expect(gym.at(-1)).toBe("2026-10-31");
    expect(gym).toHaveLength(17);
    expect(
      (await t.run((ctx) => ctx.db.get("recurrences", rule._id)))
        ?.materializedThrough,
    ).toBe("2026-10-31");
  });

  test("a deleted occurrence stays deleted", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    const saturday = (await allBlocks(t, userId)).find(
      (block) => block.date === "2026-10-17",
    );
    if (saturday === undefined) throw new Error("no Saturday");
    await as.mutation(api.blocks.remove, { blockId: saturday._id });
    vi.setSystemTime(new Date("2026-10-20T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    await as.mutation(api.recurrences.materializeThrough, {
      date: d("2026-11-20"),
    });
    expect(datesOf(await allBlocks(t, userId), "Gym")).not.toContain(
      "2026-10-17",
    );
  });

  test("it stops at the end date, and an ended rule is not written again", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { rule } = await repeating(
      as,
      body,
      "Gym",
      660,
      90,
      EVERY_DAY,
      d("2026-11-03"),
    );
    vi.setSystemTime(new Date("2026-10-25T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    const gym = datesOf(await allBlocks(t, userId), "Gym");
    expect(gym.at(-1)).toBe("2026-11-03");
    expect(gym).toHaveLength(20); // 15 Oct to 3 Nov
    const ended = await t.run((ctx) => ctx.db.get("recurrences", rule._id));
    vi.setSystemTime(new Date("2026-10-26T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    expect(await t.run((ctx) => ctx.db.get("recurrences", rule._id))).toEqual(
      ended,
    );
  });

  test("a date whose time is taken is passed over quietly; the block there stays", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    // Planned before the window reaches it.
    const trip = await plan(as, body, d("2026-11-02"), 600, 240, "Trip");
    vi.setSystemTime(new Date("2026-10-20T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    const blocks = await allBlocks(t, userId);
    expect(datesOf(blocks, "Gym")).not.toContain("2026-11-02");
    expect(datesOf(blocks, "Gym")).toContain("2026-11-03");
    expect(blocks.find((block) => block._id === trip)).toMatchObject({
      date: "2026-11-02",
      plannedStartMin: 600,
      plannedDurationMin: 240,
    });
    // Moving the trip away later does not bring that date back.
    await as.mutation(api.blocks.remove, { blockId: trip });
    await t.mutation(internal.recurrences.materializeAll, {});
    expect(datesOf(await allBlocks(t, userId), "Gym")).not.toContain(
      "2026-11-02",
    );
  });

  test("sleep crosses midnight night after night; a morning block takes one night out", async () => {
    const t = newTest();
    const { userId, as, body, sleep } = await setUp(t);
    await repeating(as, sleep, "Sleep", 1380, 480, EVERY_DAY);
    await plan(as, body, d("2026-11-01"), 300, 60, "Early flight"); // 05:00
    vi.setSystemTime(new Date("2026-10-18T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    const nights = datesOf(await allBlocks(t, userId), "Sleep");
    // 15 Oct to 2 Nov, but not 31 Oct, whose night would run into the flight.
    expect(nights).toHaveLength(19 - 1);
    expect(nights).not.toContain("2026-10-31");
    expect(nights.at(-1)).toBe("2026-11-02");
  });

  test("two rules never collide: the one placed first keeps the time", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    // Gym on Mondays 11:00–12:30, from Monday 19 Oct.
    await repeating(as, body, "Gym", 660, 90, [1], undefined, d("2026-10-19"));
    // Run on Mondays and Thursdays 12:00–13:00: every Monday is taken.
    const runBlock = await plan(as, body, THU, 720, 60, "Run");
    const made = await as.mutation(api.recurrences.repeat, {
      blockId: runBlock,
      weekdays: [1, 4],
    });
    expect(made.skipped).toEqual([
      { date: "2026-10-19", blockedBy: "Gym" },
      { date: "2026-10-26", blockedBy: "Gym" },
    ]);
    vi.setSystemTime(new Date("2026-10-30T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    const blocks = await allBlocks(t, userId);
    expect(datesOf(blocks, "Gym")).toEqual([
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
    ]);
    expect(datesOf(blocks, "Run")).toEqual([
      THU,
      "2026-10-22",
      "2026-10-29",
      "2026-11-05",
      "2026-11-12",
    ]);
  });

  test("every user's rules, a page at a time", async () => {
    const t = newTest();
    const users = [];
    for (let index = 0; index < 3; index += 1) {
      users.push(await setUp(t, `user${index}@intent.test`));
    }
    for (const user of users) {
      for (let index = 0; index < 10; index += 1) {
        await repeating(
          user.as,
          user.body,
          `Rule ${index}`,
          60 * index + 300,
          30,
          [4],
        );
      }
    }
    vi.setSystemTime(new Date("2026-11-20T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rules = await t.run((ctx) => ctx.db.query("recurrences").collect());
    expect(rules).toHaveLength(30);
    for (const rule of rules) {
      expect(rule.materializedThrough).toBe("2026-12-05");
    }
  });
});

describe("recurrences.materializeThrough", () => {
  test("requires a session", async () => {
    const t = newTest();
    await expectAppError(
      t.mutation(api.recurrences.materializeThrough, { date: d("2026-12-01") }),
      "UNAUTHENTICATED",
    );
  });

  test("a date beyond the window is filled on demand, once", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    await repeating(as, body, "Gym", 660, 90, [1, 3, 5]);
    await as.mutation(api.recurrences.materializeThrough, {
      date: d("2026-11-13"),
    });
    const once = await allBlocks(t, userId);
    expect(datesOf(once, "Gym").at(-1)).toBe("2026-11-13");
    await as.mutation(api.recurrences.materializeThrough, {
      date: d("2026-11-13"),
    });
    expect((await allBlocks(t, userId)).map((b) => b._id)).toEqual(
      once.map((b) => b._id),
    );
    // The daily run then carries on from there without repeats.
    vi.setSystemTime(new Date("2026-11-01T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    const gym = datesOf(await allBlocks(t, userId), "Gym");
    expect(new Set(gym).size).toBe(gym.length);
  });

  test("no further than a year ahead", async () => {
    const t = newTest();
    const { as, body } = await setUp(t);
    const { rule } = await repeating(as, body, "Gym", 660, 90, [4]);
    await as.mutation(api.recurrences.materializeThrough, {
      date: d("2029-01-01"),
    });
    const [after] = await as.query(api.recurrences.list, {});
    expect(after?._id).toBe(rule._id);
    expect(after?.materializedThrough).toBe("2027-10-16");
  });

  test("only the caller's rules", async () => {
    const t = newTest();
    const me = await setUp(t);
    const other = await setUp(t, "other@intent.test");
    await repeating(me.as, me.body, "Gym", 660, 90, [4]);
    await other.as.mutation(api.recurrences.materializeThrough, {
      date: d("2026-12-31"),
    });
    const [mine] = await me.as.query(api.recurrences.list, {});
    expect(mine?.materializedThrough).toBe("2026-10-30");
  });
});

describe("editing one occurrence ('This one')", () => {
  test("a plan edit detaches it; the rule and the others stay", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { rule } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    const friday = (await allBlocks(t, userId)).find(
      (block) => block.date === "2026-10-16",
    );
    if (friday === undefined) throw new Error("no Friday");
    await as.mutation(api.blocks.update, {
      blockId: friday._id,
      plannedStartMin: 1080,
    });
    const after = await allBlocks(t, userId);
    expect(after.find((block) => block._id === friday._id)).toMatchObject({
      plannedStartMin: 1080,
      detached: true,
      recurrenceId: rule._id,
    });
    expect(
      after.filter((block) => block.detached === true).map((b) => b.date),
    ).toEqual(["2026-10-16"]);
    const [same] = await as.query(api.recurrences.list, {});
    expect(same).toEqual(rule);
  });

  test("marking it, its actual times, its note and its intent never detach it", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { blockId } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "done" },
      now: { date: THU, minute: 800 },
    });
    await as.mutation(api.blocks.update, {
      blockId,
      actualStartMin: 670,
      actualDurationMin: 80,
      note: "Heavy.",
      why: "Today, for the shoot.",
      doneWhen: "Four lifts.",
    });
    // The same plan sent back is not a change either.
    await as.mutation(api.blocks.update, { blockId, plannedStartMin: 660 });
    const block = (await allBlocks(t, userId)).find((b) => b._id === blockId);
    expect(block?.detached).toBeUndefined();
    expect(block?.status).toBe("done");
  });
});

describe("recurrences.changeFrom ('This and following')", () => {
  test("from the first date: the rule changes, the days to come follow", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { blockId, rule } = await repeating(
      as,
      body,
      "Gym",
      660,
      90,
      EVERY_DAY,
    );
    const blocks = await allBlocks(t, userId);
    const sat = blocks.find((block) => block.date === "2026-10-17");
    const sun = blocks.find((block) => block.date === "2026-10-18");
    if (sat === undefined || sun === undefined) throw new Error("missing");
    // Saturday was skipped ahead of time, Sunday moved by hand.
    await as.mutation(api.blocks.setStatus, {
      blockId: sat._id,
      action: { type: "skip" },
      now: { date: THU, minute: 600 },
    });
    await as.mutation(api.blocks.update, {
      blockId: sun._id,
      plannedStartMin: 1020,
    });

    expect(
      await as.mutation(api.recurrences.changeFrom, {
        blockId,
        plannedStartMin: 720,
        focus: "Legs",
      }),
    ).toEqual({ skipped: [] });

    const [changed] = await as.query(api.recurrences.list, {});
    expect(changed).toMatchObject({
      _id: rule._id,
      startMin: 720,
      focus: "Legs",
      startDate: THU,
      materializedThrough: "2026-10-30",
    });
    const after = await allBlocks(t, userId);
    const gym = after.filter((block) => block.recurrenceId === rule._id);
    // One a day, none twice.
    expect(gym.map((block) => block.date)).toEqual([
      ...new Set(gym.map((block) => block.date)),
    ]);
    expect(gym).toHaveLength(16);
    for (const block of gym) {
      if (block._id === sat._id) {
        expect(block).toMatchObject({
          status: "skipped",
          plannedStartMin: 660,
        });
      } else if (block._id === sun._id) {
        expect(block).toMatchObject({ detached: true, plannedStartMin: 1020 });
      } else {
        expect(block).toMatchObject({ plannedStartMin: 720, focus: "Legs" });
      }
    }
  });

  test("from a later date: the past keeps its plan, a new rule carries on", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { rule } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    const blocks = await allBlocks(t, userId);
    const tue = blocks.find((block) => block.date === "2026-10-20");
    const thu = blocks.find((block) => block.date === "2026-10-22");
    if (tue === undefined || thu === undefined) throw new Error("missing");
    // A deleted occurrence after the change may come back; that is fine.
    await as.mutation(api.blocks.remove, { blockId: thu._id });

    await as.mutation(api.recurrences.changeFrom, {
      blockId: tue._id,
      title: "Gym with Tom",
      weekdays: [2, 4], // Tuesdays and Thursdays
    });

    const rules = await as.query(api.recurrences.list, {});
    expect(rules).toHaveLength(2);
    const old = rules.find((item) => item._id === rule._id);
    const next = rules.find((item) => item._id !== rule._id);
    expect(old?.endDate).toBe("2026-10-19");
    expect(next).toMatchObject({
      title: "Gym with Tom",
      weekdays: [2, 4],
      startDate: "2026-10-20",
      startMin: 660,
    });
    const after = await allBlocks(t, userId);
    expect(datesOf(after, "Gym")).toEqual([
      THU,
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
    ]);
    expect(datesOf(after, "Gym with Tom")).toEqual([
      "2026-10-20",
      "2026-10-22",
      "2026-10-27",
      "2026-10-29",
    ]);
    expect(after.find((block) => block._id === tue._id)?.recurrenceId).toBe(
      next?._id,
    );
  });

  test("after a change, the daily run twice makes nothing twice", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { blockId } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    await as.mutation(api.recurrences.changeFrom, {
      blockId,
      plannedDurationMin: 60,
    });
    vi.setSystemTime(new Date("2026-10-21T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    const once = await allBlocks(t, userId);
    await t.mutation(internal.recurrences.materializeAll, {});
    const twice = await allBlocks(t, userId);
    expect(twice.map((block) => block._id)).toEqual(
      once.map((block) => block._id),
    );
    const gym = datesOf(twice, "Gym");
    expect(new Set(gym).size).toBe(gym.length);
    expect(gym.at(-1)).toBe("2026-11-05");
    for (const block of twice) expect(block.plannedDurationMin).toBe(60);
  });

  test("changing only when it repeats, from a block moved by hand, keeps that block's time", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    const tue = (await allBlocks(t, userId)).find(
      (block) => block.date === "2026-10-20",
    );
    if (tue === undefined) throw new Error("no Tuesday");
    await as.mutation(api.blocks.update, {
      blockId: tue._id,
      plannedStartMin: 1080,
    });
    await as.mutation(api.recurrences.changeFrom, {
      blockId: tue._id,
      weekdays: [2],
    });
    const after = await allBlocks(t, userId);
    expect(after.find((block) => block._id === tue._id)).toMatchObject({
      plannedStartMin: 1080,
      detached: true,
    });
    expect(datesOf(after, "Gym").filter((date) => date > "2026-10-20")).toEqual(
      ["2026-10-27"],
    );
  });

  test("an earlier end takes the later days still to do away", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { blockId } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    await as.mutation(api.recurrences.changeFrom, {
      blockId,
      endDate: d("2026-10-18"),
    });
    expect(datesOf(await allBlocks(t, userId), "Gym")).toEqual([
      THU,
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    // And taking the end away fills the window again.
    await as.mutation(api.recurrences.changeFrom, { blockId, endDate: null });
    expect(datesOf(await allBlocks(t, userId), "Gym")).toHaveLength(16);
  });

  test("a date now taken is left out and named", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { blockId } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    await plan(as, body, d("2026-10-19"), 1080, 60, "Call");
    expect(
      await as.mutation(api.recurrences.changeFrom, {
        blockId,
        plannedStartMin: 1050,
      }),
    ).toEqual({ skipped: [{ date: "2026-10-19", blockedBy: "Call" }] });
    expect(datesOf(await allBlocks(t, userId), "Gym")).not.toContain(
      "2026-10-19",
    );
  });

  test("the block's own new time must fit, or nothing changes", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { blockId } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    await plan(as, body, THU, 1080, 60, "Call");
    const before = await allBlocks(t, userId);
    const rulesBefore = await as.query(api.recurrences.list, {});
    await expectAppError(
      as.mutation(api.recurrences.changeFrom, {
        blockId,
        plannedStartMin: 1050,
      }),
      "OVERLAP",
    );
    expect(await allBlocks(t, userId)).toEqual(before);
    expect(await as.query(api.recurrences.list, {})).toEqual(rulesBefore);
  });

  test("refuses what is not an occurrence, or not the caller's", async () => {
    const t = newTest();
    const me = await setUp(t);
    const other = await setUp(t, "other@intent.test");
    const plain = await plan(me.as, me.body, THU, 540, 60, "Write");
    await expectAppError(
      me.as.mutation(api.recurrences.changeFrom, {
        blockId: plain,
        title: "X",
      }),
      "INVALID_INPUT",
    );
    const { blockId } = await repeating(me.as, me.body, "Gym", 660, 90, [4]);
    await expectAppError(
      other.as.mutation(api.recurrences.changeFrom, { blockId, title: "X" }),
      "NOT_FOUND",
    );
    await expectAppError(
      other.as.mutation(api.recurrences.endFrom, { blockId }),
      "NOT_FOUND",
    );
    await expectAppError(
      me.as.mutation(api.recurrences.changeFrom, { blockId, weekdays: [] }),
      "INVALID_INPUT",
    );
    await expectAppError(
      me.as.mutation(api.recurrences.changeFrom, {
        blockId,
        endDate: d("2026-10-14"),
      }),
      "INVALID_INPUT",
    );
    await expectAppError(
      t.mutation(api.recurrences.endFrom, { blockId }),
      "UNAUTHENTICATED",
    );
  });
});

describe("recurrences.endFrom (deleting 'This and following')", () => {
  test("the rule ends the day before; marked and moved ones stay", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { rule } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    const blocks = await allBlocks(t, userId);
    const tue = blocks.find((block) => block.date === "2026-10-20");
    const wed = blocks.find((block) => block.date === "2026-10-21");
    const thu = blocks.find((block) => block.date === "2026-10-22");
    if (tue === undefined || wed === undefined || thu === undefined) {
      throw new Error("missing");
    }
    await as.mutation(api.blocks.setStatus, {
      blockId: wed._id,
      action: { type: "skip", reason: "noTime" },
      now: { date: THU, minute: 600 },
    });
    await as.mutation(api.blocks.update, {
      blockId: thu._id,
      plannedStartMin: 1080,
    });

    await as.mutation(api.recurrences.endFrom, { blockId: tue._id });

    const [ended] = await as.query(api.recurrences.list, {});
    expect(ended?.endDate).toBe("2026-10-19");
    const after = await allBlocks(t, userId);
    expect(datesOf(after, "Gym")).toEqual([
      THU,
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
      "2026-10-21",
      "2026-10-22",
    ]);
    // The daily run makes nothing more.
    vi.setSystemTime(new Date("2026-10-25T02:17:00Z"));
    await t.mutation(internal.recurrences.materializeAll, {});
    expect(await allBlocks(t, userId)).toEqual(after);
    expect(rule._id).toBe(ended?._id);
  });

  test("from the first date, every occurrence still to do goes", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const { blockId } = await repeating(as, body, "Gym", 660, 90, EVERY_DAY);
    await as.mutation(api.recurrences.endFrom, { blockId });
    expect(await allBlocks(t, userId)).toEqual([]);
    // That block may now start a rule of its own again, if planned anew.
    const again = await plan(as, body, THU, 660, 90, "Gym");
    await as.mutation(api.recurrences.repeat, {
      blockId: again,
      weekdays: [4],
    });
    expect(await as.query(api.recurrences.list, {})).toHaveLength(2);
  });
});
