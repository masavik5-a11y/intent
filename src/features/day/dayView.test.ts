import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import {
  cardName,
  cardTime,
  dayTense,
  dayTitle,
  hourMarks,
  itemAt,
  planLane,
} from "./dayView";

const MON = "2026-10-12" as DateKey;
const TUE = "2026-10-13" as DateKey;
const WED = "2026-10-14" as DateKey;

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

describe("dayTitle", () => {
  test.each([
    [TUE, TUE, "Today · Tue 13 Oct"],
    [WED, TUE, "Tomorrow · Wed 14 Oct"],
    [MON, TUE, "Yesterday · Mon 12 Oct"],
    ["2026-10-20" as DateKey, TUE, "Tue 20 Oct"],
    ["2027-01-05" as DateKey, TUE, "Tue 5 Jan 2027"],
    [
      "2026-12-31" as DateKey,
      "2027-01-01" as DateKey,
      "Yesterday · Thu 31 Dec 2026",
    ],
  ])("%s seen from %s is %j", (date, today, title) => {
    expect(dayTitle(date, today)).toBe(title);
  });
});

describe("dayTense", () => {
  test.each([
    [MON, TUE, "past"],
    [TUE, TUE, "today"],
    [WED, TUE, "future"],
    ["2025-12-31" as DateKey, TUE, "past"],
  ] as const)("%s from %s is %s", (date, today, tense) => {
    expect(dayTense(date, today)).toBe(tense);
  });
});

describe("planLane", () => {
  const lane = planLane(
    [
      block("Deep work", TUE, 540, 180), // 09:00
      block("Last night", MON, 1380, 480), // Mon 23:00 – Tue 07:00
      block("Tonight", TUE, 1410, 450), // Tue 23:30 – Wed 07:00
      block("Too early", TUE, 120, 60), // Tue 02:00: in Monday's grid
      block("Late", WED, 60, 30), // Wed 01:00: bottom of Tuesday's grid
      block("Tomorrow", WED, 540, 60), // in Wednesday's grid
    ],
    TUE,
    300,
  );

  test("holds what Tuesday's 05:00 grid shows, top to bottom", () => {
    expect(lane.map((item) => item.block.title)).toEqual([
      "Last night",
      "Deep work",
      "Tonight",
      "Late",
    ]);
  });

  test("cuts blocks at the grid's edges", () => {
    expect(lane[0]?.segment).toEqual({
      top: 0,
      height: 120,
      startsBefore: true,
      endsAfter: false,
    });
    expect(lane[2]?.segment).toEqual({
      top: 1110,
      height: 330,
      startsBefore: false,
      endsAfter: true,
    });
  });
});

describe("itemAt", () => {
  const lane = planLane([block("Deep work", TUE, 540, 180)], TUE, 300);

  test.each([
    [240, "Deep work"], // 09:00, its first minute
    [419, "Deep work"],
    [420, undefined], // 12:00, already over
    [239, undefined],
  ])("position %d is in %s", (position, title) => {
    expect(itemAt(lane, position)?.block.title).toBe(title);
  });
});

describe("hourMarks", () => {
  test("a 05:00 grid has 24 marks from 05:00", () => {
    const marks = hourMarks(300);
    expect(marks).toHaveLength(24);
    expect(marks[0]).toEqual({ position: 0, label: "05:00" });
    expect(marks[19]).toEqual({ position: 1140, label: "00:00" });
    expect(marks[23]).toEqual({ position: 1380, label: "04:00" });
  });

  test("every other hour for the phone", () => {
    const marks = hourMarks(300, 2);
    expect(marks).toHaveLength(12);
    expect(marks.map((mark) => mark.label).slice(0, 3)).toEqual([
      "05:00",
      "07:00",
      "09:00",
    ]);
  });

  test("a grid starting at half past begins at the next full hour", () => {
    expect(hourMarks(330)[0]).toEqual({ position: 30, label: "06:00" });
    expect(hourMarks(330)).toHaveLength(24);
  });
});

describe("cardTime and cardName", () => {
  const sleep = { ...block("Sleep", TUE, 1380, 480), focus: "Phone away" };
  const [tonight] = planLane([sleep], TUE, 300);
  const [tail] = planLane([sleep], WED, 300);
  const [deep] = planLane([block("Deep work", TUE, 540, 180)], TUE, 300);

  test("the head of a block across midnight shows its whole range", () => {
    expect(tonight && cardTime(tonight.block, tonight.segment)).toBe(
      "23:00–07:00",
    );
    expect(tonight && cardName(tonight.block, tonight.segment, TUE)).toBe(
      "Sleep, Phone away, 23:00 to 07:00, continues into Wed 14 Oct",
    );
  });

  test("its tail on the next day reads as the rest of it", () => {
    expect(tail && cardTime(tail.block, tail.segment)).toBe("until 07:00");
    expect(tail && cardName(tail.block, tail.segment, WED)).toBe(
      "Sleep, Phone away, 23:00 to 07:00, continues from Tue 13 Oct",
    );
  });

  test("a block inside the day is just its range", () => {
    expect(deep && cardTime(deep.block, deep.segment)).toBe("09:00–12:00");
    expect(deep && cardName(deep.block, deep.segment, TUE)).toBe(
      "Deep work, 09:00 to 12:00",
    );
  });
});
