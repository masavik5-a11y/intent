import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id, PlannedBlockDoc } from "@/lib/api";
import {
  endedText,
  foldedLine,
  formatLeft,
  freeText,
  inLastTenMinutes,
  nextLine,
  nowView,
  statusText,
} from "./nowView";

const TUE = "2026-10-13" as DateKey;
const WED = "2026-10-14" as DateKey;

const body = {
  _id: "c-body" as Id<"categories">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Body",
  kind: "intentional",
  colorKey: "teal",
  icon: "dumbbell",
  sortOrder: 1,
  archived: false,
} satisfies Doc<"categories">;

const gym = {
  _id: "a-gym" as Id<"activities">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  name: "Gym",
  categoryId: body._id,
  defaultDurationMin: 90,
  notify: true,
  pressure: true,
  archived: false,
  why: "Energy for the camera.",
  ifThen: "I do 10 minutes and decide.",
  costOfSkipping: "Low energy, and it shows on camera.",
} satisfies Doc<"activities">;

function block(
  title: string,
  date: DateKey,
  startMin: number,
  durationMin: number,
  extra: Partial<PlannedBlockDoc> = {},
): PlannedBlockDoc {
  return {
    _id: title as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date,
    title,
    categoryId: body._id,
    plannedStartMin: startMin,
    plannedDurationMin: durationMin,
    status: "planned",
    ...extra,
  };
}

const blocks = [
  block("Gym", TUE, 660, 90, { activityId: gym._id, focus: "Push day" }), // 11:00
  block("Lunch", TUE, 780, 60), // 13:00
  block("Read", TUE, 1200, 30), // 20:00
  block("Sleep", TUE, 1380, 480), // to Wed 07:00
];

describe("nowView", () => {
  test("during a block: it, its countdown, its intent, and the next two", () => {
    const view = nowView(blocks, [gym], [body], { date: TUE, minute: 690 });
    expect(view.current?.block.title).toBe("Gym");
    expect(view.current?.activity?.name).toBe("Gym");
    expect(view.current?.category?.colorKey).toBe("teal");
    expect(view.current?.pressure).toBe(true);
    expect(view.current?.countdown).toEqual({
      minutesLeft: 60,
      fractionLeft: 60 / 90,
      minutesOver: 0,
    });
    expect(view.current?.intent).toEqual({
      doneWhen: null,
      why: "Energy for the camera.",
      how: null,
      ifThen: "I do 10 minutes and decide.",
      minimumVersion: null,
    });
    expect(view.next.map((item) => item.block.title)).toEqual([
      "Lunch",
      "Read",
    ]);
  });

  test("never carries the cost of skipping (PRD V4)", () => {
    const view = nowView(blocks, [gym], [body], { date: TUE, minute: 690 });
    expect(JSON.stringify(view.current?.intent)).not.toContain("Low energy");
    expect(view.current?.intent).not.toHaveProperty("costOfSkipping");
  });

  test("a block's own text wins over its activity's", () => {
    const own = [
      block("Gym", TUE, 660, 90, { activityId: gym._id, why: "Legs today." }),
    ];
    const view = nowView(own, [gym], [body], { date: TUE, minute: 700 });
    expect(view.current?.intent.why).toBe("Legs today.");
  });

  test("between blocks: no current block, the next ones", () => {
    const view = nowView(blocks, [gym], [body], { date: TUE, minute: 900 });
    expect(view.current).toBeNull();
    expect(view.next.map((item) => item.block.title)).toEqual([
      "Read",
      "Sleep",
    ]);
  });

  test("after midnight, last night's sleep is still running", () => {
    const view = nowView(blocks, [gym], [body], { date: WED, minute: 300 });
    expect(view.current?.block.title).toBe("Sleep");
    expect(view.current?.pressure).toBe(false);
    expect(view.current?.countdown.minutesLeft).toBe(120);
  });
});

describe("nowView with marked blocks (M2)", () => {
  test("the running block has its time so far, for Partly", () => {
    const view = nowView(blocks, [gym], [body], { date: TUE, minute: 697 });
    expect(view.current?.soFarMin).toBe(37);
  });

  test("a block marked done early stops being current", () => {
    const marked = blocks.map((item) =>
      item.title === "Gym"
        ? {
            ...item,
            status: "done" as const,
            actualStartMin: 660,
            actualDurationMin: 30,
          }
        : item,
    );
    const view = nowView(marked, [gym], [body], { date: TUE, minute: 700 });
    expect(view.current).toBeNull();
    // It is marked, so there is nothing left to mark either.
    expect(view.toMark).toBeNull();
    expect(view.next[0]?.block.title).toBe("Lunch");
  });

  test("so does a skipped one, and skipped blocks leave up next", () => {
    const skipped = blocks.map((item) =>
      item.title === "Gym" || item.title === "Lunch"
        ? { ...item, status: "skipped" as const }
        : item,
    );
    const view = nowView(skipped, [gym], [body], { date: TUE, minute: 700 });
    expect(view.current).toBeNull();
    expect(view.next.map((item) => item.block.title)).toEqual([
      "Read",
      "Sleep",
    ]);
  });

  test("between blocks, the last block that ended unmarked", () => {
    const view = nowView(blocks, [gym], [body], { date: TUE, minute: 900 });
    expect(view.toMark?.block.title).toBe("Lunch");
    expect(view.toMark && endedText(view.toMark)).toBe("Lunch ended at 14:00");
  });

  test("once it is marked, the one before it is not offered", () => {
    const marked = blocks.map((item) =>
      item.title === "Lunch" ? { ...item, status: "skipped" as const } : item,
    );
    const view = nowView(marked, [gym], [body], { date: TUE, minute: 900 });
    expect(view.toMark).toBeNull();
  });

  test("yesterday's unmarked block is not offered after last night's sleep", () => {
    const yesterday = [
      block("Read", TUE, 1200, 30), // never marked
      block("Sleep", TUE, 1380, 480, {
        status: "done",
        actualStartMin: 1380,
        actualDurationMin: 480,
      }),
      block("Work", WED, 480, 120),
    ];
    const view = nowView(yesterday, [gym], [body], { date: WED, minute: 450 });
    expect(view.current).toBeNull();
    expect(view.toMark).toBeNull();
  });

  test("nothing to mark while a block runs", () => {
    const view = nowView(blocks, [gym], [body], { date: TUE, minute: 1210 });
    expect(view.current?.block.title).toBe("Read");
    expect(view.toMark).toBeNull();
  });

  test("Not feeling it is about the running block, else the next one", () => {
    expect(
      nowView(blocks, [gym], [body], { date: TUE, minute: 700 }).feelingTarget
        ?.block.title,
    ).toBe("Gym");
    expect(
      nowView(blocks, [gym], [body], { date: TUE, minute: 900 }).feelingTarget
        ?.block.title,
    ).toBe("Read");
    expect(
      nowView([], [gym], [body], { date: TUE, minute: 900 }).feelingTarget,
    ).toBeNull();
  });

  test("in the morning, last night's sleep waits to be marked", () => {
    const view = nowView(blocks, [gym], [body], { date: WED, minute: 480 });
    expect(view.current).toBeNull();
    expect(view.toMark?.block.title).toBe("Sleep");
    expect(view.toMark && endedText(view.toMark)).toBe("Sleep ended at 07:00");
  });
});

