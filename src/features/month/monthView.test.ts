import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import {
  addMonths,
  monthDays,
  monthLabels,
  monthStart,
  shownLabels,
} from "./monthView";

const k = (value: string) => value as DateKey;

describe("the month's calendar (PRD P7)", () => {
  test("six weeks from the week holding the 1st", () => {
    const days = monthDays(k("2026-10-16"), 1);
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-09-28"); // the Monday before Thu 1 Oct
    expect(days[41]).toBe("2026-11-08");
    // A wedding three weeks from 16 Oct is already on October's calendar.
    expect(days).toContain("2026-11-06");
  });

  test("weeks from Sunday", () => {
    expect(monthDays(k("2026-10-16"), 0)[0]).toBe("2026-09-27");
  });

  test.each([
    ["2026-10-16", 1, "2026-11-16"],
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-01-15", -1, "2025-12-15"],
    ["2026-03-31", -1, "2026-02-28"],
  ])("%s plus %d month: %s", (date, months, result) => {
    expect(addMonths(k(date), months)).toBe(result);
  });

  test("the month starts on its 1st", () => {
    expect(monthStart(k("2026-10-16"))).toBe("2026-10-01");
  });
});

describe("monthLabels", () => {
  const events: Doc<"categories"> = {
    _id: "c-events" as Id<"categories">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    name: "Events",
    kind: "intentional",
    colorKey: "amber",
    icon: "party-popper",
    sortOrder: 4,
    archived: false,
  };
  const block = (
    id: string,
    date: string,
    start: number,
    extra: Partial<Doc<"blocks">> = {},
  ): Doc<"blocks"> => ({
    _id: id as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date: k(date),
    title: id,
    categoryId: events._id,
    plannedStartMin: start,
    plannedDurationMin: 60,
    status: "planned",
    ...extra,
  });

  test("the day's own blocks in order; repeating ones and entries left out", () => {
    const labels = monthLabels(
      [
        block("Wedding", "2026-11-07", 840),
        block("Dentist", "2026-11-07", 600),
        block("Gym", "2026-11-07", 1020, {
          recurrenceId: "r" as Id<"recurrences">,
        }),
        {
          ...block("phone", "2026-11-07", 0),
          plannedStartMin: undefined,
          plannedDurationMin: undefined,
          status: "done",
          actualStartMin: 780,
          actualDurationMin: 30,
        },
      ],
      [events],
    );
    expect(labels.get(k("2026-11-07"))).toEqual([
      { blockId: "Dentist", text: "10:00 Dentist", colorKey: "amber" },
      { blockId: "Wedding", text: "14:00 Wedding", colorKey: "amber" },
    ]);
  });

  test("shownLabels says how many more", () => {
    const three = [1, 2, 3].map((n) => ({
      blockId: String(n) as Id<"blocks">,
      text: String(n),
      colorKey: "gray",
    }));
    expect(shownLabels(three, 2)).toEqual({
      labels: three.slice(0, 2),
      more: 1,
    });
    expect(shownLabels(three, 3).more).toBe(0);
  });
});
