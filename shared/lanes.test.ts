import { describe, expect, test } from "vitest";
import {
  actualStartFor,
  defaultActual,
  entriesAfter,
  entryAt,
  findOverlap,
  firstFreeSpan,
  liveActual,
  minuteFrom,
  overlapWindow,
  spanBounds,
  spansOverlap,
  untrackedGaps,
  type LaneEntry,
  type LaneSpan,
} from "./lanes";
import { parseDateKey, type DateKey, type LocalMoment } from "./time";

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

/** Test shorthand: the moment "HH:MM" on `date`. */
function at(date: DateKey, time: string): LocalMoment {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  return { date, minute: hours * 60 + mins };
}

describe("minuteFrom", () => {
  test.each([
    [TUE, at(TUE, "09:30"), 570],
    [TUE, at(WED, "00:10"), 1450],
    [TUE, at(MON, "23:00"), -60],
  ])("from %s, %o is minute %d", (origin, moment, minute) => {
    expect(minuteFrom(origin, moment)).toBe(minute);
  });
});

describe("defaultActual (PRD section 7, rule 5)", () => {
  const write = span(TUE, "13:00", 60); // 13:00–14:00
  const evening = at(TUE, "18:00");

  test.each<[string, LaneSpan[], LaneSpan | null]>([
    ["with nothing in the way, the plan", [], span(TUE, "13:00", 60)],
    [
      "after an overrun, a late start and the planned end",
      [span(TUE, "12:00", 75)], // lunch until 13:15
      span(TUE, "13:15", 45),
    ],
    [
      "after a chain of overruns, past each one",
      [span(TUE, "12:00", 75), span(TUE, "13:15", 15)],
      span(TUE, "13:30", 30),
    ],
    [
      "with an entry starting inside, ending where it begins",
      [span(TUE, "13:30", 15)],
      span(TUE, "13:00", 30),
    ],
    [
      "with five minutes left, those five minutes",
      [span(TUE, "12:00", 115)],
      span(TUE, "13:55", 5),
    ],
    [
      "when the lane covers the whole plan, null",
      [span(TUE, "12:00", 150)],
      null,
    ],
    [
      "entries before and after it change nothing",
      [span(TUE, "11:00", 60), span(TUE, "14:00", 60)],
      span(TUE, "13:00", 60),
    ],
  ])("%s", (_, lane, expected) => {
    expect(defaultActual(write, lane, evening)).toEqual(expected);
  });

  test.each<[string, string, LaneSpan[], LaneSpan]>([
    ["a running block ends now", "13:40", [], span(TUE, "13:00", 40)],
    ["…at the 5-minute mark below now", "13:42", [], span(TUE, "13:00", 40)],
    ["…and lasts at least 5 minutes", "13:02", [], span(TUE, "13:00", 5)],
    [
      "a running block after an overrun starts late and ends now",
      "13:20",
      [span(TUE, "12:00", 75)],
      span(TUE, "13:15", 5),
    ],
    [
      "…at least 5 minutes from its late start",
      "13:16",
      [span(TUE, "12:00", 75)],
      span(TUE, "13:15", 5),
    ],
    [
      "a block marked at its end is the plan",
      "14:00",
      [],
      span(TUE, "13:00", 60),
    ],
  ])("%s (%s)", (_, time, lane, expected) => {
    expect(defaultActual(write, lane, at(TUE, time))).toEqual(expected);
  });

  test("Gym 11:00–12:30 marked at 11:50 records 11:00–11:50", () => {
    expect(defaultActual(span(TUE, "11:00", 90), [], at(TUE, "11:50"))).toEqual(
      span(TUE, "11:00", 50),
    );
  });

  test("a block planned before midnight can begin after it", () => {
    const late = span(MON, "23:30", 60); // to Tue 00:30
    const overran = span(MON, "22:00", 130); // to Tue 00:10
    expect(defaultActual(late, [overran], at(TUE, "08:00"))).toEqual({
      date: MON,
      startMin: 1450,
      durationMin: 20,
    });
  });

  test("an entry after midnight ends a block that crosses it", () => {
    const sleep = span(MON, "23:00", 480); // to Tue 07:00
    expect(
      defaultActual(sleep, [span(TUE, "03:00", 30)], at(TUE, "09:00")),
    ).toEqual({ date: MON, startMin: 1380, durationMin: 240 });
  });

  test("last night's sleep that ran long pushes the morning block", () => {
    const sleep = span(MON, "23:00", 510); // to Tue 07:30
    expect(
      defaultActual(span(TUE, "07:00", 60), [sleep], at(TUE, "09:00")),
    ).toEqual(span(TUE, "07:30", 30));
  });

  test("Done never creates an overlap, whatever is in the lane", () => {
    const lanes: LaneSpan[][] = [
      [span(TUE, "12:00", 70), span(TUE, "13:20", 10), span(TUE, "13:50", 30)],
      [span(TUE, "12:55", 10), span(TUE, "13:40", 5)],
      [span(TUE, "13:05", 50)],
      [span(MON, "23:00", 900)], // to Tue 14:00
      [span(TUE, "13:00", 5), span(TUE, "13:10", 5), span(TUE, "13:20", 5)],
    ];
    for (const lane of lanes) {
      for (const time of ["13:03", "13:27", "13:58", "18:00"]) {
        const actual = defaultActual(write, lane, at(TUE, time));
        if (actual === null) continue;
        expect(actual.durationMin).toBeGreaterThanOrEqual(5);
        for (const entry of lane) {
          expect(
            spansOverlap(actual, entry),
            JSON.stringify({ lane, time }),
          ).toBe(false);
        }
      }
    }
  });
});

