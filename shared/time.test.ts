import { describe, expect, test } from "vitest";
import { isValidMinute } from "./time";

describe("isValidMinute", () => {
  test.each([
    [0, true],
    [5, true],
    [300, true],
    [1435, true],
    [1440, false], // the next day's midnight is not a start minute
    [-5, false],
    [7, false], // not on the 5-minute step
    [12.5, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])("%d -> %s", (value, expected) => {
    expect(isValidMinute(value)).toBe(expected);
  });
});
