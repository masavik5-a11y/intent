import { describe, expect, test } from "vitest";
import type { BlockTimes } from "./blocks";
import { copyablePlan, ruleBlockCount, shiftedPlan } from "./planning";
import type { DateKey } from "./time";

const WED = "2026-10-14" as DateKey;
const THU = "2026-10-15" as DateKey;
const FRI = "2026-10-16" as DateKey;
const SAT = "2026-10-17" as DateKey;
const GRID = 300;

type Block = BlockTimes & { _id: string; recurrenceId?: string };

function block(
  _id: string,
  date: DateKey,
  start: number,
  length: number,
  extra: Partial<Block> = {},
): Block {
  return {
    _id,
    date,
    status: "planned",
    plannedStartMin: start,
    plannedDurationMin: length,
    ...extra,
  };
}

describe("copyablePlan", () => {
  const blocks: Block[] = [
    block("wed-sleep", WED, 1380, 480), // a tail at the top of Thursday
    block("write", THU, 540, 120),
    block("gym", THU, 690, 90, { recurrenceId: "r-gym" }),
    block("early", THU, 240, 30), // 04:00, in Wednesday's grid
    block("late", FRI, 60, 60), // Fri 01:00, at the bottom of Thursday
    block("lunch", THU, 780, 45, {
      status: "done",
      actualStartMin: 780,
      actualDurationMin: 45,
    }),
    {
      _id: "phone",
      date: THU,
      status: "done",
      actualStartMin: 960,
      actualDurationMin: 40,
    },
  ];

  test("the day's plan as its grid shows it, leaving out a rule's blocks", () => {
    expect(copyablePlan(blocks, THU, GRID).map((item) => item._id)).toEqual([
      "write",
      "lunch",
      "late",
    ]);
    expect(ruleBlockCount(blocks, THU, GRID)).toBe(1);
  });

  test("moves to the same clock time on the new day, after midnight included", () => {
    const [write, , late] = copyablePlan(blocks, THU, GRID);
    if (write === undefined || late === undefined) throw new Error("missing");
    expect(shiftedPlan(write, THU, SAT)).toEqual({
      date: SAT,
      startMin: 540,
      durationMin: 120,
    });
    expect(shiftedPlan(late, THU, SAT)).toEqual({
      date: "2026-10-18",
      startMin: 60,
      durationMin: 60,
    });
    // Backwards works the same way.
    expect(shiftedPlan(write, THU, WED).date).toBe(WED);
  });
});