describe("actualStartFor", () => {
  test("the planned start, pushed past an overrun", () => {
    const write = span(TUE, "13:00", 60);
    expect(actualStartFor(write, [])).toBe(780);
    expect(actualStartFor(write, [span(TUE, "12:00", 75)])).toBe(795);
    expect(actualStartFor(write, [span(TUE, "12:00", 120)])).toBeNull();
  });
});

describe("liveActual", () => {
  const write = span(TUE, "13:00", 60);

  test("grows minute by minute, not rounded", () => {
    expect(liveActual(write, [], at(TUE, "13:42"))).toEqual(
      span(TUE, "13:00", 42),
    );
    expect(liveActual(write, [], at(TUE, "13:43"))).toEqual(
      span(TUE, "13:00", 43),
    );
  });

  test("is nothing at the first minute, or before an overrun has ended", () => {
    expect(liveActual(write, [], at(TUE, "13:00"))).toBeNull();
    expect(
      liveActual(write, [span(TUE, "12:00", 75)], at(TUE, "13:10")),
    ).toBeNull();
  });

  test("starts where an overrun ended", () => {
    expect(
      liveActual(write, [span(TUE, "12:00", 75)], at(TUE, "13:20")),
    ).toEqual(span(TUE, "13:15", 5));
  });
});

describe("untrackedGaps (PRD section 7, rule 8)", () => {
  const morning = span(TUE, "05:00", 600); // 05:00–15:00

  test("the stretches no entry covers", () => {
    expect(
      untrackedGaps([span(TUE, "09:00", 60), span(TUE, "07:00", 60)], morning),
    ).toEqual([
      span(TUE, "05:00", 120),
      span(TUE, "08:00", 60),
      span(TUE, "10:00", 300),
    ]);
  });

  test("only those at least minLength long", () => {
    expect(
      untrackedGaps(
        [span(TUE, "07:00", 60), span(TUE, "09:00", 60)],
        morning,
        90,
      ),
    ).toEqual([span(TUE, "05:00", 120), span(TUE, "10:00", 300)]);
  });

  test("last night's sleep covers the morning; entries past the end are cut", () => {
    expect(
      untrackedGaps(
        [span(MON, "23:00", 480), span(TUE, "14:30", 120)],
        morning,
      ),
    ).toEqual([span(TUE, "07:00", 450)]);
  });

  test("after midnight the minutes run on from 1440", () => {
    const grid = span(TUE, "05:00", 1440); // to Wed 05:00
    expect(
      untrackedGaps([span(TUE, "05:00", 1140), span(WED, "01:00", 60)], grid),
    ).toEqual([
      { date: TUE, startMin: 1440, durationMin: 60 },
      { date: TUE, startMin: 1560, durationMin: 180 },
    ]);
  });

  test("a window up to a minute that is not on the 5-minute step", () => {
    expect(
      untrackedGaps([span(TUE, "05:00", 60)], {
        date: TUE,
        startMin: 300,
        durationMin: 73,
      }),
    ).toEqual([{ date: TUE, startMin: 360, durationMin: 13 }]);
  });

  test("an empty window has no gaps", () => {
    expect(untrackedGaps([], span(TUE, "05:00", 0))).toEqual([]);
  });
});
