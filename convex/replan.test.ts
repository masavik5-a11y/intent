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

const FRI = "2026-10-16" as DateKey;
const SAT = "2026-10-17" as DateKey;
const NOW = { date: FRI, minute: 860 }; // 14:20

async function setUp(t: TestConvex, email = "me@intent.test") {
  const { userId, as } = await signedIn(t, email);
  await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
  const categories = await as.query(api.categories.list);
  const life = categories.find((category) => category.name === "Life")?._id;
  if (life === undefined) throw new Error("no Life category");
  const plan = (title: string, date: DateKey, start: number, length: number) =>
    as.mutation(api.blocks.create, {
      date,
      title,
      categoryId: life,
      plannedStartMin: start,
      plannedDurationMin: length,
    });
  return { userId, as, plan };
}

function read(t: TestConvex, blockId: Id<"blocks">) {
  return t.run((ctx) => ctx.db.get("blocks", blockId));
}

describe("replan.shiftRest (PRD T11)", () => {
  test("moves the blocks still ahead today, and only them", async () => {
    const t = newTest();
    const { as, plan } = await setUp(t);
    const edit = await plan("Edit", FRI, 840, 120); // running at 14:20
    const gym = await plan("Gym", FRI, 1020, 90);
    const dinner = await plan("Dinner", FRI, 1140, 45);
    const saturday = await plan("Run", SAT, 600, 60);
    expect(
      await as.mutation(api.replan.shiftRest, {
        date: FRI,
        minutes: 30,
        now: NOW,
      }),
    ).toBe(2);
    expect(await read(t, gym)).toMatchObject({ plannedStartMin: 1050 });
    expect(await read(t, dinner)).toMatchObject({ plannedStartMin: 1170 });
    expect(await read(t, edit)).toMatchObject({ plannedStartMin: 840 });
    expect(await read(t, saturday)).toMatchObject({ plannedStartMin: 600 });
  });

  test("when one would land on a block that stays, none moves", async () => {
    const t = newTest();
    const { as, plan } = await setUp(t);
    const gym = await plan("Gym", FRI, 1020, 90);
    const sleep = await plan("Sleep", FRI, 1380, 480); // to Sat 07:00
    const meditation = await plan("Meditation", SAT, 420, 20);
    await expectAppError(
      as.mutation(api.replan.shiftRest, { date: FRI, minutes: 30, now: NOW }),
      "OVERLAP",
    );
    expect(await read(t, gym)).toMatchObject({ plannedStartMin: 1020 });
    expect(await read(t, sleep)).toMatchObject({ plannedStartMin: 1380 });
    expect(await read(t, meditation)).toMatchObject({ plannedStartMin: 420 });
  });

  test("a repeating occurrence it moves is changed alone", async () => {
    const t = newTest();
    const { as, plan } = await setUp(t);
    const gym = await plan("Gym", FRI, 1020, 90);
    await as.mutation(api.recurrences.repeat, {
      blockId: gym,
      weekdays: [5],
    });
    await as.mutation(api.replan.shiftRest, {
      date: FRI,
      minutes: 15,
      now: NOW,
    });
    expect(await read(t, gym)).toMatchObject({
      plannedStartMin: 1035,
      detached: true,
    });
  });

  test("checks its input, its session and has nothing to do on an empty day", async () => {
    const t = newTest();
    const { as, plan } = await setUp(t);
    await expectAppError(
      t.mutation(api.replan.shiftRest, { date: FRI, minutes: 30, now: NOW }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      as.mutation(api.replan.shiftRest, { date: FRI, minutes: 30, now: NOW }),
      "INVALID_INPUT",
    );
    await plan("Gym", FRI, 1020, 90);
    await expectAppError(
      as.mutation(api.replan.shiftRest, { date: FRI, minutes: 7, now: NOW }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.replan.shiftRest, { date: FRI, minutes: -240, now: NOW }),
      "INVALID_TIME",
    );
  });
});

test("sleep is kept to the clock; what would run into it is refused", async () => {
  const t = newTest();
  const { as, plan } = await setUp(t);
  const categories = await as.query(api.categories.list);
  const sleepCategory = categories.find((item) => item.name === "Sleep")?._id;
  if (sleepCategory === undefined) throw new Error("no Sleep category");
  const gym = await plan("Gym", FRI, 1020, 90);
  const sleep = await as.mutation(api.blocks.create, {
    date: FRI,
    title: "Sleep",
    categoryId: sleepCategory,
    plannedStartMin: 1380,
    plannedDurationMin: 480,
  });
  await plan("Meditation", SAT, 420, 20);
  await as.mutation(api.replan.shiftRest, { date: FRI, minutes: 30, now: NOW });
  expect(await read(t, gym)).toMatchObject({ plannedStartMin: 1050 });
  expect(await read(t, sleep)).toMatchObject({ plannedStartMin: 1380 });
  await expectAppError(
    as.mutation(api.replan.shiftRest, { date: FRI, minutes: 300, now: NOW }),
    "OVERLAP",
  );
});

describe("replan.pushToTomorrow (PRD T11)", () => {
  test("a block still ahead moves to the same time tomorrow, or the next free time", async () => {
    const t = newTest();
    const { as, plan } = await setUp(t);
    const gym = await plan("Gym", FRI, 1020, 90);
    await plan("Run", SAT, 1020, 60);
    expect(
      await as.mutation(api.replan.pushToTomorrow, {
        blockId: gym,
        day: FRI,
        now: NOW,
      }),
    ).toBe(SAT);
    expect(await read(t, gym)).toMatchObject({
      date: SAT,
      plannedStartMin: 1080,
    });
  });

  test("a block that has begun stays today, skipped, and a copy goes to tomorrow", async () => {
    const t = newTest();
    const { userId, as, plan } = await setUp(t);
    const edit = await plan("Edit", FRI, 840, 120);
    await as.mutation(api.blocks.update, { blockId: edit, focus: "the hook" });
    await as.mutation(api.replan.pushToTomorrow, {
      blockId: edit,
      day: FRI,
      now: NOW,
    });
    expect(await read(t, edit)).toMatchObject({
      date: FRI,
      plannedStartMin: 840,
      status: "skipped",
    });
    const saturday = await t.run((ctx) =>
      ctx.db
        .query("blocks")
        .withIndex("by_userId_and_date", (q) =>
          q.eq("userId", userId).eq("date", SAT),
        )
        .collect(),
    );
    expect(saturday).toMatchObject([
      {
        title: "Edit",
        focus: "the hook",
        plannedStartMin: 840,
        plannedDurationMin: 120,
        status: "planned",
      },
    ]);
  });

  test("a marked block does not go, a full tomorrow has no room, and it is mine only", async () => {
    const t = newTest();
    const { as, plan } = await setUp(t);
    const other = await setUp(t, "other@intent.test");
    const gym = await plan("Gym", FRI, 1020, 90);
    await plan("Away", SAT, 1020, 720);
    await expectAppError(
      as.mutation(api.replan.pushToTomorrow, {
        blockId: gym,
        day: FRI,
        now: NOW,
      }),
      "NO_ROOM",
    );
    const lunch = await plan("Lunch", FRI, 720, 60);
    await as.mutation(api.blocks.setStatus, {
      blockId: lunch,
      action: { type: "done" },
      now: NOW,
    });
    await expectAppError(
      as.mutation(api.replan.pushToTomorrow, {
        blockId: lunch,
        day: FRI,
        now: NOW,
      }),
      "INVALID_INPUT",
    );
    await expectAppError(
      other.as.mutation(api.replan.pushToTomorrow, {
        blockId: gym,
        day: FRI,
        now: NOW,
      }),
      "NOT_FOUND",
    );
  });
});
