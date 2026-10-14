import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import {
  collidingBlock,
  matchActivities,
  momentOnGrid,
  overlapMessage,
  suggestedStart,
} from "./quickAddRules";

const TUE = "2026-10-13" as DateKey;
const WED = "2026-10-14" as DateKey;

function activity(name: string, archived = false): Doc<"activities"> {
  return {
    _id: name as Id<"activities">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    name,
    categoryId: "c" as Id<"categories">,
    defaultDurationMin: 60,
    notify: true,
    pressure: false,
    archived,
  };
}

function block(
  title: string,
  date: DateKey,
  startMin: number,
  durationMin: number,
): Doc<"blocks"> {
  return {
    _id: title as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date,
    title,
    categoryId: "c" as Id<"categories">,
    plannedStartMin: startMin,
    plannedDurationMin: durationMin,
    status: "planned",
  };
}

describe("matchActivities", () => {
  const library = [
    activity("Script the reel"),
    activity("Meditácia"),
    activity("Gym"),
    activity("Edit the reel"),
    activity("Reading"),
    activity("Old gym plan", true),
  ];
  const names = (typed: string) =>
    matchActivities(library, typed).map((item) => item.name);

  test("nothing typed: everything not archived, by name", () => {
    expect(names("")).toEqual([
      "Edit the reel",
      "Gym",
      "Meditácia",
      "Reading",
      "Script the reel",
    ]);
  });

  test("names that start with the text come first", () => {
    expect(names("re")).toEqual([
      "Reading",
      "Edit the reel",
      "Script the reel",
    ]);
  });

  test("ignores case, accents and surrounding spaces; never archived", () => {
    expect(names("  MEDITACIA ")).toEqual(["Meditácia"]);
    expect(names("gym")).toEqual(["Gym"]);
  });

  test("no match: nothing", () => {
    expect(names("swim")).toEqual([]);
  });
});

describe("momentOnGrid", () => {
  test.each([
    [540, { date: TUE, minute: 540 }], // 09:00
    [300, { date: TUE, minute: 300 }], // 05:00, the grid's first minute
    [1435, { date: TUE, minute: 1435 }],
    [60, { date: WED, minute: 60 }], // 01:00 is next calendar day's, at the bottom
    [295, { date: WED, minute: 295 }],
  ])("%d on Tuesday's 05:00 grid is %o", (minute, moment) => {
    expect(momentOnGrid(TUE, 300, minute)).toEqual(moment);
  });

  test("with a midnight grid start every time is the day itself", () => {
    expect(momentOnGrid(TUE, 0, 60)).toEqual({ date: TUE, minute: 60 });
  });
});

describe("suggestedStart", () => {
  const blocks = [
    block("Sleep", "2026-10-12" as DateKey, 1380, 480), // to Tue 07:00
    block("Routine", TUE, 420, 60), // 07:00 – 08:00
    block("Deep work", TUE, 480, 180), // 08:00 – 11:00
  ];
  const base = {
    day: TUE,
    gridStartMin: 300,
    wakeMin: 420,
    durationMin: 60,
    blocks,
  };

  test("another day: the wake time, moved past what is planned", () => {
    expect(
      suggestedStart({
        ...base,
        isToday: false,
        now: { date: TUE, minute: 0 },
      }),
    ).toEqual({ date: TUE, minute: 660 });
  });

  test("today: the next 5-minute mark from now", () => {
    expect(
      suggestedStart({
        ...base,
        isToday: true,
        now: { date: TUE, minute: 752 }, // 12:32
      }),
    ).toEqual({ date: TUE, minute: 755 });
  });

  test("today, during a block: when it ends", () => {
    expect(
      suggestedStart({
        ...base,
        isToday: true,
        now: { date: TUE, minute: 545 },
      }),
    ).toEqual({ date: TUE, minute: 660 });
  });

  test("today at 23:58: the next day's first minute", () => {
    expect(
      suggestedStart({
        ...base,
        blocks: [],
        isToday: true,
        now: { date: TUE, minute: 1438 },
      }),
    ).toEqual({ date: WED, minute: 0 });
  });
});

describe("collidingBlock and overlapMessage", () => {
  const blocks = [block("Lunch", TUE, 720, 60)];

  test("names the block in the way", () => {
    const hit = collidingBlock(
      { date: TUE, startMin: 750, durationMin: 60 },
      blocks,
    );
    expect(hit?.title).toBe("Lunch");
    expect(hit && overlapMessage(hit)).toBe(
      "That overlaps Lunch (12:00–13:00). Pick another time or a shorter length.",
    );
  });

  test("nothing in the way: undefined", () => {
    expect(
      collidingBlock({ date: TUE, startMin: 780, durationMin: 60 }, blocks),
    ).toBeUndefined();
  });
});
