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

const SAT = "2026-10-17" as DateKey;

/** A signed-in user with the default categories and one activity, Gym. */
async function setUp(t: TestConvex, email = "me@intent.test") {
  const { userId, as } = await signedIn(t, email);
  await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
  const categories = await as.query(api.categories.list);
  const byName = (name: string): Id<"categories"> => {
    const found = categories.find((category) => category.name === name);
    if (found === undefined) throw new Error(`no category ${name}`);
    return found._id;
  };
  const gym = await as.mutation(api.activities.create, {
    name: "Gym",
    categoryId: byName("Body"),
    defaultDurationMin: 90,
    notify: true,
    pressure: false,
  });
  return { userId, as, gym, events: byName("Events") };
}

function blocksOn(t: TestConvex, date: DateKey) {
  return t.run((ctx) =>
    ctx.db
      .query("blocks")
      .withIndex("by_userId_and_date")
      .collect()
      .then((all) => all.filter((block) => block.date === date)),
  );
}

describe("inbox (PRD P8)", () => {
  test("every function requires a session", async () => {
    const t = newTest();
    const { as, events } = await setUp(t);
    const itemId = await as.mutation(api.inbox.capture, { title: "Call" });
    await expectAppError(t.query(api.inbox.list, {}), "UNAUTHENTICATED");
    await expectAppError(
      t.mutation(api.inbox.capture, { title: "Call" }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      t.mutation(api.inbox.remove, { itemId }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      t.mutation(api.inbox.schedule, {
        itemId,
        date: SAT,
        plannedStartMin: 600,
        plannedDurationMin: 30,
        categoryId: events,
      }),
      "UNAUTHENTICATED",
    );
  });

  test("captures trimmed, in order, with a note and an activity", async () => {
    const t = newTest();
    const { userId, as, gym } = await setUp(t);
    await as.mutation(api.inbox.capture, {
      title: "  Call the venue ",
      note: " about the date ",
    });
    await as.mutation(api.inbox.capture, {
      title: "Leg day",
      note: "  ",
      activityId: gym,
    });
    const items = await as.query(api.inbox.list, {});
    expect(items).toMatchObject([
      { userId, title: "Call the venue", note: "about the date" },
      { title: "Leg day", activityId: gym },
    ]);
    expect(items[1]).not.toHaveProperty("note");
  });

  test("a capture needs a title of 80 characters at most, and its own activity", async () => {
    const t = newTest();
    const { as } = await setUp(t);
    const other = await setUp(t, "other@intent.test");
    await expectAppError(
      as.mutation(api.inbox.capture, { title: "  " }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.inbox.capture, { title: "x".repeat(81) }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.inbox.capture, { title: "x", note: "y".repeat(201) }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.inbox.capture, { title: "x", activityId: other.gym }),
      "NOT_FOUND",
    );
  });

  test("scheduling makes a planned block and empties the slot in the inbox", async () => {
    const t = newTest();
    const { as, events } = await setUp(t);
    const itemId = await as.mutation(api.inbox.capture, {
      title: "Wedding",
    });
    const blockId = await as.mutation(api.inbox.schedule, {
      itemId,
      date: "2026-11-07" as DateKey,
      plannedStartMin: 840,
      plannedDurationMin: 480,
      categoryId: events,
    });
    expect(await as.query(api.inbox.list, {})).toEqual([]);
    const block = await t.run((ctx) => ctx.db.get("blocks", blockId));
    expect(block).toMatchObject({
      title: "Wedding",
      date: "2026-11-07",
      plannedStartMin: 840,
      plannedDurationMin: 480,
      categoryId: events,
      status: "planned",
    });
  });

  test("an item with an activity becomes a block of it", async () => {
    const t = newTest();
    const { as, gym } = await setUp(t);
    const itemId = await as.mutation(api.inbox.capture, {
      title: "Leg day",
      activityId: gym,
    });
    const blockId = await as.mutation(api.inbox.schedule, {
      itemId,
      date: SAT,
      plannedStartMin: 600,
      plannedDurationMin: 90,
    });
    expect(await t.run((ctx) => ctx.db.get("blocks", blockId))).toMatchObject({
      title: "Leg day",
      activityId: gym,
    });
  });

  test("a schedule that would overlap is refused and the item stays", async () => {
    const t = newTest();
    const { as, gym, events } = await setUp(t);
    await as.mutation(api.blocks.create, {
      date: SAT,
      activityId: gym,
      plannedStartMin: 600,
      plannedDurationMin: 90,
    });
    const itemId = await as.mutation(api.inbox.capture, { title: "Call" });
    await expectAppError(
      as.mutation(api.inbox.schedule, {
        itemId,
        date: SAT,
        plannedStartMin: 630,
        plannedDurationMin: 30,
        categoryId: events,
      }),
      "OVERLAP",
    );
    expect(await as.query(api.inbox.list, {})).toHaveLength(1);
    expect(await blocksOn(t, SAT)).toHaveLength(1);
  });

  test("someone else's item is not found, not listed, not scheduled", async () => {
    const t = newTest();
    const { as } = await setUp(t);
    const other = await setUp(t, "other@intent.test");
    const itemId = await as.mutation(api.inbox.capture, { title: "Mine" });
    expect(await other.as.query(api.inbox.list, {})).toEqual([]);
    await expectAppError(
      other.as.mutation(api.inbox.remove, { itemId }),
      "NOT_FOUND",
    );
    await expectAppError(
      other.as.mutation(api.inbox.schedule, {
        itemId,
        date: SAT,
        plannedStartMin: 600,
        plannedDurationMin: 30,
        categoryId: other.events,
      }),
      "NOT_FOUND",
    );
    await as.mutation(api.inbox.remove, { itemId });
    expect(await as.query(api.inbox.list, {})).toEqual([]);
  });
});