describe("status and free text", () => {
  test.each([
    [42, "42 min"],
    [59, "59 min"],
    [60, "1h"],
    [72, "1h 12m"],
  ])("formatLeft(%d) = %s", (minutes, text) => {
    expect(formatLeft(minutes)).toBe(text);
  });

  test("the status line counts down, then says time is up", () => {
    expect(
      statusText({ minutesLeft: 42, fractionLeft: 0.5, minutesOver: 0 }),
    ).toBe("Now · 42 min left");
    expect(
      statusText({ minutesLeft: 0, fractionLeft: 0, minutesOver: 5 }),
    ).toBe("Time's up · 5 min over");
  });

  test.each([
    [11, false],
    [10, true],
    [1, true],
    [0, false],
  ])("%d minutes left is in the last ten: %s", (minutesLeft, expected) => {
    expect(
      inLastTenMinutes({ minutesLeft, fractionLeft: 0, minutesOver: 0 }),
    ).toBe(expected);
  });

  test("between blocks it names when the free time ends", () => {
    const next = {
      block: blocks[1] as PlannedBlockDoc,
      activity: undefined,
      category: body,
    };
    expect(freeText(next)).toBe("Free until 13:00");
    expect(freeText(undefined)).toBe("Nothing more planned today.");
    expect(nextLine(next)).toBe("Lunch · 13:00–14:00");
  });
});

describe("the goal chip (PRD U6)", () => {
  const goal = (
    status: Doc<"goals">["status"],
    dueDate?: DateKey,
  ): Doc<"goals"> => ({
    _id: "g-half" as Id<"goals">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    title: "Run a half marathon",
    createdOn: "2026-10-01" as DateKey,
    status,
    sortOrder: 0,
    ...(dueDate === undefined ? {} : { dueDate }),
  });
  const linked = { ...gym, goalId: "g-half" as Id<"goals"> };
  const at = { date: TUE, minute: 690 };

  test("shows the open goal with its days left, counted from the app's today", () => {
    const view = nowView(blocks, [linked], [body], at, {
      goals: [goal("active", "2026-11-21" as DateKey)],
      today: TUE,
    });
    expect(view.current?.goal).toBe("Run a half marathon · 39 days left");
  });

  test("past its date it says how many days over; without a date, just the title", () => {
    expect(
      nowView(blocks, [linked], [body], at, {
        goals: [goal("active", "2026-10-10" as DateKey)],
        today: TUE,
      }).current?.goal,
    ).toBe("Run a half marathon · 3 days over");
    expect(
      nowView(blocks, [linked], [body], at, {
        goals: [goal("active")],
        today: TUE,
      }).current?.goal,
    ).toBe("Run a half marathon");
  });

  test("a done or dropped goal, or none, shows no chip", () => {
    for (const status of ["done", "dropped"] as const) {
      expect(
        nowView(blocks, [linked], [body], at, {
          goals: [goal(status, "2026-11-21" as DateKey)],
          today: TUE,
        }).current?.goal,
      ).toBeNull();
    }
    expect(nowView(blocks, [gym], [body], at).current?.goal).toBeNull();
  });
});

describe("foldedLine (the phone's card on one line)", () => {
  test.each([
    [690, "Gym · 1h left"],
    [760, "Gym ended at 12:30"],
  ])("at minute %d: %s", (minute, line) => {
    expect(
      foldedLine(nowView(blocks, [gym], [body], { date: TUE, minute })),
    ).toBe(line);
  });

  test("between blocks with nothing to mark, the free time", () => {
    const marked = blocks.map((item) =>
      item.title === "Gym"
        ? {
            ...item,
            status: "done" as const,
            actualStartMin: 660,
            actualDurationMin: 90,
          }
        : item,
    );
    expect(
      foldedLine(nowView(marked, [gym], [body], { date: TUE, minute: 760 })),
    ).toBe("Free until 13:00");
  });
});
