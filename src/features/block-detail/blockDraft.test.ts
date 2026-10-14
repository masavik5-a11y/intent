import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id, PlannedBlockDoc } from "@/lib/api";
import {
  draftOf,
  draftProblem,
  inheritedIntent,
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
