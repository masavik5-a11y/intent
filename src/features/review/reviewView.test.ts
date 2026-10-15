import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import {
  closedLine,
  gapLabel,
  isReviewStep,
  nextDayName,
  nextStep,
  planSummary,
  previousStep,
  quickGapCategories,
  reflectionChanges,
  reflectionDraftOf,
  reviewGaps,
  reviewNotes,
  reviewOffered,
  unresolvedBlocks,
} from "./reviewView";

const WED = "2026-10-14" as DateKey;
const THU = "2026-10-15" as DateKey;
const FRI = "2026-10-16" as DateKey;
const GRID = 300; // 05:00

function block(
  title: string,
  date: DateKey,
  startMin: number,
  durationMin: number,
  extra: Partial<Doc<"blocks">> = {},
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
    ...extra,
  };
}

function entry(
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
    status: "done",
    actualStartMin: startMin,
    actualDurationMin: durationMin,
  };
}

const done = (startMin: number, durationMin: number) =>
  ({
    status: "done",
    actualStartMin: startMin,
    actualDurationMin: durationMin,
  }) as const;

describe("steps", () => {
  test("run resolve, gaps, reflect, tomorrow, then the end", () => {
    expect(nextStep("resolve")).toBe("gaps");
    expect(nextStep("gaps")).toBe("reflect");
    expect(nextStep("reflect")).toBe("tomorrow");
    expect(nextStep("tomorrow")).toBe("closed");
    expect(previousStep("resolve")).toBeNull();
    expect(previousStep("tomorrow")).toBe("reflect");
  });

  test("only known steps are read from the address", () => {
    expect(isReviewStep("gaps")).toBe(true);
    expect(isReviewStep("closed")).toBe(true);
    expect(isReviewStep("plan")).toBe(false);
    expect(isReviewStep(true)).toBe(false);
  });
});

describe("unresolvedBlocks", () => {
  const blocks = [
    // Last night's sleep, a tail at the top of Thursday: Wednesday's review.
    block("Sleep Wed", WED, 1380, 480),
    block("Gym", THU, 660, 90, done(660, 90)),
    block("Lunch", THU, 780, 60),
    block("Skipped", THU, 900, 30, { status: "skipped" }),
    block("Write", THU, 540, 90),
    block("Read", THU, 1320, 30), // 22:00, still ahead at 21:00
    block("Sleep Thu", THU, 1380, 480),
  ];

  test("the day's started blocks still planned, in the order of the day", () => {
    expect(
      unresolvedBlocks(blocks, THU, GRID, { date: THU, minute: 1260 }).map(
        (item) => item.title,
      ),
    ).toEqual(["Write", "Lunch"]);
  });

  test("looking back at a day that is over, everything unmarked", () => {
    expect(
      unresolvedBlocks(blocks, THU, GRID, { date: FRI, minute: 600 }).map(
        (item) => item.title,
      ),
    ).toEqual(["Write", "Lunch", "Read", "Sleep Thu"]);
  });
});

describe("reviewGaps", () => {
  test("untracked stretches of 30 minutes or more before now", () => {
    const blocks = [
      block("Sleep Wed", WED, 1380, 480, done(1380, 480)), // to Thu 07:00
      block("Write", THU, 540, 90, done(540, 90)), // 09:00–10:30
      entry("Phone", THU, 650, 20), // 10:50–11:10
    ];
    // 05:00–07:00 is covered by the sleep; 07:00–09:00 is open; 10:30–10:50 is too
    // short; 11:10 until 13:02 is open, cut to 13:00.
    const gaps = reviewGaps(blocks, THU, GRID, { date: THU, minute: 782 });
    expect(gaps).toEqual([
      {
        key: `${THU}-420`,
        start: { date: THU, minute: 420 },
        durationMin: 120,
      },
      {
        key: `${THU}-670`,
        start: { date: THU, minute: 670 },
        durationMin: 110,
      },
    ]);
    expect(gaps.map(gapLabel)).toEqual([
      "07:00–09:00 · 2h",
      "11:10–13:00 · 1h 50m",
    ]);
  });

  test("the running block's bar counts as covered", () => {
    const blocks = [block("Write", THU, 300, 600)]; // 05:00–15:00, running
    expect(reviewGaps(blocks, THU, GRID, { date: THU, minute: 720 })).toEqual(
      [],
    );
  });

  test("on a day that is over, the whole grid, a gap after midnight on its own day", () => {
    const blocks = [block("Day", THU, 300, 1140, done(300, 1140))]; // to 00:00
    expect(reviewGaps(blocks, THU, GRID, { date: FRI, minute: 900 })).toEqual([
      { key: `${FRI}-0`, start: { date: FRI, minute: 0 }, durationMin: 300 },
    ]);
  });

  test("a day still to come has none", () => {
    expect(reviewGaps([], FRI, GRID, { date: THU, minute: 900 })).toEqual([]);
  });
});

