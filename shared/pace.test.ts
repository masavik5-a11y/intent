import { describe, expect, test } from "vitest";
import {
  completedDays,
  countdown,
  daysLeft,
  daysLeftText,
  paceText,
  weekDays,
  weekProgress,
  weeklyPace,
  weekStart,
} from "./pace";
import { parseDateKey, type DateKey } from "./time";

function key(value: string): DateKey {
  const parsed = parseDateKey(value);
  if (parsed === null) throw new Error(`Bad DateKey in test: ${value}`);
  return parsed;
}

const TUE = key("2026-10-13");
const WED = key("2026-10-14");
const deepWork = { date: TUE, startMin: 540, durationMin: 120 }; // 09:00 – 11:00

describe("countdown", () => {
  test.each([
    [540, 120, 1, 0], // the first minute: all of it left
    [570, 90, 0.75, 0],
    [600, 60, 0.5, 0],
    [650, 10, 10 / 120, 0], // the last ten minutes
    [659, 1, 1 / 120, 0],
    [660, 0, 0, 0], // the end
    [665, 0, 0, 5], // five minutes over
    [500, 120, 1, 0], // before it starts: nothing used yet
  ])(
    "at minute %d: %d left, fraction %d, %d over",
    (minute, left, fraction, over) => {
      expect(countdown(deepWork, { date: TUE, minute })).toEqual({
        minutesLeft: left,
        fractionLeft: fraction,
        minutesOver: over,
      });
    },
  );

  test("a block across midnight counts down into the next day", () => {
    const sleep = { date: TUE, startMin: 1380, durationMin: 480 }; // to Wed 07:00
    expect(countdown(sleep, { date: TUE, minute: 1410 })).toMatchObject({
      minutesLeft: 450,
    });
    expect(countdown(sleep, { date: WED, minute: 360 })).toMatchObject({
      minutesLeft: 60,
      fractionLeft: 60 / 480,
    });
    expect(countdown(sleep, { date: WED, minute: 430 })).toMatchObject({
      minutesLeft: 0,
      minutesOver: 10,
    });
  });
});

