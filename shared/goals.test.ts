import { describe, expect, test } from "vitest";
import { isValidWeeklyTarget, MAX_WEEKLY_TARGET_MIN } from "./goals";

describe("isValidWeeklyTarget", () => {
  test.each([
    [5, true],
    [900, true],
    [MAX_WEEKLY_TARGET_MIN, true],
    [0, false],
    [-60, false],
    [7, false],
    [90.5, false],
    [MAX_WEEKLY_TARGET_MIN + 5, false],
  ])("%d minutes: %s", (minutes, valid) => {
    expect(isValidWeeklyTarget(minutes)).toBe(valid);
  });
});
