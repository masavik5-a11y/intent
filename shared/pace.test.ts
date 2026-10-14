import { describe, expect, test } from "vitest";
import { countdown } from "./pace";
import { parseDateKey, type DateKey } from "./time";

function key(value: string): DateKey {
  const parsed = parseDateKey(value);
  if (parsed === null) throw new Error(`Bad DateKey in test: ${value}`);
  return parsed;
}

const TUE = key("2026-10-13");
const WED = key("2026-10-14");
const deepWork = { date: TUE, startMin: 540, durationMin: 120 }; // 09:00 – 11:00

describe("countdown", () => {
  test.each([
    [540, 120, 1, 0], // the first minute: all of it left
    [570, 90, 0.75, 0],
    [600, 60, 0.5, 0],
    [650, 10, 10 / 120, 0], // the last ten minutes
    [659, 1, 1 / 120, 0],
    [660, 0, 0, 0], // the end
    [665, 0, 0, 5], // five minutes over
    [500, 120, 1, 0], // before it starts: nothing used yet
  ])(
    "at minute %d: %d left, fraction %d, %d over",
    (minute, left, fraction, over) => {
      expect(countdown(deepWork, { date: TUE, minute })).toEqual({
        minutesLeft: left,
        fractionLeft: fraction,
        minutesOver: over,
      });
    },
  );

  test("a block across midnight counts down into the next day", () => {
    const sleep = { date: TUE, startMin: 1380, durationMin: 480 }; // to Wed 07:00
    expect(countdown(sleep, { date: TUE, minute: 1410 })).toMatchObject({
      minutesLeft: 450,
    });
    expect(countdown(sleep, { date: WED, minute: 360 })).toMatchObject({
      minutesLeft: 60,
      fractionLeft: 60 / 480,
    });
    expect(countdown(sleep, { date: WED, minute: 430 })).toMatchObject({
      minutesLeft: 0,
      minutesOver: 10,
    });
  });
});
