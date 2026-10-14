import { describe, expect, test } from "vitest";
import {
  addDays,
  dateKeyParts,
  daysBetween,
  formatDayLabel,
  formatDuration,
  formatTimeRange,
  isDateKey,
  isValidDuration,
  isValidMinute,
  minutesToLabel,
  parseDateKey,
  parseDuration,
  parseTimeLabel,
  toDateKey,
  weekdayOf,
  type DateKey,
} from "./time";

/** Test shorthand: a DateKey that must be valid. */
function key(value: string): DateKey {
  const parsed = parseDateKey(value);
  if (parsed === null) throw new Error(`Bad DateKey in test: ${value}`);
  return parsed;
}

describe("parseDateKey", () => {
  test.each([
    "2026-10-13",
    "2026-01-01",
    "2026-12-31",
    "2024-02-29", // leap year
    "2000-02-29", // divisible by 400
    "1000-01-01",
    "9999-12-31",
  ])("accepts %s", (value) => {
    expect(parseDateKey(value)).toBe(value);
    expect(isDateKey(value)).toBe(true);
  });

  test.each([
    ["", "empty"],
    ["2026-10-13T00:00:00Z", "a timestamp"],
    ["2026-10-13 ", "trailing space"],
    ["2026-1-5", "not zero-padded"],
    ["26-10-13", "two-digit year"],
    ["13-10-2026", "day first"],
    ["2026/10/13", "slashes"],
    ["2026-00-10", "month zero"],
    ["2026-13-01", "month thirteen"],
    ["2026-10-00", "day zero"],
    ["2026-10-32", "day past the month"],
    ["2026-04-31", "April has 30 days"],
    ["2026-02-29", "not a leap year"],
    ["1900-02-29", "divisible by 100, not by 400"],
    ["0999-12-31", "before the supported range"],
    ["today", "a word"],
  ])("rejects %s (%s)", (value) => {
    expect(parseDateKey(value)).toBeNull();
    expect(isDateKey(value)).toBe(false);
  });
});

describe("toDateKey and dateKeyParts", () => {
  test.each([
    [{ year: 2026, month: 10, day: 13 }, "2026-10-13"],
    [{ year: 2026, month: 1, day: 5 }, "2026-01-05"],
    [{ year: 2024, month: 2, day: 29 }, "2024-02-29"],
  ])("%o <-> %s", (parts, expected) => {
    expect(toDateKey(parts)).toBe(expected);
    expect(dateKeyParts(key(expected))).toEqual(parts);
  });

  test.each([
    { year: 2026, month: 2, day: 30 },
    { year: 2026, month: 0, day: 1 },
    { year: 2026, month: 13, day: 1 },
    { year: 2026, month: 10, day: 0 },
    { year: 2026.5, month: 10, day: 1 },
    { year: 99, month: 1, day: 1 },
  ])("toDateKey throws for %o", (parts) => {
    expect(() => toDateKey(parts)).toThrow(RangeError);
  });
});

