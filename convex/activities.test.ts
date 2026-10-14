import { describe, expect, test } from "vitest";
import { DEFAULT_CATEGORIES } from "../shared/categories";
import type { DateKey } from "../shared/time";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  expectAppError,
  newTest,
  signedIn,
  type TestConvex,
} from "./test.helpers";

/** A signed-in user with the default categories. */
async function setUp(t: TestConvex, email = "me@intent.test") {
  const { userId, as } = await signedIn(t, email);
  await as.mutation(api.setup.ensure, { timeZone: "Europe/Prague" });
  const categories = await as.query(api.categories.list);
  const byName = (name: string): Id<"categories"> => {
    const found = categories.find((category) => category.name === name);
    if (found === undefined) throw new Error(`no category ${name}`);
    return found._id;
  };
  return { userId, as, body: byName("Body"), deepWork: byName("Deep work") };
}

const gym = {
  name: "Gym",
  defaultDurationMin: 90,
  notify: true,
  pressure: false,
};

function read(t: TestConvex, activityId: Id<"activities">) {
  return t.run((ctx) => ctx.db.get("activities", activityId));
}

describe("activities.create", () => {
  test("requires a session", async () => {
    const t = newTest();
    const { body } = await setUp(t);
    await expectAppError(
      t.mutation(api.activities.create, { ...gym, categoryId: body }),
      "UNAUTHENTICATED",
    );
  });

  test("stores the activity with its intent, trimmed, and not archived", async () => {
    const t = newTest();
    const { userId, as, body } = await setUp(t);
    const activityId = await as.mutation(api.activities.create, {
      ...gym,
      name: "  Gym ",
      categoryId: body,
      icon: "dumbbell",
      why: " Energy for the camera. ",
      how: "Bench 4x6, incline, dips.",
      ifThen: "I do 10 minutes and decide.",
      minimumVersion: "20 minutes, three exercises.",
      costOfSkipping: "Low energy, and it shows on camera.",
      doneWhen: "",
    });
    const activity = await read(t, activityId);
    expect(activity).toMatchObject({
      userId,
      name: "Gym",
      categoryId: body,
      icon: "dumbbell",
      defaultDurationMin: 90,
      notify: true,
      pressure: false,
      archived: false,
      why: "Energy for the camera.",
      minimumVersion: "20 minutes, three exercises.",
    });
    expect(activity && "doneWhen" in activity).toBe(false);
  });

  test.each([
    ["a blank name", { name: "  " }, "INVALID_INPUT"],
    ["a name over 80 characters", { name: "x".repeat(81) }, "INVALID_INPUT"],
    ["an unknown icon", { icon: "rocket-ship" }, "INVALID_INPUT"],
    ["a why over 1000 characters", { why: "x".repeat(1001) }, "INVALID_INPUT"],
    ["a duration off the step", { defaultDurationMin: 61 }, "INVALID_TIME"],
    ["a zero duration", { defaultDurationMin: 0 }, "INVALID_TIME"],
  ] as const)("rejects %s", async (_name, change, code) => {
    const t = newTest();
    const { as, body } = await setUp(t);
    await expectAppError(
      as.mutation(api.activities.create, {
        ...gym,
        categoryId: body,
        ...change,
      }),
      code,
    );
  });

  test("rejects someone else's category as not found", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    await expectAppError(
      me.as.mutation(api.activities.create, { ...gym, categoryId: other.body }),
      "NOT_FOUND",
    );
  });
});

