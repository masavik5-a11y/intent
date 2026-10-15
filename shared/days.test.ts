import { describe, expect, test } from "vitest";
import { isReturning, isScalePoint, SCALE_POINTS } from "./days";
import type { DateKey } from "./time";

describe("isScalePoint", () => {
  test.each([
    [1, true],
    [3, true],
    [5, true],
    [0, false],
    [6, false],
    [2.5, false],
    [Number.NaN, false],
  ])("%s → %s", (value, expected) => {
    expect(isScalePoint(value)).toBe(expected);
  });

  test("the scale runs 1 to 5", () => {
    expect(SCALE_POINTS).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("isReturning", () => {
  const today = "2026-10-15" as DateKey;
  const day = (value: string) => value as DateKey;

  test.each<[string, DateKey | null, boolean, boolean]>([
    ["recorded today", day("2026-10-15"), true, false],
    ["recorded yesterday", day("2026-10-14"), true, false],
    ["last recorded two days ago", day("2026-10-13"), true, true],
    ["last recorded a week ago", day("2026-10-08"), true, true],
    ["nothing in the look-back, the app used before", null, true, true],
    ["a first day in the app", null, false, false],
  ])("%s", (_, lastRecorded, usedBefore, expected) => {
    expect(isReturning({ lastRecorded, usedBefore, today })).toBe(expected);
  });
});
