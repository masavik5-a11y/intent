import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import { completedInWeek, weekPaces, weekReadRange } from "./paceView";

const MON = "2026-10-12" as DateKey;
const FRI = "2026-10-16" as DateKey;

function category(
  id: string,
  name: string,
  weeklyTargetMin?: number,
): Doc<"categories"> {
  return {
    _id: id as Id<"categories">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    name,
    kind: "intentional",
    colorKey: "violet",
    icon: "brain",
    sortOrder: 0,
    archived: false,
    ...(weeklyTargetMin === undefined ? {} : { weeklyTargetMin }),
  };
}

function done(
  date: string,
  categoryId: string,
  start: number,
  length: number,
): Doc<"blocks"> {
  return {
    _id: `${date}-${start}` as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date: date as DateKey,
    title: "x",
    categoryId: categoryId as Id<"categories">,
    plannedStartMin: start,
    plannedDurationMin: length,
    status: "done",
    actualStartMin: start,
    actualDurationMin: length,
  };
}

describe("completedInWeek", () => {
  test.each([
    ["this week, Friday, not reviewed", MON, FRI, false, 4],
    ["this week, Friday, reviewed", MON, FRI, true, 5],
    ["a week that is over", "2026-10-05", FRI, false, 7],
    ["a week still to come", "2026-10-19", FRI, true, 0],
  ])("%s", (_, first, today, reviewed, days) => {
    expect(completedInWeek(first as DateKey, today, 1, reviewed)).toBe(days);
  });
});

describe("weekPaces", () => {
  test("a hand count: Deep work on Friday afternoon", () => {
    // Mon to Thu: 2h a day of deep work, 8h; Friday: 1h done and 37 minutes of the
    // running block. 9h 37m of 15h, expected 15h × 4/7 = 8h 34m: ahead by 1h 5m.
    // Body: 1h 30m of 4h, expected 4h × 4/7 = 2h 17m: behind by 47m, shown as 45m;
    // 2h 30m left over 3 days is 50m a day.
    const blocks = [
      done("2026-10-12", "deep", 540, 120),
      done("2026-10-13", "deep", 540, 120),
      done("2026-10-14", "deep", 540, 120),
      done("2026-10-15", "deep", 540, 120),
      done("2026-10-16", "deep", 540, 60),
      {
        ...done("2026-10-16", "deep", 840, 120),
        status: "planned" as const,
        actualStartMin: undefined,
        actualDurationMin: undefined,
      },
      done("2026-10-14", "body", 1020, 90),
    ];
    const paces = weekPaces({
      blocks,
      categories: [
        category("deep", "Deep work", 900),
        category("body", "Body", 240),
        category("mind", "Mind"),
      ],
      first: MON,
      today: FRI,
      weekStartsOn: 1,
      gridStartMin: 300,
      now: { date: FRI, minute: 877 },
      todayReviewed: false,
    });
    expect(paces.map((item) => item.text)).toEqual([
      "Deep work 9h 37m of 15h · 3 days left · ahead by 1h 5m",
      "Body 1h 30m of 4h · 3 days left · behind by 45m · 50m a day",
    ]);
  });

  test("reads the week with a day on each side", () => {
    expect(weekReadRange(MON)).toEqual({
      from: "2026-10-11",
      to: "2026-10-19",
    });
  });
});