describe("activities.update", () => {
  test("changes what is given, keeps the rest, and null clears", async () => {
    const t = newTest();
    const { as, body, deepWork } = await setUp(t);
    const activityId = await as.mutation(api.activities.create, {
      ...gym,
      categoryId: body,
      icon: "dumbbell",
      why: "Energy for the camera.",
      how: "Bench 4x6.",
    });
    await as.mutation(api.activities.update, {
      activityId,
      name: "Strength",
      categoryId: deepWork,
      pressure: true,
      defaultDurationMin: 60,
      why: "Strong on camera.",
      how: null,
      icon: null,
    });
    const activity = await read(t, activityId);
    expect(activity).toMatchObject({
      name: "Strength",
      categoryId: deepWork,
      pressure: true,
      notify: true,
      defaultDurationMin: 60,
      why: "Strong on camera.",
    });
    expect(activity && "how" in activity).toBe(false);
    expect(activity && "icon" in activity).toBe(false);
  });

  test("a new why reaches blocks that did not override it", async () => {
    const t = newTest();
    const { as, body } = await setUp(t);
    const activityId = await as.mutation(api.activities.create, {
      ...gym,
      categoryId: body,
      why: "Energy for the camera.",
    });
    const blockId = await as.mutation(api.blocks.create, {
      date: "2026-10-13" as DateKey,
      activityId,
      plannedStartMin: 660,
      plannedDurationMin: 90,
    });
    await as.mutation(api.activities.update, {
      activityId,
      why: "I keep promises to myself.",
    });
    // The block stores no why of its own; it is read from the activity when shown.
    const block = await t.run((ctx) => ctx.db.get("blocks", blockId));
    expect(block?.why).toBeUndefined();
    expect((await read(t, activityId))?.why).toBe("I keep promises to myself.");
  });

  test("rejects invalid changes and leaves the activity as it was", async () => {
    const t = newTest();
    const { as, body } = await setUp(t);
    const activityId = await as.mutation(api.activities.create, {
      ...gym,
      categoryId: body,
    });
    await expectAppError(
      as.mutation(api.activities.update, { activityId, name: "" }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.activities.update, { activityId, icon: "nope" }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.activities.update, {
        activityId,
        defaultDurationMin: 7,
      }),
      "INVALID_TIME",
    );
    expect(await read(t, activityId)).toMatchObject({
      name: "Gym",
      defaultDurationMin: 90,
    });
  });

  test("someone else's activity or category is not found", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    const mine = await me.as.mutation(api.activities.create, {
      ...gym,
      categoryId: me.body,
    });
    const theirs = await other.as.mutation(api.activities.create, {
      ...gym,
      categoryId: other.body,
    });
    await expectAppError(
      me.as.mutation(api.activities.update, {
        activityId: theirs,
        name: "Mine now",
      }),
      "NOT_FOUND",
    );
    await expectAppError(
      me.as.mutation(api.activities.update, {
        activityId: mine,
        categoryId: other.body,
      }),
      "NOT_FOUND",
    );
    expect((await read(t, theirs))?.name).toBe("Gym");
  });
});

describe("activities.setArchived", () => {
  test("archives and restores", async () => {
    const t = newTest();
    const { as, body } = await setUp(t);
    const activityId = await as.mutation(api.activities.create, {
      ...gym,
      categoryId: body,
    });
    await as.mutation(api.activities.setArchived, {
      activityId,
      archived: true,
    });
    expect((await read(t, activityId))?.archived).toBe(true);
    await as.mutation(api.activities.setArchived, {
      activityId,
      archived: false,
    });
    expect((await read(t, activityId))?.archived).toBe(false);
  });

  test("someone else's activity is not found", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    const theirs = await other.as.mutation(api.activities.create, {
      ...gym,
      categoryId: other.body,
    });
    await expectAppError(
      me.as.mutation(api.activities.setArchived, {
        activityId: theirs,
        archived: true,
      }),
      "NOT_FOUND",
    );
  });
});

describe("activities.list and categories.list", () => {
  test("return only my own, archived activities included", async () => {
    const t = newTest();
    const me = await setUp(t, "me@intent.test");
    const other = await setUp(t, "other@intent.test");
    const kept = await me.as.mutation(api.activities.create, {
      ...gym,
      categoryId: me.body,
    });
    const archived = await me.as.mutation(api.activities.create, {
      ...gym,
      name: "Run",
      categoryId: me.body,
    });
    await me.as.mutation(api.activities.setArchived, {
      activityId: archived,
      archived: true,
    });
    await other.as.mutation(api.activities.create, {
      ...gym,
      name: "Theirs",
      categoryId: other.body,
    });

    const activities = await me.as.query(api.activities.list);
    expect(activities.map((activity) => activity._id)).toEqual([
      kept,
      archived,
    ]);
    const categories = await me.as.query(api.categories.list);
    expect(categories.map((category) => category.name)).toEqual(
      DEFAULT_CATEGORIES.map((category) => category.name),
    );
  });

  test("require a session", async () => {
    const t = newTest();
    await expectAppError(t.query(api.activities.list), "UNAUTHENTICATED");
    await expectAppError(t.query(api.categories.list), "UNAUTHENTICATED");
  });
});
