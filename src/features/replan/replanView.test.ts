import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import { previewShift, shiftLabel } from "./replanView";

const FRI = "2026-10-16" as DateKey;
const SAT = "2026-10-17" as DateKey;
const NOW = { date: FRI, minute: 860 };

function block(
  title: string,
  date: DateKey,
  start: number,
  length: number,
): Doc<"blocks"> {
  return {
    _id: title as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date,
    title,
    categoryId: "c" as Id<"categories">,
    plannedStartMin: start,
    plannedDurationMin: length,
    status: "planned",
  };
}

describe("shift words (PRD T11)", () => {
  test.each([
    [15, "+15m"],
    [60, "+1h"],
    [-15, "−15m"],
  ])("%d is %s", (minutes, label) => {
    expect(shiftLabel(minutes)).toBe(label);
  });

  test("what moves, and where to", () => {
    const blocks = [
      block("Gym", FRI, 1020, 90),
      block("Dinner", FRI, 1140, 45),
    ];
    expect(previewShift(blocks, [], FRI, 300, NOW, 30)).toEqual({
      text: "2 blocks move 30m later: Gym 17:30, Dinner 19:30.",
      canShift: true,
    });
  });

  test("what is in the way, and that nothing moves", () => {
    const blocks = [
      block("Sleep", FRI, 1380, 480),
      block("Meditation", SAT, 420, 20),
    ];
    expect(previewShift(blocks, [], FRI, 300, NOW, 30)).toEqual({
      text: "Sleep would run into Meditation (07:00–07:20). Nothing moves.",
      canShift: false,
    });
    expect(previewShift([], [], FRI, 300, NOW, 30)).toEqual({
      text: "Nothing left to shift today.",
      canShift: false,
    });
  });
});

describe("sleep stays put in a shift", () => {
  test("the evening moves, sleep does not", () => {
    const sleepCategory: Doc<"categories"> = {
      _id: "c-sleep" as Id<"categories">,
      _creationTime: 0,
      userId: "u" as Id<"users">,
      name: "Sleep",
      kind: "maintenance",
      colorKey: "slate",
      icon: "moon",
      sortOrder: 6,
      archived: false,
    };
    const blocks = [
      block("Gym", FRI, 1020, 90),
      { ...block("Sleep", FRI, 1380, 480), categoryId: sleepCategory._id },
      block("Meditation", SAT, 420, 20),
    ];
    expect(previewShift(blocks, [sleepCategory], FRI, 300, NOW, 30)).toEqual({
      text: "1 block moves 30m later: Gym 17:30.",
      canShift: true,
    });
  });
});
