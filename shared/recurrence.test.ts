import { describe, expect, test } from "vitest";
import {
  datesToMaterialize,
  isValidWeekdays,
  normalizeWeekdays,
  planOccurrences,
  repeatLabel,
  ruleDates,
  ruleProblem,
  weekdayOrder,
  weekdaysLabel,
} from "./recurrence";
import type { DateKey } from "./time";

const d = (value: string) => value as DateKey;

describe("isValidWeekdays", () => {
  test.each<[number[], boolean]>([
    [[1], true],
    [[0, 1, 2, 3, 4, 5, 6], true],
    [[], false],
    [[7], false],
    [[-1], false],
    [[1.5], false],
    [[1, 1], false],
  ])("%j → %s", (weekdays, expected) => {
    expect(isValidWeekdays(weekdays)).toBe(expected);
  });

  test("normalising sorts and drops repeats and strays", () => {
    expect(normalizeWeekdays([5, 1, 3, 1, 9])).toEqual([1, 3, 5]);
  });
});

describe("ruleProblem", () => {
  const rule = {
    weekdays: [1, 3, 5],
    startDate: d("2026-10-12"),
    startMin: 660,
    durationMin: 90,
  };

  test.each<
    [string, Partial<typeof rule> & { endDate?: DateKey }, string | null]
  >([
    ["a sound rule", {}, null],
    ["an end on the start date", { endDate: d("2026-10-12") }, null],
    ["an end before the start", { endDate: d("2026-10-11") }, "INVALID_INPUT"],
    ["no weekdays", { weekdays: [] }, "INVALID_INPUT"],
    ["a start off the step", { startMin: 662 }, "INVALID_TIME"],
    ["a start past midnight", { startMin: 1440 }, "INVALID_TIME"],
    ["a length over a day", { durationMin: 1445 }, "INVALID_TIME"],
  ])("%s", (_, change, expected) => {
    expect(ruleProblem({ ...rule, ...change })).toBe(expected);
  });
});

describe("ruleDates", () => {
  test.each<[string, Parameters<typeof ruleDates>, string[]]>([
    [
      "every day across a month's end",
      [
        { weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: d("2026-10-01") },
        d("2026-10-30"),
        d("2026-11-02"),
      ],
      ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"],
    ],
    [
      "Mon, Wed, Fri only",
      [
        { weekdays: [1, 3, 5], startDate: d("2026-10-01") },
        d("2026-10-12"), // a Monday
        d("2026-10-18"),
      ],
      ["2026-10-12", "2026-10-14", "2026-10-16"],
    ],
    [
      "not before its start",
      [
        { weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: d("2026-10-15") },
        d("2026-10-13"),
        d("2026-10-16"),
      ],
      ["2026-10-15", "2026-10-16"],
    ],
    [
      "not after its end",
      [
        {
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          startDate: d("2026-10-01"),
          endDate: d("2026-10-14"),
        },
        d("2026-10-13"),
        d("2026-10-20"),
      ],
      ["2026-10-13", "2026-10-14"],
    ],
    [
      "nothing once it has ended",
      [
        { weekdays: [4], startDate: d("2026-10-01"), endDate: d("2026-10-08") },
        d("2026-10-10"),
        d("2026-10-30"),
      ],
      [],
    ],
    [
      "a leap day",
      [
        { weekdays: [2], startDate: d("2028-01-01") }, // 29 Feb 2028 is a Tuesday
        d("2028-02-27"),
        d("2028-03-01"),
      ],
      ["2028-02-29"],
    ],
    [
      "an empty range",
      [
        { weekdays: [1], startDate: d("2026-10-01") },
        d("2026-10-20"),
        d("2026-10-19"),
      ],
      [],
    ],
  ])("%s", (_, args, expected) => {
    expect(ruleDates(...args)).toEqual(expected);
  });

  test("looks at no more than two years, however far it is asked", () => {
    const dates = ruleDates(
      { weekdays: [0, 1, 2, 3, 4, 5, 6], startDate: d("2026-01-01") },
      d("2026-01-01"),
      d("2036-01-01"),
    );
    expect(dates.length).toBe(733);
  });
});

describe("datesToMaterialize", () => {
  const rule = {
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startDate: d("2026-10-01"),
    materializedThrough: d("2026-10-20"),
  };

  test("only dates after what is already materialised", () => {
    expect(datesToMaterialize(rule, d("2026-10-22"), d("2026-10-15"))).toEqual([
      "2026-10-21",
      "2026-10-22",
    ]);
  });

  test("not before the day it is told", () => {
    expect(datesToMaterialize(rule, d("2026-10-30"), d("2026-10-29"))).toEqual([
      "2026-10-29",
      "2026-10-30",
    ]);
  });

  test("nothing when it is already far enough", () => {
    expect(datesToMaterialize(rule, d("2026-10-20"), d("2026-10-15"))).toEqual(
      [],
    );
  });
});

describe("planOccurrences", () => {
  const sleep = { startMin: 1380, durationMin: 480 }; // 23:00–07:00

  test("every date, sleep crossing midnight into the next one's morning", () => {
    const plan = planOccurrences({
      rule: sleep,
      dates: [d("2026-10-15"), d("2026-10-16"), d("2026-10-17")],
      taken: new Set(),
      lane: [],
    });
    expect(plan.create.map((span) => span.date)).toEqual([
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
    ]);
    expect(plan.skipped).toEqual([]);
  });

  test("a date that already has the rule's block is left as it is", () => {
    const plan = planOccurrences({
      rule: sleep,
      dates: [d("2026-10-15"), d("2026-10-16")],
      taken: new Set(["2026-10-15"]),
      lane: [{ date: d("2026-10-15"), startMin: 1380, durationMin: 480 }],
    });
    expect(plan.create.map((span) => span.date)).toEqual(["2026-10-16"]);
    expect(plan.skipped).toEqual([]);
  });

  test("an occurrence that would overlap is not made; the block there stays", () => {
    const early = { date: d("2026-10-17"), startMin: 360, durationMin: 60 }; // Sat 06:00
    const plan = planOccurrences({
      rule: sleep,
      dates: [d("2026-10-15"), d("2026-10-16")],
      taken: new Set(),
      lane: [early],
    });
    // Friday's sleep would run into Saturday 06:00.
    expect(plan.create.map((span) => span.date)).toEqual(["2026-10-15"]);
    expect(plan.skipped).toEqual([{ date: "2026-10-16", by: early }]);
  });
});

describe("labels", () => {
  test.each<[number[], string]>([
    [[0, 1, 2, 3, 4, 5, 6], "Every day"],
    [[1, 2, 3, 4, 5], "Weekdays"],
    [[0, 6], "Weekends"],
    [[5, 1, 3], "Mon, Wed, Fri"],
    [[0, 1], "Mon, Sun"],
  ])("%j reads %s", (weekdays, expected) => {
    expect(weekdaysLabel(weekdays)).toBe(expected);
  });

  test("an end date follows the days", () => {
    expect(
      repeatLabel({
        weekdays: [1, 3, 5],
        startDate: d("2026-10-12"),
        endDate: d("2026-12-20"),
      }),
    ).toBe("Mon, Wed, Fri · until Sun 20 Dec");
  });

  test("the week starts where the settings say", () => {
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
