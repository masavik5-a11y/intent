import { describe, expect, test } from "vitest";
import type { DateKey } from "../shared/time";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  expectAppError,
  newTest,
  signedIn,
  type TestConvex,
} from "./test.helpers";

const MON = "2026-10-12" as DateKey;
const TUE = "2026-10-13" as DateKey;
const WED = "2026-10-14" as DateKey;

/** A signed-in user with the default categories and one activity, Gym. */
async function setUp(t: TestConvex, email = "me@intent.test") {
  const { userId, as } = await signedIn(t, email);
  await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
  const { body, deepWork, gym } = await t.run(async (ctx) => {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
    const byName = (name: string): Id<"categories"> => {
      const found = categories.find((category) => category.name === name);
      if (found === undefined) throw new Error(`no category ${name}`);
      return found._id;
    };
    const gym = await ctx.db.insert("activities", {
      userId,
      name: "Gym",
      categoryId: byName("Body"),
      defaultDurationMin: 90,
      notify: true,
      pressure: false,
      archived: false,
      why: "Energy for the camera.",
    });
    return { body: byName("Body"), deepWork: byName("Deep work"), gym };
  });
  return { userId, as, body, deepWork, gym };
}

type Caller = Awaited<ReturnType<typeof setUp>>["as"];

/** Plans a block in `categoryId` starting at "HH:MM". */
async function plan(
  as: Caller,
  categoryId: Id<"categories">,
  date: DateKey,
  start: string,
  minutes: number,
  title = "Block",
) {
  const [hours = 0, mins = 0] = start.split(":").map(Number);
  return await as.mutation(api.blocks.create, {
    date,
    title,
    categoryId,
    plannedStartMin: hours * 60 + mins,
    plannedDurationMin: minutes,
  });
}

function read(t: TestConvex, blockId: Id<"blocks">) {
  return t.run((ctx) => ctx.db.get("blocks", blockId));
}

