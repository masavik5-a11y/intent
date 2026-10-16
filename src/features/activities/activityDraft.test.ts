import { describe, expect, test } from "vitest";
import type { Doc, Id } from "@/lib/api";
import type { DateKey } from "@shared/time";
import {
  createArgs,
  draftOf,
  draftProblem,
  goalChoices,
  groupByCategory,
  newDraft,
  updateArgs,
} from "./activityDraft";

function category(
  id: string,
  name: string,
  sortOrder: number,
  archived = false,
): Doc<"categories"> {
  return {
    _id: id as Id<"categories">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    name,
    kind: "intentional",
    colorKey: "violet",
    icon: "brain",
    sortOrder,
    archived,
  };
}

const deepWork = category("c-deep", "Deep work", 0);
const body = category("c-body", "Body", 1);
const old = category("c-old", "Old", 2, true);

function activity(
  fields: Partial<Doc<"activities">> & { name: string },
): Doc<"activities"> {
  return {
    _id: `a-${fields.name}` as Id<"activities">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    categoryId: body._id,
    defaultDurationMin: 90,
    notify: true,
    pressure: false,
    archived: false,
    ...fields,
  };
}

const gym = activity({
  name: "Gym",
  icon: "dumbbell",
  why: "Energy for the camera.",
  how: "Bench 4x6.",
});

describe("newDraft", () => {
  test("starts in the first category that is not archived", () => {
    const draft = newDraft([old, deepWork, body]);
    expect(draft.categoryId).toBe(deepWork._id);
    expect(draft.defaultDurationMin).toBe(60);
    expect(draft.notify).toBe(true);
    expect(draft.name).toBe("");
    expect(draft.why).toBe("");
  });

  test("pressure starts on for deep work only", () => {
    expect(newDraft([deepWork]).pressure).toBe(true);
    expect(newDraft([deepWork], body).pressure).toBe(false);
  });

  test("has no category when there is none to choose", () => {
    expect(newDraft([old]).categoryId).toBeNull();
  });
});

describe("draftOf", () => {
  test("fills every field, with blank text for what is unset", () => {
    expect(draftOf(gym)).toEqual({
      name: "Gym",
      categoryId: body._id,
      icon: "dumbbell",
      defaultDurationMin: 90,
      notify: true,
      pressure: false,
      why: "Energy for the camera.",
      how: "Bench 4x6.",
      doneWhen: "",
      ifThen: "",
      minimumVersion: "",
      costOfSkipping: "",
      goalId: null,
    });
  });

  test("an icon the app no longer knows becomes the category's", () => {
    expect(draftOf(activity({ name: "X", icon: "rocket" })).icon).toBeNull();
  });
});

describe("draftProblem", () => {
  test.each([
    [{ name: "  " }, "Give it a name."],
    [{ categoryId: null }, "Choose a category."],
    [
      { defaultDurationMin: 0 },
      "Use a length from 5 minutes to 24 hours, in 5-minute steps.",
    ],
    [
      { defaultDurationMin: 62 },
      "Use a length from 5 minutes to 24 hours, in 5-minute steps.",
    ],
  ])("%o -> %s", (change, message) => {
    expect(draftProblem({ ...draftOf(gym), ...change })).toBe(message);
  });

  test("a complete draft has none", () => {
    expect(draftProblem(draftOf(gym))).toBeNull();
  });
});

describe("createArgs", () => {
  test("sends only the text that was written", () => {
    const draft = {
      ...newDraft([body]),
      name: "Meditation",
      why: "A quieter head.",
      how: "   ",
    };
    expect(createArgs(draft, body._id)).toEqual({
      name: "Meditation",
      categoryId: body._id,
      defaultDurationMin: 60,
      notify: true,
      pressure: false,
      why: "A quieter head.",
    });
  });

  test("sends the icon when one was chosen", () => {
    const draft = {
      ...newDraft([body]),
      name: "Run",
      icon: "footprints" as const,
    };
    expect(createArgs(draft, body._id).icon).toBe("footprints");
  });
});

describe("updateArgs", () => {
  test("sends nothing but the id when nothing changed", () => {
    expect(updateArgs(gym, draftOf(gym))).toEqual({ activityId: gym._id });
  });

  test("sends what changed, and null for cleared text and icon", () => {
    const draft = {
      ...draftOf(gym),
      name: "Strength",
      categoryId: deepWork._id,
      icon: null,
      pressure: true,
      why: "Strong on camera.",
      how: "",
      ifThen: "Ten minutes, then decide.",
    };
    expect(updateArgs(gym, draft)).toEqual({
      activityId: gym._id,
      name: "Strength",
      categoryId: deepWork._id,
      icon: null,
      pressure: true,
      why: "Strong on camera.",
      how: null,
      ifThen: "Ten minutes, then decide.",
    });
  });
});

describe("the goal an activity points at (PRD U6)", () => {
  const launch = "g-launch" as Id<"goals">;
  const goal = (id: string, status: Doc<"goals">["status"]): Doc<"goals"> => ({
    _id: id as Id<"goals">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    title: id,
    createdOn: "2026-10-01" as DateKey,
    status,
    sortOrder: 0,
  });

  test("is sent on create, and on update only when it changed, null to unlink", () => {
    const draft = { ...newDraft([body]), name: "Script", goalId: launch };
    expect(createArgs(draft, body._id).goalId).toBe(launch);
    expect(createArgs(newDraft([body]), body._id)).not.toHaveProperty("goalId");
    const linked = activity({ name: "Script", goalId: launch });
    expect(draftOf(linked).goalId).toBe(launch);
    expect(updateArgs(linked, draftOf(linked))).not.toHaveProperty("goalId");
    expect(
      updateArgs(linked, { ...draftOf(linked), goalId: null }),
    ).toMatchObject({ goalId: null });
  });

  test("the choices are the open goals, and the linked one even when closed", () => {
    const goals = [
      goal("open", "active"),
      goal("done", "done"),
      goal("dropped", "dropped"),
    ];
    expect(goalChoices(goals, null).map((item) => item._id)).toEqual(["open"]);
    expect(
      goalChoices(goals, "done" as Id<"goals">).map((item) => item._id),
    ).toEqual(["open", "done"]);
  });
});

describe("groupByCategory", () => {
  test("groups by category in order, by name, without archived or empty groups", () => {
    const run = activity({ name: "Run" });
    const yoga = activity({ name: "Yoga", archived: true });
    const script = activity({ name: "Script", categoryId: deepWork._id });
    const groups = groupByCategory(
      [run, gym, yoga, script],
      [deepWork, body, old],
    );
    expect(
      groups.map((group) => [
        group.category.name,
        group.activities.map((item) => item.name),
      ]),
    ).toEqual([
      ["Deep work", ["Script"]],
      ["Body", ["Gym", "Run"]],
    ]);
  });
});
