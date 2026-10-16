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
  return { userId, as, deepWork: byName("Deep work"), body: byName("Body") };
}

function readGoal(t: TestConvex, goalId: Id<"goals">) {
  return t.run((ctx) => ctx.db.get("goals", goalId));
}

describe("goals", () => {
  test("every function requires a session", async () => {
    const t = newTest();
    const { as } = await setUp(t);
    const goalId = await as.mutation(api.goals.create, {
      title: "Launch",
      today: FRI,
    });
    await expectAppError(t.query(api.goals.list, {}), "UNAUTHENTICATED");
    await expectAppError(t.query(api.goals.invested, {}), "UNAUTHENTICATED");
    await expectAppError(
      t.mutation(api.goals.create, { title: "Launch", today: FRI }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      t.mutation(api.goals.update, { goalId, title: "x" }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      t.mutation(api.goals.setStatus, { goalId, status: "done" }),
      "UNAUTHENTICATED",
    );
  });

  test("a goal is made active, trimmed, dated from today, in order", async () => {
    const t = newTest();
    const { userId, as } = await setUp(t);
    const first = await as.mutation(api.goals.create, {
      title: "  Launch the course ",
      why: " People asked for it. ",
      dueDate: "2026-11-21" as DateKey,
      today: FRI,
    });
    const second = await as.mutation(api.goals.create, {
      title: "Read more",
      why: "  ",
      today: FRI,
    });
    expect(await readGoal(t, first)).toMatchObject({
      userId,
      title: "Launch the course",
      why: "People asked for it.",
      dueDate: "2026-11-21",
      createdOn: FRI,
      status: "active",
      sortOrder: 0,
    });
    const read = await readGoal(t, second);
    expect(read).toMatchObject({ sortOrder: 1, status: "active" });
    expect(read).not.toHaveProperty("why");
    expect(read).not.toHaveProperty("dueDate");
    expect(await as.query(api.goals.list, {})).toHaveLength(2);
  });

  test("a goal needs a title and real dates", async () => {
    const t = newTest();
    const { as } = await setUp(t);
    await expectAppError(
      as.mutation(api.goals.create, { title: "   ", today: FRI }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.goals.create, { title: "x".repeat(81), today: FRI }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.goals.create, {
        title: "Launch",
        dueDate: "2026-02-30" as DateKey,
        today: FRI,
      }),
      "INVALID_INPUT",
    );
    await expectAppError(
      as.mutation(api.goals.create, {
        title: "Launch",
        today: "16.10.2026" as DateKey,
      }),
      "INVALID_INPUT",
    );
  });

  test("update changes what is given, null clears, and status opens and closes", async () => {
    const t = newTest();
    const { as } = await setUp(t);
    const goalId = await as.mutation(api.goals.create, {
      title: "Launch",
      why: "Asked twice.",
      dueDate: "2026-11-21" as DateKey,
      today: FRI,
    });
    await as.mutation(api.goals.update, {
      goalId,
      title: "Launch the course",
      dueDate: null,
    });
    const read = await readGoal(t, goalId);
    expect(read).toMatchObject({
      title: "Launch the course",
      why: "Asked twice.",
    });
    expect(read).not.toHaveProperty("dueDate");
    await as.mutation(api.goals.update, { goalId, why: null });
    expect(await readGoal(t, goalId)).not.toHaveProperty("why");

    await as.mutation(api.goals.setStatus, { goalId, status: "dropped" });
    expect(await readGoal(t, goalId)).toMatchObject({ status: "dropped" });
    await as.mutation(api.goals.setStatus, { goalId, status: "active" });
    expect(await readGoal(t, goalId)).toMatchObject({ status: "active" });
  });

  test("someone else's goal is not found and not listed", async () => {
    const t = newTest();
    const { as } = await setUp(t);
    const other = await setUp(t, "other@intent.test");
    const goalId = await as.mutation(api.goals.create, {
      title: "Mine",
      today: FRI,
    });
    expect(await other.as.query(api.goals.list, {})).toEqual([]);
    await expectAppError(
      other.as.mutation(api.goals.update, { goalId, title: "Theirs" }),
      "NOT_FOUND",
    );
    await expectAppError(
      other.as.mutation(api.goals.setStatus, { goalId, status: "done" }),
      "NOT_FOUND",
    );
    // Nor can it be linked to their activity.
    await expectAppError(
      other.as.mutation(api.activities.create, {
        name: "Script",
        categoryId: other.deepWork,
        defaultDurationMin: 60,
        notify: true,
        pressure: true,
        goalId,
      }),
      "NOT_FOUND",
    );
  });
});

describe("an activity points at a goal", () => {
  test("created with one, changed, and unlinked with null", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const launch = await as.mutation(api.goals.create, {
      title: "Launch",
      today: FRI,
    });
    const read = await as.mutation(api.goals.create, {
      title: "Read",
      today: FRI,
    });
    const activityId = await as.mutation(api.activities.create, {
      name: "Script",
      categoryId: deepWork,
      defaultDurationMin: 60,
      notify: true,
      pressure: true,
      goalId: launch,
    });
    const get = () => t.run((ctx) => ctx.db.get("activities", activityId));
    expect(await get()).toMatchObject({ goalId: launch });
    await as.mutation(api.activities.update, { activityId, goalId: read });
    expect(await get()).toMatchObject({ goalId: read });
    await as.mutation(api.activities.update, { activityId, name: "Write" });
    expect(await get()).toMatchObject({ goalId: read });
    await as.mutation(api.activities.update, { activityId, goalId: null });
    expect(await get()).not.toHaveProperty("goalId");
  });
});

describe("weekly targets", () => {
  test("set in minutes, cleared with null, and checked", async () => {
    const t = newTest();
    const { as, deepWork } = await setUp(t);
    const target = async () =>
      (await as.query(api.categories.list)).find(
        (category) => category._id === deepWork,
      )?.weeklyTargetMin;
    await as.mutation(api.categories.setWeeklyTarget, {
      categoryId: deepWork,
      minutes: 900,
    });
    expect(await target()).toBe(900);
    await as.mutation(api.categories.setWeeklyTarget, {
      categoryId: deepWork,
      minutes: null,
    });
    expect(await target()).toBeUndefined();
    for (const minutes of [0, 7, 10085, 90.5]) {
      await expectAppError(
        as.mutation(api.categories.setWeeklyTarget, {
          categoryId: deepWork,
          minutes,
        }),
        "INVALID_TIME",
      );
    }
  });

  test("requires a session, and someone else's category is not found", async () => {
    const t = newTest();
    const { deepWork } = await setUp(t);
    const other = await setUp(t, "other@intent.test");
    await expectAppError(
      t.mutation(api.categories.setWeeklyTarget, {
        categoryId: deepWork,
        minutes: 600,
      }),
      "UNAUTHENTICATED",
    );
    await expectAppError(
      other.as.mutation(api.categories.setWeeklyTarget, {
        categoryId: deepWork,
        minutes: 600,
      }),
      "NOT_FOUND",
    );
  });
});

describe("goals.invested", () => {
  test("actual minutes on the goal's activities since the goal was made", async () => {
    const t = newTest();
    const { userId, as, deepWork, body } = await setUp(t);
    const launch = await as.mutation(api.goals.create, {
      title: "Launch",
      today: "2026-10-12" as DateKey,
    });
    const idle = await as.mutation(api.goals.create, {
      title: "Idle",
      today: FRI,
    });
    const script = await as.mutation(api.activities.create, {
      name: "Script",
      categoryId: deepWork,
      defaultDurationMin: 60,
      notify: true,
      pressure: true,
      goalId: launch,
    });
    const edit = await as.mutation(api.activities.create, {
      name: "Edit",
      categoryId: deepWork,
      defaultDurationMin: 60,
      notify: true,
      pressure: true,
      goalId: launch,
    });
    const gym = await as.mutation(api.activities.create, {
      name: "Gym",
      categoryId: body,
      defaultDurationMin: 60,
      notify: true,
      pressure: false,
    });
    await t.run(async (ctx) => {
      const base = { userId, categoryId: deepWork, title: "x" };
      const insert = (
        date: string,
        activityId: Id<"activities">,
        extra: Record<string, unknown>,
      ) =>
        ctx.db.insert("blocks", {
          ...base,
          date: date as DateKey,
          activityId,
          plannedStartMin: 540,
          plannedDurationMin: 120,
          status: "planned",
          ...extra,
        });
      // Before the goal: not counted.
      await insert("2026-10-11", script, {
        status: "done",
        actualStartMin: 540,
        actualDurationMin: 120,
      });
      await insert("2026-10-12", script, {
        status: "done",
        actualStartMin: 540,
        actualDurationMin: 120,
      });
      await insert("2026-10-13", edit, {
        status: "partial",
        actualStartMin: 540,
        actualDurationMin: 45,
      });
      // Planned and skipped blocks have no actual minutes.
      await insert("2026-10-14", script, {});
      await insert("2026-10-15", script, {
        status: "skipped",
      });
      // Another activity, not linked.
      await insert("2026-10-14", gym, {
        plannedStartMin: 1020,
        status: "done",
        actualStartMin: 1020,
        actualDurationMin: 90,
      });
    });
    expect(await as.query(api.goals.invested, {})).toEqual([
      { goalId: launch, minutes: 165, capped: false },
      { goalId: idle, minutes: 0, capped: false },
    ]);
    // Unlinking an activity takes its hours with it.
    await as.mutation(api.activities.update, {
      activityId: edit,
      goalId: null,
    });
    expect(await as.query(api.goals.invested, {})).toContainEqual({
      goalId: launch,
      minutes: 120,
      capped: false,
    });
  });
});
