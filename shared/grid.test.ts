import { describe, expect, test } from "vitest";
import {
  fitPxPerMin,
  gridDayOf,
  gridHeightPx,
  gridPosition,
  gridSegment,
  MAX_FIT_PX_PER_MIN,
  MIN_FIT_PX_PER_MIN,
  momentAt,
  insideFold,
  minuteToPx,
  momentOnGrid,
  pxBox,
  pxToMinute,
  pxToMinutes,
  scaledBox,
  SLEEP_FOLD_MIN_MIN,
  SLEEP_FOLD_PX,
  sleepFolds,
  slotStart,
  snapMinutes,
  wakePosition,
  wakingMinutes,
  ZOOM_LEVELS,
  ZOOM_PX_PER_MIN,
} from "./grid";
import { parseDateKey, type DateKey } from "./time";

function key(value: string): DateKey {
  const parsed = parseDateKey(value);
  if (parsed === null) throw new Error(`Bad DateKey in test: ${value}`);
  return parsed;
}

const MON = key("2026-10-12");
const TUE = key("2026-10-13");
const WED = key("2026-10-14");
const FIVE = 300; // the default grid start, 05:00

describe("gridPosition and momentAt", () => {
  test.each([
    // [moment date, minute, position in Tuesday's 05:00 grid]
    [TUE, 300, 0], // 05:00, the top
    [TUE, 540, 240], // 09:00
    [TUE, 1435, 1135], // 23:55
    [WED, 0, 1140], // midnight
    [WED, 295, 1435], // 04:55, the last slot
  ])("%s minute %d sits at %d", (date, minute, position) => {
    expect(gridPosition(TUE, FIVE, { date, minute })).toBe(position);
    expect(momentAt(TUE, FIVE, position)).toEqual({ date, minute });
  });

  test("moments outside the grid fall below 0 or from 1440 on", () => {
    expect(gridPosition(TUE, FIVE, { date: TUE, minute: 120 })).toBe(-180);
    expect(gridPosition(TUE, FIVE, { date: WED, minute: 300 })).toBe(1440);
    expect(gridPosition(TUE, FIVE, { date: MON, minute: 1380 })).toBe(-360);
  });

  test("a midnight grid start is the plain calendar day", () => {
    expect(gridPosition(TUE, 0, { date: TUE, minute: 540 })).toBe(540);
    expect(momentAt(TUE, 0, 1435)).toEqual({ date: TUE, minute: 1435 });
  });
});

describe("gridDayOf", () => {
  test.each([
    [TUE, 300, TUE], // 05:00 opens Tuesday's grid
    [TUE, 1439, TUE],
    [TUE, 299, MON], // 04:59 is still Monday's night
    [TUE, 0, MON],
  ])("%s minute %d is in the grid of %s", (date, minute, day) => {
    expect(gridDayOf({ date, minute }, FIVE)).toBe(day);
  });

  test("with a midnight grid start it is the calendar day", () => {
    expect(gridDayOf({ date: TUE, minute: 0 }, 0)).toBe(TUE);
  });
});

