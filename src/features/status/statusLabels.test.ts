import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import { SKIP_REASON_LABELS, statusLine } from "./statusLabels";

const gym: Doc<"blocks"> = {
  _id: "b" as Id<"blocks">,
  _creationTime: 0,
  userId: "u" as Id<"users">,
  date: "2026-10-13" as DateKey,
  title: "Gym",
  categoryId: "c" as Id<"categories">,
  plannedStartMin: 660,
  plannedDurationMin: 90,
  status: "planned",
};

describe("statusLine", () => {
  test.each<[string, Partial<Doc<"blocks">>, string]>([
    ["planned", {}, "Not marked yet"],
    [
      "done",
      { status: "done", actualStartMin: 660, actualDurationMin: 50 },
      "Done · 11:00–11:50",
    ],
    [
      "partly",
      { status: "partial", actualStartMin: 660, actualDurationMin: 25 },
      "Partly · 25m of 1h 30m",
    ],
    ["skipped", { status: "skipped" }, "Skipped"],
    [
      "skipped with a reason",
      { status: "skipped", skipReason: "noTime" },
      "Skipped · no time",
    ],
    [
      "done after midnight",
      { status: "done", actualStartMin: 1450, actualDurationMin: 20 },
      "Done · 00:10–00:30",
    ],
  ])("%s", (_, change, expected) => {
    expect(statusLine({ ...gym, ...change })).toBe(expected);
  });

  test("an unplanned entry reads as logged", () => {
    const {
      plannedStartMin: _start,
      plannedDurationMin: _length,
      ...entry
    } = gym;
    expect(
      statusLine({
        ...entry,
        status: "done",
        actualStartMin: 780,
        actualDurationMin: 45,
      }),
    ).toBe("Logged · 13:00–13:45");
  });

  test("the reasons never judge", () => {
    for (const label of Object.values(SKIP_REASON_LABELS)) {
      expect(label).not.toMatch(/lazy|fail|miss|excuse/i);
    }
  });
});