describe("blocks.create", () => {
  test("requires a session", async () => {
    const t = newTest();
    const { deepWork } = await setUp(t);
    await expectAppError(
      t.mutation(api.blocks.create, {
        date: TUE,
        title: "Block",
        categoryId: deepWork,
        plannedStartMin: 540,
        plannedDurationMin: 60,
      }),
      "UNAUTHENTICATED",
    );
  });

  test("from an activity: its name and category, nothing copied", async () => {
    const t = newTest();
    const { userId, as, body, gym } = await setUp(t);
    const blockId = await as.mutation(api.blocks.create, {
      date: TUE,
      activityId: gym,
      plannedStartMin: 660,
      plannedDurationMin: 90,
    });
    const block = await read(t, blockId);
    expect(block).toMatchObject({
      userId,
      date: TUE,
      title: "Gym",
      activityId: gym,
      categoryId: body,
      plannedStartMin: 660,
      plannedDurationMin: 90,
      status: "planned",
    });
    // The why stays on the activity; the block inherits it when shown.
    expect(block?.why).toBeUndefined();
  });

  test("a title and category of its own override the activity's", async () => {
    const t = newTest();
    const { as, deepWork, gym } = await setUp(t);
    const blockId = await as.mutation(api.blocks.create, {
      date: TUE,
      activityId: gym,
      title: "Gym with Tom",
      categoryId: deepWork,
      plannedStartMin: 660,
      plannedDurationMin: 90,
    });
    expect(await read(t, blockId)).toMatchObject({
      title: "Gym with Tom",
      categoryId: deepWork,
    });
  });

  test("text is trimmed, and blank optional text is not stored", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await as.mutation(api.blocks.create, {
      date: TUE,
      title: "  Script the reel  ",
      focus: "   ",
      doneWhen: " Draft, 300 words. ",
      why: "",
      categoryId: deepWork,
      plannedStartMin: 540,
      plannedDurationMin: 120,
    });
    const block = await read(t, blockId);
    expect(block?.title).toBe("Script the reel");
    expect(block?.doneWhen).toBe("Draft, 300 words.");
    expect(block && "focus" in block).toBe(false);
    expect(block && "why" in block).toBe(false);
  });

  test.each([
    ["no title and no activity", { title: undefined }],
    ["a blank title", { title: "   " }],
    ["a title over 80 characters", { title: "x".repeat(81) }],
    ["a focus over 120 characters", { focus: "x".repeat(121) }],
    ["a why over 1000 characters", { why: "x".repeat(1001) }],
    ["a date that does not exist", { date: "2026-02-30" as DateKey }],
    ["a date in another format", { date: "13.10.2026" as DateKey }],
  ])("rejects %s", async (_name, change) => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    await expectAppError(
      as.mutation(api.blocks.create, {
        date: TUE,
        title: "Block",
        categoryId: deepWork,
        plannedStartMin: 540,
        plannedDurationMin: 60,
        ...change,
      }),
      "INVALID_INPUT",
    );
  });

  test("rejects a block with neither a category nor an activity", async () => {
    const t = newTest();
    const { as } = await setUp(t);
    await expectAppError(
      as.mutation(api.blocks.create, {
        date: TUE,
        title: "Block",
        plannedStartMin: 540,
        plannedDurationMin: 60,
      }),
      "INVALID_INPUT",
    );
  });

  test.each([
    ["a start off the 5-minute step", 542, 60],
    ["a start before midnight", -5, 60],
    ["a start at the end of the day", 1440, 60],
    ["a fractional start", 540.5, 60],
    ["a zero duration", 540, 0],
    ["a duration off the step", 540, 62],
    ["a duration over a day", 540, 1445],
    ["a negative duration", 540, -60],
  ])("rejects %s", async (_name, start, duration) => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    await expectAppError(
      as.mutation(api.blocks.create, {
        date: TUE,
        title: "Block",
        categoryId: deepWork,
        plannedStartMin: start,
        plannedDurationMin: duration,
      }),
      "INVALID_TIME",
    );
  });

  test("accepts the edges: 00:00, 23:55, five minutes, a whole day", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    await plan(as, deepWork, MON, "00:00", 5);
    await plan(as, deepWork, TUE, "23:55", 5);
    await plan(as, deepWork, WED, "05:00", 1440);
  });

  test("rejects someone else's activity or category as not found", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    await expectAppError(
      me.as.mutation(api.blocks.create, {
        date: TUE,
        activityId: other.gym,
        plannedStartMin: 540,
        plannedDurationMin: 60,
      }),
      "NOT_FOUND",
    );
    await expectAppError(
      me.as.mutation(api.blocks.create, {
        date: TUE,
        title: "Block",
        categoryId: other.deepWork,
        plannedStartMin: 540,
        plannedDurationMin: 60,
      }),
      "NOT_FOUND",
    );
  });
});

describe("no overlap in the plan lane", () => {
  test.each([
    ["the same slot", TUE, "09:00", 60],
    ["inside it", TUE, "09:30", 15],
    ["over its start", TUE, "08:30", 60],
    ["over its end", TUE, "09:55", 60],
    ["around it", TUE, "08:00", 240],
  ])("refuses a block %s", async (_name, date, start, minutes) => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    await plan(as, deepWork, TUE, "09:00", 60);
    await expectAppError(plan(as, deepWork, date, start, minutes), "OVERLAP");
  });

  test("blocks that touch end to start both fit", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    await plan(as, deepWork, TUE, "09:00", 60);
    await plan(as, deepWork, TUE, "10:00", 60);
    await plan(as, deepWork, TUE, "08:00", 60);
  });

  test("last night's sleep blocks the early morning, and only until it ends", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    await plan(as, deepWork, MON, "23:00", 480, "Sleep"); // to Tue 07:00
    await expectAppError(plan(as, deepWork, TUE, "00:00", 30), "OVERLAP");
    await expectAppError(plan(as, deepWork, TUE, "06:30", 60), "OVERLAP");
    await plan(as, deepWork, TUE, "07:00", 60);
  });

  test("a block across midnight is refused when tomorrow starts too early", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    await plan(as, deepWork, WED, "06:00", 60, "Run");
    await expectAppError(
      plan(as, deepWork, TUE, "23:00", 480, "Sleep"),
      "OVERLAP",
    );
    await plan(as, deepWork, TUE, "23:00", 420, "Sleep"); // to Wed 06:00
  });

  test("someone else's blocks are not in my lane", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    await plan(other.as, other.deepWork, TUE, "09:00", 60);
    await plan(me.as, me.deepWork, TUE, "09:00", 60);
  });
});