describe("addDays", () => {
  test.each([
    ["2026-10-13", 0, "2026-10-13"],
    ["2026-10-13", 1, "2026-10-14"],
    ["2026-10-13", -1, "2026-10-12"],
    ["2026-10-31", 1, "2026-11-01"], // month end
    ["2026-12-31", 1, "2027-01-01"], // year end
    ["2027-01-01", -1, "2026-12-31"],
    ["2024-02-28", 1, "2024-02-29"], // leap day
    ["2024-02-28", 2, "2024-03-01"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2026-10-13", 14, "2026-10-27"], // the recurrence window
    ["2026-10-13", 365, "2027-10-13"],
    ["2026-10-13", -365, "2025-10-13"],
    // Days when clocks change in Europe and in the US. A calendar day is a calendar
    // day: no hour is lost or gained.
    ["2026-03-28", 1, "2026-03-29"],
    ["2026-03-29", 1, "2026-03-30"],
    ["2026-10-24", 1, "2026-10-25"],
    ["2026-10-25", 1, "2026-10-26"],
    ["2026-03-08", 1, "2026-03-09"],
    ["2026-11-01", 1, "2026-11-02"],
  ])("%s + %d = %s", (start, days, expected) => {
    expect(addDays(key(start), days)).toBe(expected);
  });

  test("is undone by the opposite step, over a whole year", () => {
    let date = key("2026-01-01");
    for (let i = 0; i < 365; i += 1) {
      const next = addDays(date, 1);
      expect(addDays(next, -1)).toBe(date);
      date = next;
    }
    expect(date).toBe("2027-01-01");
  });

  test("rejects a fractional number of days", () => {
    expect(() => addDays(key("2026-10-13"), 0.5)).toThrow(RangeError);
  });

  test("rejects a result outside the supported range", () => {
    expect(() => addDays(key("9999-12-31"), 1)).toThrow(RangeError);
  });
});

describe("daysBetween", () => {
  test.each([
    ["2026-10-13", "2026-10-13", 0],
    ["2026-10-13", "2026-10-14", 1],
    ["2026-10-14", "2026-10-13", -1],
    ["2026-10-31", "2026-11-01", 1],
    ["2026-12-31", "2027-01-01", 1],
    ["2024-02-28", "2024-03-01", 2],
    ["2026-03-28", "2026-03-30", 2], // over a clock change
    ["2026-10-24", "2026-10-26", 2],
    ["2026-01-01", "2027-01-01", 365],
    ["2024-01-01", "2025-01-01", 366],
  ])("from %s to %s is %d", (from, to, expected) => {
    expect(daysBetween(key(from), key(to))).toBe(expected);
  });

  test("undoes addDays", () => {
    const start = key("2026-10-13");
    for (const days of [-400, -31, -1, 0, 1, 30, 365, 1000]) {
      expect(daysBetween(start, addDays(start, days))).toBe(days);
    }
  });
});

describe("weekdayOf", () => {
  test.each([
    ["2026-10-11", 0], // Sunday
    ["2026-10-12", 1],
    ["2026-10-13", 2], // Tuesday, the date in the docs
    ["2026-10-17", 6], // Saturday
    ["2024-02-29", 4], // Thursday
    ["2000-01-01", 6],
  ])("%s is weekday %d", (date, expected) => {
    expect(weekdayOf(key(date))).toBe(expected);
  });
});

describe("formatDayLabel", () => {
  test.each([
    ["2026-10-13", "Tue 13 Oct"],
    ["2026-01-05", "Mon 5 Jan"],
    ["2026-12-31", "Thu 31 Dec"],
  ])("%s -> %s", (date, expected) => {
    expect(formatDayLabel(key(date))).toBe(expected);
  });

  test("can include the year", () => {
    expect(formatDayLabel(key("2026-10-13"), { withYear: true })).toBe(
      "Tue 13 Oct 2026",
    );
  });
});

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

describe("isValidDuration", () => {
  test.each([
    [5, true], // the minimum
    [90, true],
    [1440, true], // a whole day
    [0, false],
    [-30, false],
    [1445, false],
    [7, false],
    [22.5, false],
    [Number.NaN, false],
  ])("%d -> %s", (value, expected) => {
    expect(isValidDuration(value)).toBe(expected);
  });
});

describe("minutesToLabel", () => {
  test.each([
    [0, "00:00"],
    [5, "00:05"],
    [300, "05:00"], // the default grid start
    [450, "07:30"],
    [723, "12:03"], // the clock is not on the 5-minute step
    [1439, "23:59"],
    [1440, "00:00"], // end of a block that stops at midnight
    [1500, "01:00"], // end of a block that crosses midnight
    [2880, "00:00"],
    [-60, "23:00"],
  ])("%d -> %s", (minute, expected) => {
    expect(minutesToLabel(minute)).toBe(expected);
  });

  test("rejects fractions", () => {
    expect(() => minutesToLabel(7.5)).toThrow(RangeError);
  });
});

describe("parseTimeLabel", () => {
  test.each([
    ["00:00", 0],
    ["07:30", 450],
    ["7:30", 450],
    [" 7:30 ", 450],
    ["12:03", 723],
    ["23:59", 1439],
  ])("%s -> %d", (text, expected) => {
    expect(parseTimeLabel(text)).toBe(expected);
  });

  test.each([
    "",
    "24:00",
    "12:60",
    "7",
    "7:3",
    "07.30",
    "7:30pm",
    "-1:00",
    "abc",
  ])("rejects %s", (text) => {
    expect(parseTimeLabel(text)).toBeNull();
  });

  test("round-trips with minutesToLabel for every 5-minute start", () => {
    for (let minute = 0; minute < 1440; minute += 5) {
      expect(parseTimeLabel(minutesToLabel(minute))).toBe(minute);
    }
  });
});

describe("formatTimeRange", () => {
  test.each([
    [660, 90, "11:00–12:30"],
    [300, 5, "05:00–05:05"],
    [1380, 60, "23:00–00:00"], // ends at midnight
    [1380, 480, "23:00–07:00"], // sleep, crossing midnight
  ])("start %d, duration %d -> %s", (start, duration, expected) => {
    expect(formatTimeRange(start, duration)).toBe(expected);
  });
});

describe("parseDuration", () => {
  test.each([
    ["90", 90],
    [" 45 ", 45],
    ["90m", 90],
    ["45 min", 45],
    ["5mins", 5],
    ["1h", 60],
    ["2 h", 120],
    ["1h 30m", 90],
    ["1h30", 90],
    ["1h30m", 90],
    ["1 h 30 min", 90],
    ["1:30", 90],
    ["0:45", 45],
    ["1.5h", 90],
    ["1,5h", 90],
    ["0.25h", 15],
    ["1H 30M", 90],
    ["24h", 1440],
    ["0", 0],
  ])("%j is %d minutes", (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  test.each([
    "",
    "abc",
    "1h 30m 20s",
    "-30",
    "1:75",
    "1:5",
    "1.5h 10m",
    "1.33h", // 79.8 minutes
    "h",
    "30 hours",
    "1.5",
  ])("%j is not a length of time", (text) => {
    expect(parseDuration(text)).toBeNull();
  });

  test("reads what formatDuration writes", () => {
    for (const minutes of [5, 45, 60, 90, 125, 1440]) {
      expect(parseDuration(formatDuration(minutes))).toBe(minutes);
    }
  });
});

describe("formatDuration", () => {
  test.each([
    [0, "0m"],
    [5, "5m"],
    [45, "45m"],
    [60, "1h"],
    [105, "1h 45m"],
    [200, "3h 20m"],
    [310, "5h 10m"],
    [1440, "24h"],
    [1500, "25h"], // totals may exceed a day
  ])("%d -> %s", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });

  test.each([-5, 12.5])("rejects %d", (minutes) => {
    expect(() => formatDuration(minutes)).toThrow(RangeError);
  });
});
