import { describe, expect, test } from "vitest";
import type { DateKey } from "@shared/time";
import { repeatsSentence, skippedLine, weekdayChip } from "./repeatView";

const d = (value: string) => value as DateKey;

describe("skippedLine", () => {
  test("nothing left out says nothing", () => {
    expect(skippedLine([])).toBeNull();
  });

  test("one date names what is there", () => {
    expect(skippedLine([{ date: d("2026-10-21"), blockedBy: "Dentist" }])).toBe(
      "Left out on Wed 21 Oct: Dentist is there.",
    );
  });

  test("several are listed, the rest counted", () => {
    expect(
      skippedLine([
        { date: d("2026-10-21"), blockedBy: "Dentist" },
        { date: d("2026-10-22"), blockedBy: "Lunch" },
      ]),
    ).toBe(
      "Left out where something else is: Wed 21 Oct (Dentist), Thu 22 Oct (Lunch).",
    );
    expect(
      skippedLine(
        ["21", "22", "23", "24", "25"].map((day) => ({
          date: d(`2026-10-${day}`),
          blockedBy: "Trip",
        })),
      ),
    ).toBe(
      "Left out where something else is: Wed 21 Oct (Trip), Thu 22 Oct (Trip), Fri 23 Oct (Trip), and 2 more.",
    );
  });
});

describe("weekdayChip", () => {
  test("a letter to see, a name to hear", () => {
    expect(weekdayChip(1)).toEqual({ letter: "M", name: "Monday" });
    expect(weekdayChip(0)).toEqual({ letter: "S", name: "Sunday" });
  });
});

describe("repeatsSentence", () => {
  const from = d("2026-10-12");
  test.each<[number[], DateKey | undefined, string]>([
    [[0, 1, 2, 3, 4, 5, 6], undefined, "Repeats every day"],
    [[1, 2, 3, 4, 5], undefined, "Repeats on weekdays"],
    [[0, 6], undefined, "Repeats on weekends"],
    [[1, 3, 5], d("2026-12-20"), "Repeats on Mon, Wed, Fri · until Sun 20 Dec"],
  ])("%j until %s", (weekdays, endDate, expected) => {
    expect(repeatsSentence({ weekdays, startDate: from, endDate })).toBe(
      expected,
    );
  });
});