describe("blocks.update", () => {
  test("moves and resizes the plan", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "09:00", 60);
    await as.mutation(api.blocks.update, {
      blockId,
      plannedStartMin: 600,
      plannedDurationMin: 90,
    });
    expect(await read(t, blockId)).toMatchObject({
      date: TUE,
      plannedStartMin: 600,
      plannedDurationMin: 90,
    });
  });

  test("a block can grow or shift over the time it already holds", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "09:00", 60);
    await as.mutation(api.blocks.update, {
      blockId,
      plannedStartMin: 570,
      plannedDurationMin: 120,
    });
  });

  test("refuses a move onto another block", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "09:00", 60);
    await plan(as, deepWork, TUE, "11:00", 60);
    await expectAppError(
      as.mutation(api.blocks.update, { blockId, plannedDurationMin: 150 }),
      "OVERLAP",
    );
    expect(await read(t, blockId)).toMatchObject({ plannedDurationMin: 60 });
  });

  test("moving to another date checks that day's lane", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "09:00", 60);
    await plan(as, deepWork, WED, "09:00", 60);
    await expectAppError(
      as.mutation(api.blocks.update, { blockId, date: WED }),
      "OVERLAP",
    );
    await as.mutation(api.blocks.update, {
      blockId,
      date: WED,
      plannedStartMin: 600,
    });
    expect(await read(t, blockId)).toMatchObject({
      date: WED,
      plannedStartMin: 600,
    });
  });

  test("refuses invalid times and dates", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "09:00", 60);
    await expectAppError(
      as.mutation(api.blocks.update, { blockId, plannedStartMin: 541 }),
      "INVALID_TIME",
    );
    await expectAppError(
      as.mutation(api.blocks.update, { blockId, plannedDurationMin: 0 }),
      "INVALID_TIME",
    );
    await expectAppError(
      as.mutation(api.blocks.update, {
        blockId,
        date: "2026-13-01" as DateKey,
      }),
      "INVALID_INPUT",
    );
  });

  test("sets, keeps and clears text: null clears, left out keeps", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "09:00", 60);
    await as.mutation(api.blocks.update, {
      blockId,
      title: " Script ",
      focus: "The hook",
      why: "One reel a week.",
    });
    expect(await read(t, blockId)).toMatchObject({
      title: "Script",
      focus: "The hook",
      why: "One reel a week.",
    });

    await as.mutation(api.blocks.update, { blockId, why: null, focus: "  " });
    const block = await read(t, blockId);
    expect(block?.title).toBe("Script");
    expect(block && "why" in block).toBe(false);
    expect(block && "focus" in block).toBe(false);

    await expectAppError(
      as.mutation(api.blocks.update, { blockId, title: "" }),
      "INVALID_INPUT",
    );
  });

  test("choosing an activity moves the block to its category", async () => {
    const t = newTest();
    const { as, body, deepWork, gym } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "09:00", 60);
    await as.mutation(api.blocks.update, { blockId, activityId: gym });
    expect(await read(t, blockId)).toMatchObject({
      activityId: gym,
      categoryId: body,
    });

    // An explicit category in the same change wins.
    await as.mutation(api.blocks.update, {
      blockId,
      activityId: null,
      categoryId: deepWork,
    });
    const block = await read(t, blockId);
    expect(block?.categoryId).toBe(deepWork);
    expect(block && "activityId" in block).toBe(false);
  });

  test("someone else's block, activity or category is not found", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    const mine = await plan(me.as, me.deepWork, TUE, "09:00", 60);
    const theirs = await plan(other.as, other.deepWork, TUE, "09:00", 60);

    await expectAppError(
      me.as.mutation(api.blocks.update, { blockId: theirs, title: "Mine" }),
      "NOT_FOUND",
    );
    await expectAppError(
      me.as.mutation(api.blocks.update, {
        blockId: mine,
        activityId: other.gym,
      }),
      "NOT_FOUND",
    );
    await expectAppError(
      me.as.mutation(api.blocks.update, {
        blockId: mine,
        categoryId: other.body,
      }),
      "NOT_FOUND",
    );
    expect((await read(t, theirs))?.title).toBe("Block");
  });
});

