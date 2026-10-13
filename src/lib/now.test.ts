import { describe, expect, test } from "vitest";
import { readNow, toLocalMoment } from "./now";

describe("toLocalMoment", () => {
  // Dates built from local parts, so the expectations hold in any time zone.
  test.each([
    [new Date(2026, 9, 13, 14, 30), "2026-10-13", 870],
    [new Date(2026, 9, 13, 0, 0), "2026-10-13", 0],
    [new Date(2026, 9, 13, 23, 59, 59), "2026-10-13", 1439],
    [new Date(2026, 9, 13, 9, 7), "2026-10-13", 547], // not on the 5-minute step
    [new Date(2026, 11, 31, 23, 59), "2026-12-31", 1439],
    [new Date(2027, 0, 1, 0, 1), "2027-01-01", 1],
    [new Date(2024, 1, 29, 12, 0), "2024-02-29", 720],
  ])("%s -> %s at minute %d", (instant, date, minute) => {
    expect(toLocalMoment(instant)).toEqual({ date, minute });
  });
});

describe("readNow", () => {
  test("returns a real day and a minute inside it", () => {
    const now = readNow();
    expect(now.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isInteger(now.minute)).toBe(true);
    expect(now.minute).toBeGreaterThanOrEqual(0);
    expect(now.minute).toBeLessThan(1440);
  });
});
