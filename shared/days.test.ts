import { describe, expect, test } from "vitest";
import { isScalePoint, SCALE_POINTS } from "./days";

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