describe("plan and actual are two lanes (M2 shapes)", () => {
  /** A block as later slices will store it: done, or an unplanned entry. */
  async function insertDone(
    t: TestConvex,
    userId: Id<"users">,
    categoryId: Id<"categories">,
    fields: {
      date: DateKey;
      plannedStartMin?: number;
      plannedDurationMin?: number;
      actualStartMin: number;
      actualDurationMin: number;
    },
  ) {
    return await t.run((ctx) =>
      ctx.db.insert("blocks", {
        userId,
        title: "Done",
        categoryId,
        status: "done",
        ...fields,
      }),
    );
  }

  test("an unplanned entry takes no room in the plan lane", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    await insertDone(t, userId, deepWork, {
      date: TUE,
      actualStartMin: 780,
      actualDurationMin: 45,
    });
    await plan(as, deepWork, TUE, "13:00", 60);
  });

  test("a done block still holds its plan time", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    await insertDone(t, userId, deepWork, {
      date: TUE,
      plannedStartMin: 540,
      plannedDurationMin: 60,
      actualStartMin: 600,
      actualDurationMin: 60,
    });
    await expectAppError(plan(as, deepWork, TUE, "09:30", 30), "OVERLAP");
    // Its actual time is in the other lane, so the plan lane is free there.
    await plan(as, deepWork, TUE, "10:00", 60);
  });

  test("moving a done block to another date checks the actual lane there", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    const blockId = await insertDone(t, userId, deepWork, {
      date: TUE,
      plannedStartMin: 540,
      plannedDurationMin: 60,
      actualStartMin: 540,
      actualDurationMin: 60,
    });
    await insertDone(t, userId, deepWork, {
      date: WED,
      actualStartMin: 540,
      actualDurationMin: 30,
    });
    await expectAppError(
      as.mutation(api.blocks.update, { blockId, date: WED }),
      "OVERLAP",
    );
    expect(await read(t, blockId)).toMatchObject({ date: TUE });
  });

  test("an unplanned entry cannot get half a plan", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    const blockId = await insertDone(t, userId, deepWork, {
      date: TUE,
      actualStartMin: 780,
      actualDurationMin: 45,
    });
    await expectAppError(
      as.mutation(api.blocks.update, { blockId, plannedStartMin: 780 }),
      "INVALID_INPUT",
    );
    // Text edits are fine.
    await as.mutation(api.blocks.update, { blockId, title: "Phone" });
    expect(await read(t, blockId)).toMatchObject({ title: "Phone" });
  });

  test("listForDay returns unplanned entries with the rest", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    await insertDone(t, userId, deepWork, {
      date: TUE,
      actualStartMin: 780,
      actualDurationMin: 45,
    });
    const blocks = await as.query(api.blocks.listForDay, { date: TUE });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ status: "done", actualStartMin: 780 });
    expect(blocks[0] && "plannedStartMin" in blocks[0]).toBe(false);
  });
});

