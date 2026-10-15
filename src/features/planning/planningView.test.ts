import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import {
  copyPreview,
  copyResultLine,
  copySources,
  focusPrompt,
  planTitle,
} from "./planningView";

const THU = "2026-10-15" as DateKey;
const FRI = "2026-10-16" as DateKey;
const SAT = "2026-10-17" as DateKey;

function block(
  title: string,
  date: DateKey,
  start: number,
  length: number,
  extra: Partial<Doc<"blocks">> = {},
): Doc<"blocks"> {
  return {
    _id: title as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date,
    title,
    categoryId: "c" as Id<"categories">,
    plannedStartMin: start,
    plannedDurationMin: length,
    status: "planned",
    ...extra,
  };
}

describe("titles", () => {
  test("name the day being planned", () => {
    expect(planTitle(FRI, THU)).toBe("Plan tomorrow");
    expect(planTitle(THU, THU)).toBe("Plan today");
    expect(planTitle(SAT, THU)).toBe("Plan Sat 17 Oct");
    expect(focusPrompt(FRI, THU)).toBe("What makes tomorrow a win?");
    expect(focusPrompt(THU, THU)).toBe("What makes today a win?");
  });
});

describe("copySources", () => {
  test("today, and the same weekday a week before", () => {
    expect(copySources(FRI, THU)).toEqual([
      { label: "Today", date: THU },
      { label: "Last Fri", date: "2026-10-09" },
    ]);
  });

  test("planning today offers only last week's", () => {
    expect(copySources(THU, THU)).toEqual([
      { label: "Last Thu", date: "2026-10-08" },
    ]);
  });
});

describe("copyPreview", () => {
  test("counts what would come, and says why repeating blocks stay out", () => {
    const blocks = [
      block("Write", THU, 540, 120),
      block("Gym", THU, 690, 90, { recurrenceId: "r" as Id<"recurrences"> }),
      block("Read", THU, 1200, 30),
    ];
    expect(copyPreview(blocks, THU, 300)).toBe(
      "2 blocks to copy from Thu 15 Oct. 1 repeating block stays out; it comes by itself.",
    );
    expect(copyPreview(blocks.slice(0, 1), THU, 300)).toBe(
      "1 block to copy from Thu 15 Oct.",
    );
    expect(copyPreview([], THU, 300)).toBe("Nothing to copy from Thu 15 Oct.");
  });
});

describe("copyResultLine", () => {
  test("what was copied, then what did not fit", () => {
    expect(copyResultLine({ copied: 3, skipped: [] })).toBe("Copied 3 blocks.");
    expect(
      copyResultLine({
        copied: 1,
        skipped: [
          { title: "Gym", startMin: 690 },
          { title: "Edit", startMin: 840 },
        ],
      }),
    ).toBe("Copied 1 block. 2 blocks didn't fit: Gym at 11:30, Edit at 14:00.");
    expect(copyResultLine({ copied: 0, skipped: [] })).toBe(
      "Nothing was copied.",
    );
  });
});