describe("gridSegment", () => {
  test.each([
    [
      "a morning block",
      { date: TUE, startMin: 540, durationMin: 60 },
      { top: 240, height: 60, startsBefore: false, endsAfter: false },
    ],
    [
      "the first slot",
      { date: TUE, startMin: 300, durationMin: 30 },
      { top: 0, height: 30, startsBefore: false, endsAfter: false },
    ],
    [
      "tonight's sleep, cut at 05:00",
      { date: TUE, startMin: 1380, durationMin: 480 },
      { top: 1080, height: 360, startsBefore: false, endsAfter: true },
    ],
    [
      "last night's sleep: its tail at the top",
      { date: MON, startMin: 1380, durationMin: 480 },
      { top: 0, height: 120, startsBefore: true, endsAfter: false },
    ],
    [
      "an early block on the next calendar day",
      { date: WED, startMin: 60, durationMin: 60 },
      { top: 1200, height: 60, startsBefore: false, endsAfter: false },
    ],
    [
      "a block across the grid's end",
      { date: WED, startMin: 270, durationMin: 60 },
      { top: 1410, height: 30, startsBefore: false, endsAfter: true },
    ],
    [
      "a full day from 04:00",
      { date: TUE, startMin: 240, durationMin: 1440 },
      { top: 0, height: 1380, startsBefore: true, endsAfter: false },
    ],
  ])("%s", (_name, span, expected) => {
    expect(gridSegment(TUE, FIVE, span)).toEqual(expected);
  });

  test.each([
    [
      "before 05:00 on the day itself",
      { date: TUE, startMin: 60, durationMin: 60 },
    ],
    [
      "ending exactly at the grid's start",
      { date: MON, startMin: 1380, durationMin: 360 },
    ],
    [
      "starting exactly at the grid's end",
      { date: WED, startMin: 300, durationMin: 60 },
    ],
    [
      "two days away",
      { date: key("2026-10-16"), startMin: 540, durationMin: 60 },
    ],
  ])("%s is not in the grid", (_name, span) => {
    expect(gridSegment(TUE, FIVE, span)).toBeNull();
  });

  test("each moment of a long block appears in exactly one grid", () => {
    const sleep = { date: TUE, startMin: 1380, durationMin: 480 };
    const tonight = gridSegment(TUE, FIVE, sleep);
    const tail = gridSegment(WED, FIVE, sleep);
    expect((tonight?.height ?? 0) + (tail?.height ?? 0)).toBe(480);
    expect(tail).toEqual({
      top: 0,
      height: 120,
      startsBefore: true,
      endsAfter: false,
    });
  });
});

describe("wakingMinutes and wakePosition", () => {
  test.each([
    [420, 1380, 960], // 07:00 to 23:00
    [360, 60, 1140], // 06:00 to 01:00, past midnight
    [480, 480, 1440], // equal: the whole day
  ])("awake from %d to %d is %d minutes", (wake, sleep, minutes) => {
    expect(wakingMinutes(wake, sleep)).toBe(minutes);
  });

  test.each([
    [300, 420, 120],
    [300, 300, 0],
    [0, 420, 420],
    [300, 240, 1380], // waking before the grid starts puts it at the bottom
  ])("grid start %d, wake %d: position %d", (gridStart, wake, position) => {
    expect(wakePosition(gridStart, wake)).toBe(position);
  });
});

describe("fitPxPerMin", () => {
  test("the waking part of the day fills the viewport", () => {
    expect(fitPxPerMin(960, 420, 1380)).toBe(1);
    expect(fitPxPerMin(720, 420, 1380)).toBe(0.75);
  });

  test("is kept readable on a short viewport and calm on a tall one", () => {
    expect(fitPxPerMin(200, 420, 1380)).toBe(MIN_FIT_PX_PER_MIN);
    expect(fitPxPerMin(5000, 420, 1380)).toBe(MAX_FIT_PX_PER_MIN);
  });
});

describe("pxBox", () => {
  test("scales minutes to pixels", () => {
    expect(pxBox(240, 60, 1.5)).toEqual({ top: 360, height: 90 });
  });

  test("blocks that touch in time touch on screen at any scale", () => {
    for (const scale of [0.5, 0.73, 1, 1.25, 1.5, 0.6667]) {
      const first = pxBox(245, 35, scale);
      const second = pxBox(280, 20, scale);
      expect(first.top + first.height).toBe(second.top);
    }
  });
});

describe("pxToMinutes", () => {
  test("is the inverse of the scale", () => {
    expect(pxToMinutes(360, 1.5)).toBe(240);
  });
});

describe("snapMinutes and slotStart", () => {
  test.each([
    [0, 5, 0],
    [2, 5, 0],
    [3, 5, 5],
    [547, 5, 545],
    [548, 5, 550],
    [547, 15, 540],
    [553, 15, 555],
  ])("snapMinutes(%d, %d) = %d", (minutes, step, expected) => {
    expect(snapMinutes(minutes, step)).toBe(expected);
  });

  test.each([
    [0, 15, 0],
    [14.9, 15, 0],
    [15, 15, 15],
    [553, 15, 540],
    [1439, 15, 1425],
  ])("slotStart(%d, %d) = %d", (minutes, step, expected) => {
    expect(slotStart(minutes, step)).toBe(expected);
  });
});