describe("blocks.setStatus", () => {
  /** The device's moment "HH:MM" on `date`. */
  function at(date: DateKey, time: string) {
    const [hours = 0, mins = 0] = time.split(":").map(Number);
    return { date, minute: hours * 60 + mins };
  }
  const evening = at(TUE, "18:00");

  test("requires a session", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await expectAppError(
      t.mutation(api.blocks.setStatus, {
        blockId,
        action: { type: "done" },
        now: evening,
      }),
      "UNAUTHENTICATED",
    );
  });

  test("Done after the block records the plan", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "done" },
      now: evening,
    });
    expect(await read(t, blockId)).toMatchObject({
      status: "done",
      plannedStartMin: 780,
      plannedDurationMin: 60,
      actualStartMin: 780,
      actualDurationMin: 60,
    });
  });

  test("Done while it runs ends it now", async () => {
    const t = newTest();
    const { as, gym } = await setUp(t);
    const blockId = await as.mutation(api.blocks.create, {
      date: TUE,
      activityId: gym,
      plannedStartMin: 660,
      plannedDurationMin: 90,
    });
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "done" },
      now: at(TUE, "11:50"),
    });
    expect(await read(t, blockId)).toMatchObject({
      actualStartMin: 660,
      actualDurationMin: 50,
    });
  });

  test("Done after an overrun starts late and keeps the planned end", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    await t.run((ctx) =>
      ctx.db.insert("blocks", {
        userId,
        date: TUE,
        title: "Lunch",
        categoryId: deepWork,
        plannedStartMin: 720,
        plannedDurationMin: 60,
        status: "done",
        actualStartMin: 720,
        actualDurationMin: 75, // until 13:15
      }),
    );
    const write = await plan(as, deepWork, TUE, "13:00", 60, "Write");
    await as.mutation(api.blocks.setStatus, {
      blockId: write,
      action: { type: "done" },
      now: evening,
    });
    expect(await read(t, write)).toMatchObject({
      actualStartMin: 795,
      actualDurationMin: 45,
    });
  });

  test("Done before the block starts is refused", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await expectAppError(
      as.mutation(api.blocks.setStatus, {
        blockId,
        action: { type: "done" },
        now: at(TUE, "12:55"),
      }),
      "NOT_STARTED",
    );
    expect(await read(t, blockId)).toMatchObject({ status: "planned" });
  });

  test("Done finds no room when what happened already fills the plan", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    await t.run((ctx) =>
      ctx.db.insert("blocks", {
        userId,
        date: TUE,
        title: "Phone",
        categoryId: deepWork,
        status: "done",
        actualStartMin: 760,
        actualDurationMin: 120,
      }),
    );
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await expectAppError(
      as.mutation(api.blocks.setStatus, {
        blockId,
        action: { type: "done" },
        now: evening,
      }),
      "NO_ROOM",
    );
  });

  test("Partly records the minutes given", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "partial", minutes: 25 },
      now: evening,
    });
    expect(await read(t, blockId)).toMatchObject({
      status: "partial",
      actualStartMin: 780,
      actualDurationMin: 25,
    });
    await expectAppError(
      as.mutation(api.blocks.setStatus, {
        blockId,
        action: { type: "partial", minutes: 12 },
        now: evening,
      }),
      "INVALID_TIME",
    );
  });

  test("Skip with a reason, then Undo, leaves a planned block as it was", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "done" },
      now: evening,
    });
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "skip", reason: "tired" },
      now: evening,
    });
    let block = await read(t, blockId);
    expect(block).toMatchObject({ status: "skipped", skipReason: "tired" });
    expect(block && "actualStartMin" in block).toBe(false);

    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "undo" },
      now: evening,
    });
    block = await read(t, blockId);
    expect(block).toMatchObject({ status: "planned", plannedStartMin: 780 });
    expect(block && "skipReason" in block).toBe(false);
    expect(block && "actualDurationMin" in block).toBe(false);
  });

  test("a future block can be skipped ahead of time", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, WED, "09:00", 60);
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "skip" },
      now: evening,
    });
    expect(await read(t, blockId)).toMatchObject({ status: "skipped" });
  });

  test("an unplanned entry has no status to change", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    const blockId = await t.run((ctx) =>
      ctx.db.insert("blocks", {
        userId,
        date: TUE,
        title: "Phone",
        categoryId: deepWork,
        status: "done",
        actualStartMin: 780,
        actualDurationMin: 45,
      }),
    );
    await expectAppError(
      as.mutation(api.blocks.setStatus, {
        blockId,
        action: { type: "undo" },
        now: evening,
      }),
      "INVALID_INPUT",
    );
  });

  test("refuses someone else's block, and a moment that is not one", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    const theirs = await plan(other.as, other.deepWork, TUE, "13:00", 60);
    await expectAppError(
      me.as.mutation(api.blocks.setStatus, {
        blockId: theirs,
        action: { type: "done" },
        now: evening,
      }),
      "NOT_FOUND",
    );
    const mine = await plan(me.as, me.deepWork, TUE, "13:00", 60);
    for (const now of [
      { date: TUE, minute: 1440 },
      { date: TUE, minute: 12.5 },
      { date: "2026-02-30" as DateKey, minute: 600 },
    ]) {
      await expectAppError(
        me.as.mutation(api.blocks.setStatus, {
          blockId: mine,
          action: { type: "done" },
          now,
        }),
        "INVALID_INPUT",
      );
    }
  });
});

