import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "./api";
import { collidingBlock, overlapMessage } from "./blockOverlap";

const TUE = "2026-10-13" as DateKey;

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

  test("a block does not collide with itself", () => {
    expect(
      collidingBlock(
        {
          id: "Lunch" as Id<"blocks">,
          date: TUE,
          startMin: 750,
          durationMin: 60,
        },
        blocks,
      ),
    ).toBeUndefined();
  });

  test("nothing in the way: undefined", () => {
    expect(
      collidingBlock({ date: TUE, startMin: 780, durationMin: 60 }, blocks),
    ).toBeUndefined();
  });
});
