import { describe, expect, test } from "vitest";
import {
  entriesAfter,
  entryAt,
  findOverlap,
  firstFreeSpan,
  overlapWindow,
  spanBounds,
  spansOverlap,
  type LaneEntry,
  type LaneSpan,
} from "./lanes";
import { parseDateKey, type DateKey } from "./time";

function key(value: string): DateKey {
  const parsed = parseDateKey(value);
  if (parsed === null) throw new Error(`Bad DateKey in test: ${value}`);
  return parsed;
}

const MON = key("2026-10-12");
const TUE = key("2026-10-13");
const WED = key("2026-10-14");

/** Test shorthand: a span from "HH:MM" lasting `minutes`. */
function span(date: DateKey, start: string, minutes: number): LaneSpan {
  const [hours = 0, mins = 0] = start.split(":").map(Number);
  return { date, startMin: hours * 60 + mins, durationMin: minutes };
}

function entry(
  id: string,
  date: DateKey,
  start: string,
  minutes: number,
): LaneEntry<string> {
  return { id, ...span(date, start, minutes) };
}

describe("spanBounds", () => {
  test.each([
    [TUE, span(TUE, "09:00", 60), 540, 600],
    [TUE, span(MON, "23:00", 480), -60, 420], // last night's sleep
    [TUE, span(WED, "06:00", 30), 1800, 1830],
    [MON, span(TUE, "00:00", 5), 1440, 1445],
  ])("from %s, %o is [%d, %d)", (origin, value, start, end) => {
    expect(spanBounds(origin, value)).toEqual({ start, end });
  });
});

describe("spansOverlap", () => {
  test.each([
    ["the same span", span(TUE, "09:00", 60), span(TUE, "09:00", 60)],
    ["one inside the other", span(TUE, "09:00", 120), span(TUE, "09:30", 30)],
    ["a shared 5 minutes", span(TUE, "09:00", 60), span(TUE, "09:55", 30)],
    [
      "a block over midnight and an early one the next day",
      span(TUE, "23:00", 480),
      span(WED, "06:30", 30),
    ],
    [
      "last night's tail and an early block",
      span(MON, "23:30", 480),
      span(TUE, "07:00", 60),
    ],
    [
      "two that cross midnight",
      span(TUE, "22:00", 240),
      span(TUE, "23:30", 120),
    ],
    [
      "a full day and anything inside it",
      span(TUE, "05:00", 1440),
      span(WED, "04:55", 5),
    ],
  ])("%s overlap", (_name, a, b) => {
    expect(spansOverlap(a, b)).toBe(true);
    expect(spansOverlap(b, a)).toBe(true);
  });

  test.each([
    ["touching end to start", span(TUE, "09:00", 60), span(TUE, "10:00", 30)],
    ["apart", span(TUE, "09:00", 60), span(TUE, "14:00", 30)],
    [
      "sleep ending as the next block starts",
      span(MON, "23:00", 480),
      span(TUE, "07:00", 60),
    ],
    [
      "the same time on different days",
      span(TUE, "09:00", 60),
      span(WED, "09:00", 60),
    ],
    [
      "an evening and the next morning",
      span(TUE, "20:00", 60),
      span(WED, "08:00", 60),
    ],
    [
      "a full day and the next day's start",
      span(TUE, "05:00", 1440),
      span(WED, "05:00", 30),
    ],
  ])("%s do not overlap", (_name, a, b) => {
    expect(spansOverlap(a, b)).toBe(false);
    expect(spansOverlap(b, a)).toBe(false);
  });
});

describe("overlapWindow", () => {
  test("is the day before, the day, and the day after", () => {
    expect(overlapWindow(TUE)).toEqual([MON, TUE, WED]);
  });

  test("crosses month and year ends", () => {
    expect(overlapWindow(key("2027-01-01"))).toEqual([
      key("2026-12-31"),
      key("2027-01-01"),
      key("2027-01-02"),
    ]);
  });
});

