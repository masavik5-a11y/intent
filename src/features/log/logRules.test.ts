import { describe, expect, test } from "vitest";
import type { DateKey, LocalMoment } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import { defaultEntrySpan, logCategories } from "./logRules";

const MON = "2026-10-12" as DateKey;
const TUE = "2026-10-13" as DateKey;

function at(date: DateKey, time: string): LocalMoment {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  return { date, minute: hours * 60 + mins };
}

function planned(
  title: string,
  start: string,
  length: number,
  extra: Partial<Doc<"blocks">> = {},
): Doc<"blocks"> {
  return {
    _id: title as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date: TUE,
    title,
    categoryId: "c" as Id<"categories">,
    plannedStartMin: at(TUE, start).minute,
    plannedDurationMin: length,
    status: "planned",
    ...extra,
  };
}

function done(title: string, start: string, length: number, date = TUE) {
  return planned(title, start, length, {
    date,
    status: "done",
    actualStartMin: at(date, start).minute,
    actualDurationMin: length,
  });
}

const base = {
  day: TUE,
  gridStartMin: 300,
  wakeMin: 420,
  isToday: true,
  position: null,
};

describe("defaultEntrySpan", () => {
  test("today: from the last entry until now, at the 5-minute mark", () => {
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "14:07"),
        blocks: [done("Gym", "11:00", 45)],
      }),
    ).toEqual({ start: at(TUE, "11:45"), durationMin: 140 });
  });

  test("today with nothing recorded: the last half hour", () => {
    expect(
      defaultEntrySpan({ ...base, now: at(TUE, "14:07"), blocks: [] }),
    ).toEqual({ start: at(TUE, "13:35"), durationMin: 30 });
  });

  test("during a block: from where its bar starts", () => {
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "13:40"),
        blocks: [done("Gym", "11:00", 45), planned("Write", "13:00", 120)],
      }),
    ).toEqual({ start: at(TUE, "13:00"), durationMin: 40 });
  });

  test("right after the last entry: five minutes", () => {
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "11:47"),
        blocks: [done("Gym", "11:00", 45)],
      }),
    ).toEqual({ start: at(TUE, "11:45"), durationMin: 5 });
  });

  test("in the morning, after last night's sleep", () => {
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "07:32"),
        blocks: [done("Sleep", "23:00", 480, MON)],
      }),
    ).toEqual({ start: at(TUE, "07:00"), durationMin: 30 });
  });

  test("something recorded past now is not the last entry", () => {
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "14:00"),
        blocks: [done("Gym", "11:00", 60), done("Later", "15:00", 30)],
      }),
    ).toEqual({ start: at(TUE, "12:00"), durationMin: 120 });
  });

  test.each<[string, number, string, number]>([
    ["a slot in the past: half an hour", 300, "10:00", 30],
    ["…ending at the next entry", 375, "11:15", 15], // Gym from 11:30
    ["…ending now, today", 480, "13:00", 20],
  ])("from a click, %s", (_, position, start, length) => {
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "13:20"),
        blocks: [done("Gym", "11:30", 45)],
        position,
      }),
    ).toEqual({ start: at(TUE, start), durationMin: length });
  });

  test("a click just below an entry that ends off the quarter starts where it ends", () => {
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "10:40"),
        blocks: [done("Gym", "09:00", 70)], // until 10:10
        position: 312, // 10:12, floored to 10:00
      }),
    ).toEqual({ start: at(TUE, "10:10"), durationMin: 30 });
  });

  test("an entry recorded past now still counts as the last one", () => {
    // Partly 30 at 10:20 on a block from 10:00 records 10:00-10:30.
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "10:21"),
        blocks: [done("Morning", "09:00", 60), done("Gym", "10:00", 30)],
      }),
    ).toEqual({ start: at(TUE, "10:30"), durationMin: 5 });
  });

  test("a click snaps to the quarter hour", () => {
    expect(
      defaultEntrySpan({
        ...base,
        now: at(TUE, "20:00"),
        blocks: [],
        position: 307,
      }).start,
    ).toEqual(at(TUE, "10:00"));
  });

  test("another day: after its last entry, or at the wake time", () => {
    const past = { ...base, isToday: false, now: at(TUE, "20:00") };
    expect(defaultEntrySpan({ ...past, day: MON, blocks: [] })).toEqual({
      start: at(MON, "07:00"),
      durationMin: 30,
    });
    expect(
      defaultEntrySpan({
        ...past,
        day: MON,
        blocks: [done("Write", "09:00", 90, MON)],
      }),
    ).toEqual({ start: at(MON, "10:30"), durationMin: 30 });
  });
});

describe("logCategories", () => {
  function category(
    name: string,
    kind: Doc<"categories">["kind"],
    sortOrder: number,
    archived = false,
  ): Doc<"categories"> {
    return {
      _id: name as Id<"categories">,
      _creationTime: 0,
      userId: "u" as Id<"users">,
      name,
      kind,
      colorKey: "gray",
      icon: "circle",
      sortOrder,
      archived,
    };
  }

  test("Drift first, then the rest in order, without archived ones", () => {
    expect(
      logCategories([
        category("Life", "maintenance", 5),
        category("Deep work", "intentional", 0),
        category("Drift", "drift", 7),
        category("Old", "intentional", 1, true),
      ]).map((item) => item.name),
    ).toEqual(["Drift", "Deep work", "Life"]);
  });
});
