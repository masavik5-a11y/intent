import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import {
  actualCardName,
  actualCardState,
  actualCardTime,
  actualLane,
  cardName,
  cardTime,
  dayTense,
  dayTitle,
  entryTitle,
  hourMarks,
  planCardState,
  planLane,
  totalsItems,
  untrackedStretches,
} from "./dayView";

const MON = "2026-10-12" as DateKey;
const TUE = "2026-10-13" as DateKey;
const WED = "2026-10-14" as DateKey;

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

/** An unplanned entry: what happened, no plan. */
function entry(
  title: string,
  date: DateKey,
  startMin: number,
  durationMin: number,
): Doc<"blocks"> {
  const {
    plannedStartMin: _start,
    plannedDurationMin: _length,
    ...rest
  } = block(title, date, 0, 5);
  return {
    ...rest,
    status: "done",
    actualStartMin: startMin,
    actualDurationMin: durationMin,
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

describe("planCardState", () => {
  const write = block("Write", TUE, 780, 60);
  const at = (minute: number) => ({ date: TUE, minute });

  test.each<[string, Doc<"blocks">, number, string]>([
    ["still to come", write, 700, "planned"],
    ["running", write, 800, "current"],
    ["over but not marked", write, 900, "planned"],
    [
      "marked done early: no longer current",
      { ...write, status: "done", actualStartMin: 780, actualDurationMin: 20 },
      800,
      "done",
    ],
    [
      "partly done",
      {
        ...write,
        status: "partial",
        actualStartMin: 780,
        actualDurationMin: 20,
      },
      900,
      "partial",
    ],
    ["skipped", { ...write, status: "skipped" }, 800, "skipped"],
  ])("%s", (_, item, minute, state) => {
    expect(planCardState(item, at(minute))).toBe(state);
  });
});

describe("actualLane", () => {
  const blocks = [
    block("Sleep", MON, 1380, 480, {
      status: "done",
      actualStartMin: 1380,
      actualDurationMin: 510, // until Tue 07:30
    }),
    block("Gym", TUE, 660, 90, {
      status: "partial",
      actualStartMin: 660,
      actualDurationMin: 45,
    }),
    entry("Phone", TUE, 750, 30),
    block("Write", TUE, 780, 60), // running at 13:20
    block("Read", TUE, 1200, 30, { status: "skipped" }),
  ];
  const now = { date: TUE, minute: 800 };
  const lane = actualLane(blocks, TUE, 300, now);

  test("what was recorded and the running block, top to bottom", () => {
    expect(
      lane.map((item) => [item.block.title, item.segment.top, item.live]),
    ).toEqual([
      ["Sleep", 0, false],
      ["Gym", 360, false],
      ["Phone", 450, false],
      ["Write", 480, true],
    ]);
    expect(lane[3]?.segment.height).toBe(20);
  });

  test("states: recorded, unplanned, and the growing bar", () => {
    expect(lane.map(actualCardState)).toEqual([
      "recorded",
      "recorded",
      "unplanned",
      "live",
    ]);
  });

  test("times: the tail, partly done, the range, since", () => {
    expect(lane.map(actualCardTime)).toEqual([
      "until 07:30",
      "45m of 1h 30m · 11:00–11:45",
      "12:30–13:00",
      "since 13:00",
    ]);
  });

  test("names for screen readers", () => {
    expect(lane.map(actualCardName)).toEqual([
      "Sleep, 23:00 to 07:30, done",
      "Gym, 11:00 to 11:45, partly done, 45m of 1h 30m",
      "Phone, 12:30 to 13:00, unplanned",
      "Write, running since 13:00",
    ]);
  });

  test("a plan card names its status", () => {
    const gym = blocks[1];
    if (gym === undefined || gym.plannedStartMin === undefined) {
      throw new Error("fixture");
    }
    const [item] = planLane([gym], TUE, 300);
    if (item === undefined) throw new Error("fixture");
    expect(cardName(item.block, item.segment, TUE)).toBe(
      "Gym, 11:00 to 12:30, partly done",
    );
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

describe("entryTitle", () => {
  const driftCategory: Doc<"categories"> = {
    _id: "c" as Id<"categories">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    name: "Drift",
    kind: "drift",
    colorKey: "red",
    icon: "cloud",
    sortOrder: 7,
    archived: false,
  };

  test("drift entries name the category first, once", () => {
    expect(entryTitle(entry("Phone", TUE, 780, 30), driftCategory)).toBe(
      "Drift · Phone",
    );
    expect(entryTitle(entry("Drift", TUE, 780, 30), driftCategory)).toBe(
      "Drift",
    );
  });

  test("other entries and planned blocks keep their title", () => {
    const body = {
      ...driftCategory,
      name: "Body",
      kind: "intentional" as const,
    };
    expect(entryTitle(entry("Run", TUE, 1080, 40), body)).toBe("Run");
    expect(entryTitle(block("Phone", TUE, 780, 30), driftCategory)).toBe(
      "Phone",
    );
  });
});

describe("untrackedStretches (PRD U4)", () => {
  const blocks = [
    block("Gym", TUE, 480, 60, {
      status: "done",
      actualStartMin: 480,
      actualDurationMin: 60,
    }),
    block("Write", TUE, 600, 120), // running from 10:00
  ];

  test("today: before now, around what was recorded and the running bar", () => {
    expect(
      untrackedStretches(blocks, TUE, 300, { date: TUE, minute: 637 }),
    ).toEqual([
      { top: 0, height: 180 }, // 05:00–08:00
      { top: 240, height: 60 }, // 09:00–10:00
    ]);
  });

  test("it grows with the clock between blocks", () => {
    const later = untrackedStretches(blocks, TUE, 300, {
      date: TUE,
      minute: 727, // Write has ended, not marked
    });
    expect(later.at(-1)).toEqual({ top: 240, height: 187 }); // 09:00–12:07
  });

  test("a past day: wherever nothing was recorded, to the grid's end", () => {
    const past = untrackedStretches(blocks, TUE, 300, {
      date: WED,
      minute: 600,
    });
    expect(past).toEqual([
      { top: 0, height: 180 },
      { top: 240, height: 1200 },
    ]);
  });

  test("a day still to come has none", () => {
    expect(
      untrackedStretches(blocks, WED, 300, { date: TUE, minute: 637 }),
    ).toEqual([]);
  });
});

describe("totalsItems", () => {
  test("on purpose, drift, untracked, in that order", () => {
    expect(
      totalsItems({
        onPurposeMin: 200,
        driftMin: 45,
        maintenanceMin: 90,
        untrackedMin: 7,
      }),
    ).toEqual([
      { label: "On purpose", value: "3h 20m" },
      { label: "Drift", value: "45m" },
      { label: "Untracked", value: "7m" },
    ]);
  });
});
