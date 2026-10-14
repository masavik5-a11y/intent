import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id, PlannedBlockDoc } from "@/lib/api";
import { notFeelingView } from "./notFeelingView";

const gymBlock: PlannedBlockDoc = {
  _id: "b" as Id<"blocks">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  date: "2026-10-13" as DateKey,
  title: "Gym",
  focus: "Push day",
  activityId: "a" as Id<"activities">,
  categoryId: "c" as Id<"categories">,
  plannedStartMin: 660,
  plannedDurationMin: 90,
  status: "planned",
};

const gym: Doc<"activities"> = {
  _id: "a" as Id<"activities">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Gym",
  categoryId: "c" as Id<"categories">,
  defaultDurationMin: 90,
  notify: true,
  pressure: false,
  archived: false,
  why: "Energy for the camera.",
  ifThen: "Then I do 10 minutes and decide.",
  minimumVersion: "20 minutes, three exercises.",
  costOfSkipping: "Low energy, and it shows on camera.",
};

const compass = {
  vision: "Mornings that start with work I chose.",
  antiVision: "Still starting on Monday.",
};

describe("notFeelingView (PRD V2, DESIGN.md 4b)", () => {
  test("the order: if-then, minimum, cost of skipping, anti-vision, vision", () => {
    const view = notFeelingView(gymBlock, gym, compass);
    expect(view.title).toBe("Gym · Push day");
    expect(view.time).toBe("11:00–12:30");
    expect(view.sections.map((section) => section.key)).toEqual([
      "ifThen",
      "minimumVersion",
      "costOfSkipping",
      "antiVision",
      "vision",
    ]);
    expect(view.sections.map((section) => section.heading)).toEqual([
      "If I don't feel like it",
      "The minimum that still counts",
      "If I keep skipping this",
      "The life I refuse to drift into",
      "The life I'm building",
    ]);
    expect(view.sections.filter((section) => section.voice)).toHaveLength(2);
    expect(view.compassEmpty).toBe(false);
  });

  test("never the why or the how: this is for the hard moment only", () => {
    const view = notFeelingView(gymBlock, gym, compass);
    expect(JSON.stringify(view)).not.toContain("Energy for the camera.");
  });

  test("a block's own text wins; parts without text are left out", () => {
    const view = notFeelingView(
      { ...gymBlock, ifThen: "Then I walk there." },
      { ...gym, minimumVersion: undefined, costOfSkipping: "  " },
      { vision: compass.vision },
    );
    expect(view.sections).toEqual([
      {
        key: "ifThen",
        heading: "If I don't feel like it",
        text: "Then I walk there.",
        voice: false,
      },
      {
        key: "vision",
        heading: "The life I'm building",
        text: compass.vision,
        voice: true,
      },
    ]);
  });

  test("an empty compass is offered for writing", () => {
    const view = notFeelingView(gymBlock, gym, null);
    expect(view.compassEmpty).toBe(true);
    expect(view.sections.map((section) => section.key)).toEqual([
      "ifThen",
      "minimumVersion",
      "costOfSkipping",
    ]);
  });
});