describe("reviewOffered", () => {
  const sleepMin = 1380; // 23:00
  const blocks = [block("Gym", THU, 660, 90), block("Read", THU, 1140, 60)];

  test("from the end of the last planned block, when that comes first", () => {
    const at = (minute: number) =>
      reviewOffered({
        blocks,
        date: THU,
        gridStartMin: GRID,
        sleepMin,
        now: { date: THU, minute },
      });
    expect(at(1199)).toBe(false);
    expect(at(1200)).toBe(true); // Read ends at 20:00
    expect(at(1400)).toBe(true);
  });

  test("from two hours before sleep, when that comes first", () => {
    const late = [block("Edit", THU, 1200, 150)]; // to 22:30
    const at = (date: DateKey, minute: number) =>
      reviewOffered({
        blocks: late,
        date: THU,
        gridStartMin: GRID,
        sleepMin,
        now: { date, minute },
      });
    expect(at(THU, 1259)).toBe(false);
    expect(at(THU, 1260)).toBe(true); // 21:00
    // Still offered after midnight, until the grid moves on.
    expect(at(FRI, 60)).toBe(true);
  });

  test("a sleep time after midnight counts on the same grid", () => {
    expect(
      reviewOffered({
        blocks: [],
        date: THU,
        gridStartMin: GRID,
        sleepMin: 30, // 00:30, so from 22:30
        now: { date: THU, minute: 1349 },
      }),
    ).toBe(false);
    expect(
      reviewOffered({
        blocks: [],
        date: THU,
        gridStartMin: GRID,
        sleepMin: 30,
        now: { date: THU, minute: 1350 },
      }),
    ).toBe(true);
  });

  test("the sleep block itself does not hold the offer back", () => {
    const withSleep = [...blocks, block("Sleep", THU, 1380, 480)];
    expect(
      reviewOffered({
        blocks: withSleep,
        date: THU,
        gridStartMin: GRID,
        sleepMin,
        now: { date: THU, minute: 1260 },
      }),
    ).toBe(true);
  });
});

describe("words", () => {
  test("the end of the review", () => {
    expect(
      closedLine({
        onPurposeMin: 310,
        driftMin: 50,
        maintenanceMin: 120,
        untrackedMin: 30,
      }),
    ).toBe("Day closed. 5h 10m on purpose, 50m drift.");
  });

  test("what tomorrow holds so far, leaving out tonight's tail", () => {
    const blocks = [
      block("Sleep", THU, 1380, 480),
      block("Gym", FRI, 660, 90),
      block("Write", FRI, 540, 120),
    ];
    expect(planSummary(blocks, FRI, GRID)).toBe(
      "2 blocks planned, the first at 09:00.",
    );
    expect(planSummary([block("Gym", FRI, 660, 90)], FRI, GRID)).toBe(
      "1 block planned, the first at 11:00.",
    );
    expect(planSummary([block("Sleep", THU, 1380, 480)], FRI, GRID)).toBe(
      "Nothing planned yet.",
    );
  });

  test("a past day's review notes, answers first, then the scores", () => {
    const day: Doc<"days"> = {
      _id: "d" as Id<"days">,
      _creationTime: 0,
      userId: "u" as Id<"users">,
      date: THU,
      wentWell: "The hook.",
      changeTomorrow: "Phone away after lunch.",
      rating: 4,
      energy: 3,
    };
    expect(reviewNotes(day)).toEqual([
      { label: "Went well", text: "The hook." },
      { label: "One change for tomorrow", text: "Phone away after lunch." },
      { label: "", text: "Day 4 of 5 · Energy 3 of 5" },
    ]);
    expect(reviewNotes(null)).toEqual([]);
    expect(
      reviewNotes({
        ...day,
        wentWell: undefined,
        changeTomorrow: undefined,
        rating: undefined,
      }),
    ).toEqual([{ label: "", text: "Energy 3 of 5" }]);
  });
});

describe("the reflection", () => {
  const day: Doc<"days"> = {
    _id: "d" as Id<"days">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date: THU,
    wentWell: "The hook.",
    rating: 4,
  };

  test("opens with what was saved", () => {
    expect(reflectionDraftOf(day)).toEqual({
      wentWell: "The hook.",
      drifted: "",
      changeTomorrow: "",
      rating: 4,
      energy: null,
    });
    expect(reflectionDraftOf(null).wentWell).toBe("");
  });

  test("saves only what changed, emptied text and a taken-back score as null", () => {
    expect(
      reflectionChanges(day, {
        wentWell: "",
        drifted: "Phone after lunch.",
        changeTomorrow: "   ",
        rating: null,
        energy: 3,
      }),
    ).toEqual({
      wentWell: null,
      drifted: "Phone after lunch.",
      rating: null,
      energy: 3,
    });
    expect(reflectionChanges(day, reflectionDraftOf(day))).toEqual({});
  });
});

describe("nextDayName", () => {
  test("names the day planning hands over to", () => {
    expect(nextDayName(FRI, THU)).toBe("tomorrow");
    expect(nextDayName(THU, THU)).toBe("today");
    expect(nextDayName(FRI, WED)).toBe("Fri 16 Oct");
  });
});

describe("quickGapCategories", () => {
  const category = (
    name: string,
    kind: Doc<"categories">["kind"],
    sortOrder: number,
    archived = false,
  ): Doc<"categories"> => ({
    _id: name as Id<"categories">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    name,
    kind,
    colorKey: "gray",
    icon: "house",
    sortOrder,
    archived,
  });

  test("drift first, then rest; the others wait behind one more tap", () => {
    const categories = [
      category("Deep work", "intentional", 0),
      category("Rest on purpose", "intentional", 3),
      category("Life", "maintenance", 5),
      category("Drift", "drift", 7),
      category("Old drift", "drift", 8, true),
    ];
    expect(quickGapCategories(categories).map((item) => item.name)).toEqual([
      "Drift",
      "Rest on purpose",
    ]);
  });

  test("without a rest category, drift alone", () => {
    expect(
      quickGapCategories([
        category("Restaurant", "maintenance", 0),
        category("Interest", "intentional", 1),
        category("Drift", "drift", 2),
      ]).map((item) => item.name),
    ).toEqual(["Drift"]);
  });
});