describe("momentOnGrid", () => {
  test.each([
    [540, { date: TUE, minute: 540 }], // 09:00
    [300, { date: TUE, minute: 300 }], // 05:00, the grid's first minute
    [1435, { date: TUE, minute: 1435 }],
    [60, { date: WED, minute: 60 }], // 01:00 is next calendar day's, at the bottom
    [295, { date: WED, minute: 295 }],
  ])("%d on Tuesday's 05:00 grid is %o", (minute, moment) => {
    expect(momentOnGrid(TUE, 300, minute)).toEqual(moment);
  });

  test("with a midnight grid start every time is the day itself", () => {
    expect(momentOnGrid(TUE, 0, 60)).toEqual({ date: TUE, minute: 60 });
  });
});

describe("zoom and compressed sleep", () => {
  // Sleep 23:00–07:00 on a grid from 05:00: positions 1080 to 1440 here, and the
  // last night's tail from 0 to 120.
  const night = { top: 1080, height: 480 };
  const tail = { top: -360, height: 480 };
  const scale = { pxPerMin: 1.5, folds: sleepFolds([night, tail], 1.5) };

  test("sleepFolds cuts to the grid, keeps the long ones, merges what touches", () => {
    // The tail from last night is only two hours here: under SLEEP_FOLD_MIN_MIN.
    expect(SLEEP_FOLD_MIN_MIN).toBe(180);
    expect(scale.folds).toEqual([{ top: 1080, height: 360 }]);
    expect(
      sleepFolds(
        [
          { top: 600, height: 120 },
          { top: 720, height: 90 },
        ],
        2,
      ),
    ).toEqual([{ top: 600, height: 210 }]);
    // A nap is not folded; nor a long stretch that would be shorter drawn plainly.
    expect(sleepFolds([{ top: 600, height: 60 }], 2)).toEqual([]);
    expect(sleepFolds([{ top: 600, height: 200 }], 0.1)).toEqual([]);
  });

  test.each([
    [0, 0],
    [600, 900],
    [1080, 1620],
    [1260, 1620 + SLEEP_FOLD_PX / 2],
    [1440, 1620 + SLEEP_FOLD_PX],
  ])("minute %d is at %d px, and back", (position, px) => {
    expect(minuteToPx(scale, position)).toBe(px);
    expect(pxToMinute(scale, px)).toBeCloseTo(position);
  });

  test("without folds it is the plain scale", () => {
    const plain = { pxPerMin: 2, folds: [] };
    expect(minuteToPx(plain, 300)).toBe(600);
    expect(pxToMinute(plain, 600)).toBe(300);
    expect(gridHeightPx(plain)).toBe(2880);
  });

  test("the grid's height counts each fold at its fixed height", () => {
    expect(gridHeightPx(scale)).toBe(1080 * 1.5 + SLEEP_FOLD_PX);
  });

  test("blocks that touch across a fold's edge touch on screen", () => {
    const before = scaledBox(scale, 1020, 60); // 22:00–23:00
    const sleep = scaledBox(scale, 1080, 360);
    expect(before.top + before.height).toBe(sleep.top);
    expect(sleep.height).toBe(SLEEP_FOLD_PX);
  });

  test("hour marks inside a fold are hidden, its edges are not", () => {
    expect(insideFold(scale, 1200)).toBe(true);
    expect(insideFold(scale, 1080)).toBe(false);
    expect(insideFold(scale, 600)).toBe(false);
  });

  test("the zoom levels", () => {
    expect(ZOOM_LEVELS).toEqual(["fit", "comfortable", "detailed"]);
    expect(ZOOM_PX_PER_MIN).toEqual({ comfortable: 1.25, detailed: 2 });
  });
});
