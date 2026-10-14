import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id, PlannedBlockDoc } from "@/lib/api";
import {
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