describe("findOverlap", () => {
  const lane = [
    entry("sleep-mon", MON, "23:00", 480), // Mon 23:00 – Tue 07:00
    entry("deep", TUE, "09:00", 180), // 09:00 – 12:00
    entry("gym", TUE, "12:30", 90), // 12:30 – 14:00
    entry("sleep-tue", TUE, "23:30", 450), // Tue 23:30 – Wed 07:00
    entry("early", WED, "07:00", 30), // Wed 07:00 – 07:30
  ];

  test.each([
    ["a free slot", span(TUE, "14:00", 60)],
    ["between two blocks exactly", span(TUE, "12:00", 30)],
    ["right after last night's sleep", span(TUE, "07:00", 120)],
    ["right before tonight's sleep", span(TUE, "22:00", 90)],
  ])("%s fits", (_name, candidate) => {
    expect(findOverlap(candidate, lane)).toBeNull();
  });

  test.each([
    ["inside a block", span(TUE, "10:00", 30), "deep"],
    ["across two blocks: the first one", span(TUE, "11:00", 120), "deep"],
    ["over last night's tail", span(TUE, "06:00", 60), "sleep-mon"],
    [
      "just after midnight, inside last night's sleep",
      span(TUE, "00:00", 30),
      "sleep-mon",
    ],
    [
      "a late block running into tonight's sleep",
      span(TUE, "23:00", 60),
      "sleep-tue",
    ],
    [
      "crossing midnight into tomorrow's first block",
      span(TUE, "22:00", 600),
      "sleep-tue",
    ],
    [
      "tomorrow morning, against tonight's sleep",
      span(WED, "06:00", 30),
      "sleep-tue",
    ],
  ])("%s collides with %s", (_name, candidate, expected) => {
    expect(findOverlap(candidate, lane)?.id).toBe(expected);
  });

  test("skips the candidate's own entry, so an edit can stay in place", () => {
    expect(
      findOverlap({ id: "deep", ...span(TUE, "09:30", 150) }, lane),
    ).toBeNull();
    expect(
      findOverlap({ id: "deep", ...span(TUE, "10:00", 180) }, lane)?.id,
    ).toBe("gym");
  });

  test("an empty lane has room for anything", () => {
    expect(findOverlap(span(TUE, "00:00", 1440), [])).toBeNull();
  });

  test("works with any id type", () => {
    const numbered = [{ id: 7, ...span(TUE, "09:00", 60) }];
    expect(findOverlap(span(TUE, "09:30", 60), numbered)?.id).toBe(7);
    expect(
      findOverlap({ id: 7, ...span(TUE, "09:30", 60) }, numbered),
    ).toBeNull();
  });
});

describe("firstFreeSpan", () => {
  const lane = [
    entry("sleep-mon", MON, "23:00", 480), // Mon 23:00 – Tue 07:00
    entry("routine", TUE, "07:00", 60), // 07:00 – 08:00
    entry("deep", TUE, "08:00", 180), // 08:00 – 11:00
    entry("gym", TUE, "11:30", 90), // 11:30 – 13:00
    entry("sleep-tue", TUE, "23:00", 480), // Tue 23:00 – Wed 07:00
  ];

  test("a free start stays where it is", () => {
    expect(firstFreeSpan(span(TUE, "14:00", 60), lane)).toEqual(
      span(TUE, "14:00", 60),
    );
  });

  test("moves past the blocks in the way, one after another", () => {
    expect(firstFreeSpan(span(TUE, "07:00", 60), lane)).toEqual(
      span(TUE, "13:00", 60),
    );
  });

  test("a short gap that fits is used", () => {
    expect(firstFreeSpan(span(TUE, "10:00", 30), lane)).toEqual(
      span(TUE, "11:00", 30),
    );
  });

  test("from inside last night's sleep, it starts when the sleep ends", () => {
    expect(firstFreeSpan(span(TUE, "05:00", 30), lane)).toEqual(
      span(TUE, "11:00", 30),
    );
    expect(firstFreeSpan(span(TUE, "05:00", 30), lane.slice(0, 1))).toEqual(
      span(TUE, "07:00", 30),
    );
  });

  test("moves onto the next day past tonight's sleep", () => {
    expect(firstFreeSpan(span(TUE, "23:30", 60), lane)).toEqual(
      span(WED, "07:00", 60),
    );
  });

  test("gives up when nothing fits within a day", () => {
    const full = [
      entry("all", TUE, "00:00", 1440),
      entry("next", WED, "00:00", 1440),
    ];
    expect(firstFreeSpan(span(TUE, "09:00", 60), full)).toBeNull();
  });
});

describe("entryAt and entriesAfter", () => {
  const lane = [
    entry("sleep-mon", MON, "23:00", 480), // Mon 23:00 – Tue 07:00
    entry("deep", TUE, "09:00", 120), // 09:00 – 11:00
    entry("gym", TUE, "12:00", 60),
    entry("read", TUE, "20:00", 30),
    entry("sleep-tue", TUE, "23:00", 480), // to Wed 07:00
    entry("early", WED, "07:30", 30),
  ];

  test.each([
    [TUE, 540, "deep"], // its first minute
    [TUE, 659, "deep"],
    [TUE, 660, null], // it ended
    [TUE, 300, "sleep-mon"], // last night's sleep, still running
    [WED, 60, "sleep-tue"],
    [TUE, 800, null],
  ] as const)("on %s at minute %d: %s", (date, minute, id) => {
    expect(entryAt(lane, { date, minute })?.id ?? null).toBe(id);
  });

  test("up next: the following entries, soonest first", () => {
    expect(
      entriesAfter(lane, { date: TUE, minute: 600 }, 2).map((e) => e.id),
    ).toEqual(["gym", "read"]);
  });

  test("up next goes on past midnight", () => {
    expect(
      entriesAfter(lane, { date: TUE, minute: 1300 }, 2).map((e) => e.id),
    ).toEqual(["sleep-tue", "early"]);
  });

  test("the current entry is not up next", () => {
    expect(
      entriesAfter(lane, { date: TUE, minute: 540 }, 1).map((e) => e.id),
    ).toEqual(["gym"]);
  });

  test("nothing after the last one", () => {
    expect(entriesAfter(lane, { date: WED, minute: 480 }, 2)).toEqual([]);
  });
});