describe("weekStart and weekDays", () => {
  test.each([
    ["2026-10-16", 1, "2026-10-12"], // Friday, weeks from Monday
    ["2026-10-12", 1, "2026-10-12"], // Monday is its own start
    ["2026-10-18", 1, "2026-10-12"], // Sunday is the last day
    ["2026-10-16", 0, "2026-10-11"], // weeks from Sunday
    ["2026-10-11", 0, "2026-10-11"],
    ["2026-10-16", 6, "2026-10-10"], // weeks from Saturday
    ["2026-01-01", 1, "2025-12-29"], // across a year
  ])("%s with weeks from %d starts on %s", (date, start, first) => {
    expect(weekStart(key(date), start)).toBe(first);
  });

  test("seven days in order", () => {
    expect(weekDays(key("2026-10-16"), 1)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
  });
});

describe("completedDays (pace rule 2)", () => {
  test.each([
    ["2026-10-12", false, 0], // Monday morning: nothing behind yet
    ["2026-10-12", true, 1], // Monday, reviewed
    ["2026-10-16", false, 4], // Friday
    ["2026-10-16", true, 5],
    ["2026-10-18", false, 6],
    ["2026-10-18", true, 7], // Sunday, reviewed: the week is closed
  ])("%s, reviewed %s: %d", (today, reviewed, days) => {
    expect(completedDays(key(today), 1, reviewed)).toBe(days);
  });
});

describe("weeklyPace (pace rules 2 and 3)", () => {
  test.each<
    [string, number, number, number, Partial<ReturnType<typeof weeklyPace>>]
  >([
    [
      "Monday morning with nothing yet is on pace",
      900,
      0,
      0,
      { expectedMin: 0, daysLeft: 7, state: "onPace", differenceMin: 0 },
    ],
    [
      "Friday, 9h of 15h, ahead of 8h 34m",
      900,
      540,
      4,
      { expectedMin: 514, daysLeft: 3, state: "ahead", differenceMin: 25 },
    ],
    [
      "Friday, 7h of 15h, behind, 2h 40m a day to reach it",
      900,
      420,
      4,
      {
        expectedMin: 514,
        daysLeft: 3,
        state: "behind",
        differenceMin: -95,
        perDayMin: 160,
      },
    ],
    [
      "within five minutes of expected is on pace",
      900,
      512,
      4,
      { state: "onPace", differenceMin: 0 },
    ],
    [
      "the target reached says so, whatever the day",
      900,
      930,
      2,
      { state: "reached", perDayMin: null },
    ],
    [
      "a closed week behind has no days left and no per-day figure",
      900,
      600,
      7,
      { daysLeft: 0, state: "behind", differenceMin: -300, perDayMin: null },
    ],
    [
      "the per-day figure rounds up to 5 minutes",
      600,
      0,
      6,
      { daysLeft: 1, state: "behind", perDayMin: 600 },
    ],
  ])("%s", (_, target, progress, completed, expected) => {
    expect(weeklyPace(target, progress, completed)).toMatchObject(expected);
  });
});

describe("paceText", () => {
  test.each([
    [900, 540, 4, "Deep work 9h of 15h · 3 days left · ahead by 25m"],
    [
      900,
      420,
      4,
      "Deep work 7h of 15h · 3 days left · behind by 1h 35m · 2h 40m a day",
    ],
    [900, 0, 0, "Deep work 0m of 15h · 7 days left · on pace"],
    [900, 950, 6, "Deep work 15h 50m of 15h · 1 day left · target reached"],
    [900, 600, 7, "Deep work 10h of 15h · week closed · behind by 5h"],
  ])(
    "%d target, %d done, %d days completed",
    (target, progress, days, text) => {
      expect(paceText("Deep work", weeklyPace(target, progress, days))).toBe(
        text,
      );
    },
  );

  test("never says anything but the facts", () => {
    const text = paceText("Deep work", weeklyPace(900, 0, 6));
    expect(text).not.toMatch(/!|falling|hurry|fail/i);
  });
});

describe("weekProgress (pace rule 1)", () => {
  const MON = key("2026-10-12");
  const SUN_BEFORE = key("2026-10-11");
  const SUN = key("2026-10-18");
  type B = {
    _id: string;
    categoryId: string;
    date: DateKey;
    status: "planned" | "done" | "partial" | "skipped";
    plannedStartMin?: number;
    plannedDurationMin?: number;
    actualStartMin?: number;
    actualDurationMin?: number;
  };
  const done = (
    id: string,
    categoryId: string,
    date: DateKey,
    start: number,
    length: number,
  ): B => ({
    _id: id,
    categoryId,
    date,
    status: "done",
    plannedStartMin: start,
    plannedDurationMin: length,
    actualStartMin: start,
    actualDurationMin: length,
  });

  test("counts each category's actual minutes inside the week's grids", () => {
    const blocks: B[] = [
      done("a", "deep", MON, 540, 120),
      done("b", "deep", key("2026-10-15"), 540, 90),
      done("c", "body", key("2026-10-14"), 1020, 90),
      // Last week's Sunday until 07:00 Monday: only Monday 05:00–07:00 is this week.
      done("d", "sleep", SUN_BEFORE, 1380, 480),
      // This Sunday from 23:00 until 07:00: only up to Monday 05:00 is this week.
      done("e", "sleep", SUN, 1380, 480),
      // Next week: not counted.
      done("f", "deep", key("2026-10-19"), 540, 60),
      // Skipped and planned blocks have nothing in the actual lane.
      {
        _id: "g",
        categoryId: "deep",
        date: key("2026-10-13"),
        status: "skipped",
        plannedStartMin: 540,
        plannedDurationMin: 120,
      },
    ];
    const progress = weekProgress(blocks, MON, 300, {
      date: key("2026-10-20"),
      minute: 600,
    });
    expect(progress.get("deep")).toBe(210);
    expect(progress.get("body")).toBe(90);
    expect(progress.get("sleep")).toBe(120 + 360);
  });

  test("the running block counts up to now", () => {
    const blocks: B[] = [
      {
        _id: "run",
        categoryId: "deep",
        date: key("2026-10-16"),
        status: "planned",
        plannedStartMin: 840,
        plannedDurationMin: 120,
      },
    ];
    const progress = weekProgress(blocks, MON, 300, {
      date: key("2026-10-16"),
      minute: 877,
    });
    expect(progress.get("deep")).toBe(37);
  });
});

describe("daysLeft and daysLeftText (pace rule 4)", () => {
  test.each([
    ["2026-11-21", "2026-10-14", 38, "38 days left"],
    ["2026-10-15", "2026-10-14", 1, "1 day left"],
    ["2026-10-14", "2026-10-14", 0, "due today"],
    ["2026-10-13", "2026-10-14", -1, "1 day over"],
    ["2026-10-11", "2026-10-14", -3, "3 days over"],
    ["2027-01-02", "2026-12-30", 3, "3 days left"],
  ])("due %s, today %s: %d", (due, today, days, text) => {
    expect(daysLeft(key(due), key(today))).toBe(days);
    expect(daysLeftText(days)).toBe(text);
  });
});