describe("blocks.logEntry", () => {
  async function driftOf(t: TestConvex, userId: Id<"users">) {
    return await t.run(async (ctx) => {
      const categories = await ctx.db
        .query("categories")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(20);
      const drift = categories.find((category) => category.kind === "drift");
      if (drift === undefined) throw new Error("no drift category");
      return drift._id;
    });
  }

  test("logs what happened: done, no plan, the category's name by default", async () => {
    const t = newTest();
    const { userId, as } = await setUp(t);
    const drift = await driftOf(t, userId);
    const entryId = await as.mutation(api.blocks.logEntry, {
      date: TUE,
      categoryId: drift,
      actualStartMin: 780,
      actualDurationMin: 45,
    });
    const entry = await read(t, entryId);
    expect(entry).toMatchObject({
      title: "Drift",
      status: "done",
      categoryId: drift,
      actualStartMin: 780,
      actualDurationMin: 45,
    });
    expect(entry && "plannedStartMin" in entry).toBe(false);
  });

  test("keeps a title of its own, trimmed", async () => {
    const t = newTest();
    const { as, body } = await setUp(t);
    const entryId = await as.mutation(api.blocks.logEntry, {
      date: TUE,
      title: "  Run with Tom ",
      categoryId: body,
      actualStartMin: 1080,
      actualDurationMin: 40,
    });
    expect(await read(t, entryId)).toMatchObject({ title: "Run with Tom" });
  });

  test("takes no room in the plan, and refuses an overlap in what happened", async () => {
    const t = newTest();
    const { userId, as, deepWork } = await setUp(t);
    const drift = await driftOf(t, userId);
    const write = await plan(as, deepWork, TUE, "13:00", 60);
    // Over a planned block that is not marked: fine, the plan lane is apart.
    await as.mutation(api.blocks.logEntry, {
      date: TUE,
      categoryId: drift,
      actualStartMin: 780,
      actualDurationMin: 30,
    });
    await expectAppError(
      as.mutation(api.blocks.logEntry, {
        date: TUE,
        categoryId: drift,
        actualStartMin: 795,
        actualDurationMin: 30,
      }),
      "OVERLAP",
    );
    // Done on the block now starts after the entry.
    await as.mutation(api.blocks.setStatus, {
      blockId: write,
      action: { type: "done" },
      now: { date: TUE, minute: 1080 },
    });
    expect(await read(t, write)).toMatchObject({
      actualStartMin: 810,
      actualDurationMin: 30,
    });
  });

  test("refuses times off the step, a start past midnight, someone else's category", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    const drift = await driftOf(t, me.userId);
    for (const [start, length] of [
      [781, 30],
      [1440, 30],
      [780, 0],
      [780, 1445],
    ] as const) {
      await expectAppError(
        me.as.mutation(api.blocks.logEntry, {
          date: TUE,
          categoryId: drift,
          actualStartMin: start,
          actualDurationMin: length,
        }),
        "INVALID_TIME",
      );
    }
    await expectAppError(
      me.as.mutation(api.blocks.logEntry, {
        date: TUE,
        categoryId: other.body,
        actualStartMin: 780,
        actualDurationMin: 30,
      }),
      "NOT_FOUND",
    );
    await expectAppError(
      t.mutation(api.blocks.logEntry, {
        date: TUE,
        categoryId: drift,
        actualStartMin: 780,
        actualDurationMin: 30,
      }),
      "UNAUTHENTICATED",
    );
  });
});

