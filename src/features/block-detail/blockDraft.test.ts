import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id, PlannedBlockDoc } from "@/lib/api";
import {
  actualProblem,
  draftOf,
  draftProblem,
  inheritedIntent,
  planChanged,
  updateArgs,
} from "./blockDraft";

const gymBlock: PlannedBlockDoc = {
  _id: "b1" as Id<"blocks">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  date: "2026-10-13" as DateKey,
  title: "Gym",
  activityId: "a-gym" as Id<"activities">,
  categoryId: "c-body" as Id<"categories">,
  plannedStartMin: 660,
  plannedDurationMin: 90,
  status: "planned",
  doneWhen: "All four lifts logged.",
};

const gym: Doc<"activities"> = {
  _id: "a-gym" as Id<"activities">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Gym",
  categoryId: "c-body" as Id<"categories">,
  defaultDurationMin: 90,
  notify: true,
  pressure: false,
  archived: false,
  why: "Energy for the camera.",
  how: "  ",
};

describe("draftOf", () => {
  test("holds the block's own values, blank where it has none", () => {
    expect(draftOf(gymBlock)).toEqual({
      title: "Gym",
      focus: "",
      activityId: "a-gym",
      categoryId: "c-body",
      plannedStartMin: 660,
      plannedDurationMin: 90,
      actualClockMin: null,
      actualDurationMin: null,
      note: "",
      doneWhen: "All four lifts logged.",
      why: "",
      how: "",
      ifThen: "",
      minimumVersion: "",
      costOfSkipping: "",
    });
  });
});

describe("draftProblem", () => {
  test.each([
    [{ title: " " }, "Give it a title."],
    [{ plannedStartMin: 662 }, "Use a start time in 5-minute steps."],
    [{ plannedDurationMin: 0 }, "Use a length from 5 minutes to 24 hours."],
  ])("%o -> %s", (change, message) => {
    expect(draftProblem({ ...draftOf(gymBlock), ...change })).toBe(message);
  });

  test("an unchanged block has none", () => {
    expect(draftProblem(draftOf(gymBlock))).toBeNull();
  });
});

describe("updateArgs", () => {
  test("nothing changed: only the id", () => {
    expect(updateArgs(gymBlock, draftOf(gymBlock))).toEqual({
      blockId: "b1",
    });
  });

  test("sends changes; emptied text and a removed activity become null", () => {
    const draft = {
      ...draftOf(gymBlock),
      focus: "Push day",
      why: "Today it is about the legs.",
      doneWhen: "",
      activityId: null,
      plannedStartMin: 690,
    };
    expect(updateArgs(gymBlock, draft)).toEqual({
      blockId: "b1",
      focus: "Push day",
      why: "Today it is about the legs.",
      doneWhen: null,
      activityId: null,
      plannedStartMin: 690,
    });
  });
});

describe("inheritedIntent", () => {
  test("the activity's text, and null for blank or missing fields", () => {
    expect(inheritedIntent(gym)).toEqual({
      doneWhen: null,
      why: "Energy for the camera.",
      how: null,
      ifThen: null,
      minimumVersion: null,
      costOfSkipping: null,
    });
  });

  test("without an activity nothing is inherited", () => {
    expect(inheritedIntent(undefined).why).toBeNull();
  });
});

describe("what happened and the note", () => {
  const sleep: PlannedBlockDoc = {
    ...gymBlock,
    title: "Sleep",
    plannedStartMin: 1380, // 23:00
    plannedDurationMin: 480,
    status: "done",
    actualStartMin: 1410, // 23:30
    actualDurationMin: 450,
  };

  test("the draft holds the start as a clock time", () => {
    expect(draftOf(sleep)).toMatchObject({
      actualClockMin: 1410,
      actualDurationMin: 450,
    });
    expect(draftOf({ ...sleep, actualStartMin: 1450 }).actualClockMin).toBe(10);
  });

  test("a later start past midnight stays on the right side of it", () => {
    const draft = {
      ...draftOf(sleep),
      actualClockMin: 15,
      actualDurationMin: 420,
    };
    expect(updateArgs(sleep, draft)).toEqual({
      blockId: "b1",
      actualStartMin: 1455,
      actualDurationMin: 420,
    });
  });

  test("after Undo, edited actual times are not sent", () => {
    const undone: PlannedBlockDoc = {
      ...gymBlock,
      status: "planned",
    };
    const draft = {
      ...draftOf(undone),
      actualClockMin: 700,
      actualDurationMin: 30,
    };
    expect(updateArgs(undone, draft)).toEqual({ blockId: "b1" });
  });

  test("re-marked while open (Done, Undo, Partly 30): only the note is sent", () => {
    const done: PlannedBlockDoc = {
      ...gymBlock,
      status: "done",
      actualStartMin: 660,
      actualDurationMin: 90,
    };
    const opened = draftOf(done);
    const partly: PlannedBlockDoc = {
      ...done,
      status: "partial",
      actualDurationMin: 30,
    };
    // BlockDetail drops the draft's actual times when the block's change.
    const draft = {
      ...opened,
      actualClockMin: null,
      actualDurationMin: null,
      note: "Only half.",
    };
    expect(updateArgs(partly, draft)).toEqual({
      blockId: "b1",
      note: "Only half.",
    });
    // Kept, the old length would have overwritten the new mark.
    expect(updateArgs(partly, { ...opened, note: "Only half." })).toMatchObject(
      {
        actualDurationMin: 90,
      },
    );
  });

  test("only what changed is sent; the note is trimmed or cleared", () => {
    expect(
      updateArgs(sleep, { ...draftOf(sleep), note: "Woke at 4, back by 5." }),
    ).toEqual({ blockId: "b1", note: "Woke at 4, back by 5." });
    expect(
      updateArgs({ ...sleep, note: "Old" }, { ...draftOf(sleep), note: "  " }),
    ).toEqual({ blockId: "b1", note: null });
  });

  test.each<[string, Partial<ReturnType<typeof draftOf>>, string | null]>([
    ["fine", {}, null],
    [
      "off the step",
      { actualClockMin: 1412 },
      "Use a start time in 5-minute steps.",
    ],
    [
      "no length",
      { actualDurationMin: 0 },
      "Use a length from 5 minutes to 24 hours.",
    ],
  ])("actualProblem: %s", (_, change, message) => {
    expect(actualProblem(sleep, { ...draftOf(sleep), ...change })).toBe(
      message,
    );
  });

  test("actualProblem: a start on the day before the block's own", () => {
    // Read at 00:30, so 23:50 could only be the evening before.
    const early = { ...sleep, plannedStartMin: 30, actualStartMin: 30 };
    expect(
      actualProblem(early, { ...draftOf(early), actualClockMin: 1430 }),
    ).toBe(
      "That start would fall on the day before. Pick one closer to the plan.",
    );
  });
});

describe("planChanged", () => {
  test("only what a rule copies counts: what it is and when", () => {
    const draft = draftOf(gymBlock);
    expect(planChanged(gymBlock, draft)).toBe(false);
    expect(planChanged(gymBlock, { ...draft, why: "Other why." })).toBe(false);
    expect(planChanged(gymBlock, { ...draft, note: "A note." })).toBe(false);
    expect(planChanged(gymBlock, { ...draft, title: " Gym " })).toBe(false);
    expect(planChanged(gymBlock, { ...draft, focus: "Legs" })).toBe(true);
    expect(planChanged(gymBlock, { ...draft, plannedStartMin: 720 })).toBe(
      true,
    );
  });
});
