import { describe, expect, test } from "vitest";
import type { BlockShape } from "./blocks";
import type { CategoryKind } from "./categories";
import { summarizeDay } from "./summary";
import type { DateKey, LocalMoment } from "./time";

const MON = "2026-10-12" as DateKey;
const TUE = "2026-10-13" as DateKey;
const WED = "2026-10-14" as DateKey;
const GRID_START = 300; // 05:00

const KINDS: Record<string, CategoryKind> = {
  deep: "intentional",
  drift: "drift",
  life: "maintenance",
  sleep: "maintenance",
};
const kindOf = (categoryId: string) => KINDS[categoryId];

type Block = BlockShape & { _id: string; categoryId: string };

function at(date: DateKey, time: string): LocalMoment {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  return { date, minute: hours * 60 + mins };
}

function minutes(time: string): number {
  return at(TUE, time).minute;
}

function done(
  id: string,
  categoryId: string,
  start: string,
  length: number,
  date = TUE,
): Block {
  return {
    _id: id,
    categoryId,
    date,
    status: "done",
    plannedStartMin: minutes(start),
    plannedDurationMin: length,
    actualStartMin: minutes(start),
    actualDurationMin: length,
  };
}

function planned(
  id: string,
  categoryId: string,
  start: string,
  length: number,
): Block {
  return {
    _id: id,
    categoryId,
    date: TUE,
    status: "planned",
    plannedStartMin: minutes(start),
    plannedDurationMin: length,
  };
}

const unplannedDrift: Block = {
  _id: "phone",
  categoryId: "drift",
  date: TUE,
  status: "done",
  actualStartMin: minutes("11:00"),
  actualDurationMin: 45,
};

describe("summarizeDay (PRD T8, section 7 rules 8 and 9)", () => {
  const day = [
    done("write", "deep", "09:00", 120),
    unplannedDrift,
    done("lunch", "life", "12:00", 30),
    planned("read", "deep", "13:30", 90), // running at 14:00
  ];

  test("on purpose, drift, maintenance and untracked at 14:00", () => {
    expect(
      summarizeDay(day, kindOf, TUE, GRID_START, at(TUE, "14:00")),
    ).toEqual({
      onPurposeMin: 120 + 30, // write, and read so far
      driftMin: 45,
      maintenanceMin: 30,
      // 05:00 to 14:00 is 540 minutes; 225 of them are covered.
      untrackedMin: 540 - 225,
    });
  });

  test("untracked time counts up with the clock, the running block with it", () => {
    const later = summarizeDay(day, kindOf, TUE, GRID_START, at(TUE, "14:01"));
    expect(later.onPurposeMin).toBe(151);
    expect(later.untrackedMin).toBe(540 - 225);

    const block = [done("write", "deep", "09:00", 60)];
    expect(
      summarizeDay(block, kindOf, TUE, GRID_START, at(TUE, "10:07"))
        .untrackedMin,
    ).toBe(240 + 7);
  });

  test("last night's sleep counts in the morning it ran into", () => {
    const sleep = done("sleep", "sleep", "23:00", 480, MON); // to Tue 07:00
    const totals = summarizeDay(
      [sleep],
      kindOf,
      TUE,
      GRID_START,
      at(TUE, "08:00"),
    );
    expect(totals.maintenanceMin).toBe(120); // 05:00–07:00
    expect(totals.untrackedMin).toBe(60); // 07:00–08:00
  });

  test("tonight's sleep counts up to the grid's end, the rest tomorrow", () => {
    const sleep = done("sleep", "sleep", "23:00", 480); // to Wed 07:00
    const tue = summarizeDay(
      [sleep],
      kindOf,
      TUE,
      GRID_START,
      at(WED, "12:00"),
    );
    expect(tue.maintenanceMin).toBe(360); // 23:00–05:00
    const wed = summarizeDay(
      [sleep],
      kindOf,
      WED,
      GRID_START,
      at(WED, "12:00"),
    );
    expect(wed.maintenanceMin).toBe(120);
  });

  test("a skipped or unmarked block is untracked time, not drift", () => {
    const blocks: Block[] = [
      { ...planned("gym", "deep", "11:00", 90), status: "skipped" },
      planned("write", "deep", "13:00", 60),
    ];
    expect(
      summarizeDay(blocks, kindOf, TUE, GRID_START, at(TUE, "15:00")),
    ).toEqual({
      onPurposeMin: 0,
      driftMin: 0,
      maintenanceMin: 0,
      untrackedMin: 600,
    });
  });

  test("a past day is untracked through to the grid's end", () => {
    expect(
      summarizeDay(day, kindOf, MON, GRID_START, at(TUE, "14:00")).untrackedMin,
    ).toBe(1440);
  });

  test("a future day has nothing yet, and nothing untracked", () => {
    expect(summarizeDay([], kindOf, WED, GRID_START, at(TUE, "14:00"))).toEqual(
      {
        onPurposeMin: 0,
        driftMin: 0,
        maintenanceMin: 0,
        untrackedMin: 0,
      },
    );
  });

  test("a block in an unknown category covers time but counts nowhere", () => {
    const totals = summarizeDay(
      [done("x", "gone", "05:00", 60)],
      kindOf,
      TUE,
      GRID_START,
      at(TUE, "07:00"),
    );
    expect(totals).toEqual({
      onPurposeMin: 0,
      driftMin: 0,
      maintenanceMin: 0,
      untrackedMin: 60,
    });
  });
});