describe("blocks.update: what happened and the note (PRD A2, A5)", () => {
  const evening = { date: TUE, minute: 1080 };

  test("changes the actual times of a done block, not its plan", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await as.mutation(api.blocks.setStatus, {
      blockId,
      action: { type: "done" },
      now: evening,
    });
    await as.mutation(api.blocks.update, {
      blockId,
      actualStartMin: 795,
      actualDurationMin: 75,
    });
    expect(await read(t, blockId)).toMatchObject({
      plannedStartMin: 780,
      plannedDurationMin: 60,
      actualStartMin: 795,
      actualDurationMin: 75,
    });
  });

  test("a block not marked has no actual times to change", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await expectAppError(
      as.mutation(api.blocks.update, {
        blockId,
        actualStartMin: 780,
        actualDurationMin: 60,
      }),
      "INVALID_INPUT",
    );
  });

  test("refuses actual times that collide with something recorded", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const lunch = await plan(as, deepWork, TUE, "12:00", 60, "Lunch");
    const write = await plan(as, deepWork, TUE, "13:00", 60, "Write");
    for (const blockId of [lunch, write]) {
      await as.mutation(api.blocks.setStatus, {
        blockId,
        action: { type: "done" },
        now: evening,
      });
    }
    await expectAppError(
      as.mutation(api.blocks.update, { blockId: lunch, actualDurationMin: 75 }),
      "OVERLAP",
    );
    await expectAppError(
      as.mutation(api.blocks.update, { blockId: lunch, actualStartMin: 721 }),
      "INVALID_TIME",
    );
  });

  test("an unplanned entry moves to another day with its times", async () => {
    const t = newTest();
    const { as, body } = await setUp(t);
    const entryId = await as.mutation(api.blocks.logEntry, {
      date: TUE,
      title: "Run",
      categoryId: body,
      actualStartMin: 1080,
      actualDurationMin: 40,
    });
    await as.mutation(api.blocks.update, {
      blockId: entryId,
      date: WED,
      actualStartMin: 30,
    });
    expect(await read(t, entryId)).toMatchObject({
      date: WED,
      actualStartMin: 30,
      actualDurationMin: 40,
    });
    // An entry starts on its own day: not "Tuesday, 24:30".
    await expectAppError(
      as.mutation(api.blocks.update, {
        blockId: entryId,
        date: TUE,
        actualStartMin: 1470,
      }),
      "INVALID_TIME",
    );
  });

  test("sets, trims, caps and clears the note", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "13:00", 60);
    await as.mutation(api.blocks.update, {
      blockId,
      note: "  Slow start, good finish. ",
    });
    expect(await read(t, blockId)).toMatchObject({
      note: "Slow start, good finish.",
    });
    await expectAppError(
      as.mutation(api.blocks.update, { blockId, note: "x".repeat(201) }),
      "INVALID_INPUT",
    );
    await as.mutation(api.blocks.update, { blockId, note: null });
    const block = await read(t, blockId);
    expect(block && "note" in block).toBe(false);
  });
});

describe("blocks.remove", () => {
  test("deletes the block and frees its time", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const blockId = await plan(as, deepWork, TUE, "09:00", 60);
    await as.mutation(api.blocks.remove, { blockId });
    expect(await read(t, blockId)).toBeNull();
    await plan(as, deepWork, TUE, "09:00", 60);
  });

  test("someone else's block is not found and stays", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    const theirs = await plan(other.as, other.deepWork, TUE, "09:00", 60);
    await expectAppError(
      me.as.mutation(api.blocks.remove, { blockId: theirs }),
      "NOT_FOUND",
    );
    expect(await read(t, theirs)).not.toBeNull();
  });
});

describe("blocks.listForDay", () => {
  test("returns my blocks from the day before to the day after", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    await plan(me.as, me.deepWork, "2026-10-11" as DateKey, "09:00", 60, "Sun");
    await plan(me.as, me.deepWork, MON, "23:00", 480, "Mon");
    await plan(me.as, me.deepWork, TUE, "09:00", 60, "Tue");
    await plan(me.as, me.deepWork, WED, "01:00", 60, "Wed");
    await plan(me.as, me.deepWork, "2026-10-15" as DateKey, "09:00", 60, "Thu");
    await plan(other.as, other.deepWork, TUE, "10:00", 60, "Theirs");

    const blocks = await me.as.query(api.blocks.listForDay, { date: TUE });
    expect(blocks.map((block) => block.title)).toEqual(["Mon", "Tue", "Wed"]);
  });

  test("requires a session and a real date", async () => {
    const t = newTest();
    const { as } = await setUp(t);
    await expectAppError(
      t.query(api.blocks.listForDay, { date: TUE }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      as.query(api.blocks.listForDay, { date: "today" as DateKey }),
      "INVALID_INPUT",
    );
  });
});
