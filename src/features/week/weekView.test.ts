import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import { weekColumns, weekTitle } from "./weekView";

const MON = "2026-10-12" as DateKey;
const FRI = "2026-10-16" as DateKey;

const deep: Doc<"categories"> = {
  _id: "c-deep" as Id<"categories">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Deep work",
  kind: "intentional",
  colorKey: "violet",
  icon: "brain",
  sortOrder: 0,
  archived: false,
};

function block(
  id: string,
  date: string,
  start: number,
  length: number,
  extra: Partial<Doc<"blocks">> = {},
): Doc<"blocks"> {
  return {
    _id: id as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date: date as DateKey,
    title: id,
    categoryId: deep._id,
    plannedStartMin: start,
    plannedDurationMin: length,
    status: "planned",
    ...extra,
  };
}

describe("weekColumns (PRD P6)", () => {
  const blocks = [
    block("Mon script", "2026-10-12", 540, 120, {
      status: "done",
      actualStartMin: 545,
      actualDurationMin: 115,
    }),
    block("Fri edit", "2026-10-16", 840, 120), // running at 14:20
    block("Sat run", "2026-10-17", 480, 60),
    // Sunday night's sleep reaches into next Monday: only its part before 05:00 shows.
    block("Sun sleep", "2026-10-18", 1380, 480),
  ];
  const columns = weekColumns({
    blocks,
    categories: [deep],
    activities: [],
    first: MON,
    weekStartsOn: 1,
    gridStartMin: 300,
    now: { date: FRI, minute: 860 },
    today: FRI,
  });

  test("seven days from the first weekday, labelled", () => {
    expect(columns.map((column) => column.label)).toEqual([
      "Mon 12",
      "Tue 13",
      "Wed 14",
      "Thu 15",
      "Fri 16",
      "Sat 17",
      "Sun 18",
    ]);
    expect(columns.map((column) => column.tense)).toEqual([
      "past",
      "past",
      "past",
      "past",
      "today",
      "future",
      "future",
    ]);
  });

  test("past days show both lanes; days to come only the plan", () => {
    const [monday] = columns;
    expect(monday?.plan.map((card) => card.key)).toEqual(["Mon script"]);
    expect(monday?.actual.map((card) => card.time)).toEqual(["09:05–11:00"]);
    expect(columns[5]?.plan.map((card) => card.key)).toEqual(["Sat run"]);
    expect(columns[5]?.actual).toEqual([]);
  });

  test("today has the now line and the running block's growing bar", () => {
    const friday = columns[4];
    expect(friday?.nowPosition).toBe(560);
    expect(friday?.actual.map((card) => card.state)).toEqual(["live"]);
    expect(columns[3]?.nowPosition).toBeNull();
  });

  test("a block across the week's end is cut at its grid's edge", () => {
    const sunday = columns[6];
    expect(sunday?.plan[0]).toMatchObject({
      top: 1080,
      height: 360,
      cutBottom: true,
    });
  });
});

describe("weekTitle", () => {
  const days = [MON, "2026-10-18" as DateKey];
  test("this week, or the range", () => {
    expect(weekTitle(days, FRI)).toEqual({
      title: "This week",
      range: "12–18 Oct",
    });
    expect(weekTitle(days, "2026-10-20" as DateKey)).toEqual({
      title: "12–18 Oct",
      range: "12–18 Oct",
    });
  });
});
