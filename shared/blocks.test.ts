import { describe, expect, test } from "vitest";
import {
  actualLaneOf,
  applyStatus,
  blockShapeProblem,
  blockSpan,
  editTarget,
  effectiveIntent,
  hasActual,
  hasPlan,
  actualStartFromClock,
  INTENT_FIELDS,
  isRunning,
  isValidActualStart,
  liveActualLane,
  partlyChoices,
  planLaneOf,
  type BlockShape,
  type IntentTexts,
  type StatusAction,
} from "./blocks";
import type { LaneSpan } from "./lanes";
import type { DateKey, LocalMoment } from "./time";

const gym: IntentTexts = {
  doneWhen: "All four lifts logged.",
  why: "Energy for the camera.",
  how: "Bench 4x6, incline, dips.",
  ifThen: "I do 10 minutes and decide.",
  minimumVersion: "20 minutes, three exercises.",
  costOfSkipping: "Low energy, and it shows on camera.",
};

describe("effectiveIntent", () => {
  test("a block without overrides inherits every field", () => {
    const intent = effectiveIntent({}, gym);
    for (const field of INTENT_FIELDS) {
      expect(intent[field]).toEqual({ text: gym[field], inherited: true });
    }
  });

  test("a block's own text wins, field by field", () => {
    const intent = effectiveIntent(
      { doneWhen: "Squat 5x5.", why: "Today it is about the legs." },
      gym,
    );
    expect(intent.doneWhen).toEqual({ text: "Squat 5x5.", inherited: false });
    expect(intent.why).toEqual({
      text: "Today it is about the legs.",
      inherited: false,
    });
    expect(intent.how).toEqual({ text: gym.how, inherited: true });
  });

  test("without an activity only the block's own text applies", () => {
    const intent = effectiveIntent({ why: "A one-off." }, null);
    expect(intent.why).toEqual({ text: "A one-off.", inherited: false });
    expect(intent.how).toBeNull();
    expect(intent.doneWhen).toBeNull();
  });

  test("a field neither has is null", () => {
    const intent = effectiveIntent({}, { why: "Only a why." });
    expect(intent.why).toEqual({ text: "Only a why.", inherited: true });
    expect(intent.how).toBeNull();
    expect(intent.costOfSkipping).toBeNull();
  });

  test.each(["", "   ", "\n"])(
    "blank block text %j counts as unset and inherits",
    (blank) => {
      expect(effectiveIntent({ why: blank }, gym).why).toEqual({
        text: gym.why,
        inherited: true,
      });
    },
  );

  test("blank activity text counts as none", () => {
    expect(effectiveIntent({}, { why: "  " }).why).toBeNull();
  });

  test("explicitly undefined fields inherit", () => {
    expect(effectiveIntent({ why: undefined }, gym).why?.inherited).toBe(true);
  });
});

const TUE = "2026-10-13" as DateKey;

type TestBlock = BlockShape & { _id: string };

function planned(id: string, start: number, minutes: number): TestBlock {
  return {
    _id: id,
    date: TUE,
    status: "planned",
    plannedStartMin: start,
    plannedDurationMin: minutes,
  };
}

const gymDone: TestBlock = {
  ...planned("gym", 660, 90),
  status: "done",
  actualStartMin: 670,
  actualDurationMin: 80,
};
const drift: TestBlock = {
  _id: "drift",
  date: TUE,
  status: "done",
  actualStartMin: 780,
  actualDurationMin: 45,
};

describe("lanes of blocks", () => {
  const blocks = [planned("read", 1200, 30), gymDone, drift];

  test("the plan lane holds every block with plan times", () => {
    expect(planLaneOf(blocks).map((entry) => entry.id)).toEqual([
      "read",
      "gym",
    ]);
    expect(planLaneOf(blocks)[1]).toMatchObject({
      date: TUE,
      startMin: 660,
      durationMin: 90,
    });
  });

  test("the actual lane holds every block with actual times", () => {
    expect(actualLaneOf(blocks)).toEqual([
      { id: "gym", date: TUE, startMin: 670, durationMin: 80, block: gymDone },
      { id: "drift", date: TUE, startMin: 780, durationMin: 45, block: drift },
    ]);
  });

  test("a block is known by its plan, an unplanned entry by what happened", () => {
    expect(blockSpan(gymDone)).toEqual({
      date: TUE,
      startMin: 660,
      durationMin: 90,
    });
    expect(blockSpan(drift)).toEqual({
      date: TUE,
      startMin: 780,
      durationMin: 45,
    });
  });

  test("hasPlan and hasActual", () => {
    expect([hasPlan(gymDone), hasActual(gymDone)]).toEqual([true, true]);
    expect([hasPlan(drift), hasActual(drift)]).toEqual([false, true]);
    const read = planned("read", 1200, 30);
    expect([hasPlan(read), hasActual(read)]).toEqual([true, false]);
  });
});

describe("isValidActualStart", () => {
  test.each([
    [0, true],
    [1435, true],
    [1440, true], // a block planned before midnight that began after it
    [2875, true],
    [2880, false],
    [-5, false],
    [662, false],
    [660.5, false],
  ])("%d is %s", (value, valid) => {
    expect(isValidActualStart(value)).toBe(valid);
  });
});

describe("blockShapeProblem", () => {
  const plan = { plannedStartMin: 660, plannedDurationMin: 90 };
  const actual = { actualStartMin: 660, actualDurationMin: 90 };
  const base = { date: TUE };

  test.each<[string, BlockShape]>([
    ["a planned block", { ...base, status: "planned", ...plan }],
    ["a done block", { ...base, status: "done", ...plan, ...actual }],
    [
      "a partly done block",
      { ...base, status: "partial", ...plan, ...actual, actualDurationMin: 30 },
    ],
    [
      "a skipped block with a reason",
      { ...base, status: "skipped", ...plan, skipReason: "tired" },
    ],
    ["an unplanned entry", { ...base, status: "done", ...actual }],
    [
      "an actual start after midnight",
      {
        ...base,
        status: "done",
        ...plan,
        actualStartMin: 1450,
        actualDurationMin: 20,
      },
    ],
    [
      "an actual end at the end of the next day",
      {
        ...base,
        status: "done",
        ...plan,
        actualStartMin: 1440,
        actualDurationMin: 1440,
      },
    ],
    [
      "an unplanned entry until the end of the next day",
      {
        ...base,
        status: "done",
        actualStartMin: 1435,
        actualDurationMin: 1440,
      },
    ],
  ])("accepts %s", (_, block) => {
    expect(blockShapeProblem(block)).toBeNull();
  });

  test.each<[string, BlockShape, "INVALID_INPUT" | "INVALID_TIME"]>([
    ["neither plan nor actual", { ...base, status: "done" }, "INVALID_INPUT"],
    [
      "a plan start without a duration",
      { ...base, status: "planned", plannedStartMin: 660 },
      "INVALID_INPUT",
    ],
    [
      "an actual duration without a start",
      { ...base, status: "done", ...plan, actualDurationMin: 30 },
      "INVALID_INPUT",
    ],
    [
      "a planned block with actual times",
      { ...base, status: "planned", ...plan, ...actual },
      "INVALID_INPUT",
    ],
    [
      "a skipped block with actual times",
      { ...base, status: "skipped", ...plan, ...actual },
      "INVALID_INPUT",
    ],
    [
      "a done block without actual times",
      { ...base, status: "done", ...plan },
      "INVALID_INPUT",
    ],
    [
      "a partly done block without actual times",
      { ...base, status: "partial", ...plan },
      "INVALID_INPUT",
    ],
    [
      "an unplanned entry marked partly",
      { ...base, status: "partial", ...actual },
      "INVALID_INPUT",
    ],
    [
      "a skip reason on a block that was not skipped",
      { ...base, status: "planned", ...plan, skipReason: "forgot" },
      "INVALID_INPUT",
    ],
    [
      "a plan start off the 5-minute step",
      { ...base, status: "planned", ...plan, plannedStartMin: 662 },
      "INVALID_TIME",
    ],
    [
      "a plan start at midnight's end",
      { ...base, status: "planned", ...plan, plannedStartMin: 1440 },
      "INVALID_TIME",
    ],
    [
      "an actual duration of zero",
      { ...base, status: "done", ...plan, ...actual, actualDurationMin: 0 },
      "INVALID_TIME",
    ],
    [
      "an actual end past the end of the next day",
      {
        ...base,
        status: "done",
        ...plan,
        actualStartMin: 2400,
        actualDurationMin: 600,
      },
      "INVALID_TIME",
    ],
    [
      "an unplanned entry starting on the next day",
      { ...base, status: "done", actualStartMin: 1450, actualDurationMin: 30 },
      "INVALID_TIME",
    ],
  ])("refuses %s", (_, block, problem) => {
    expect(blockShapeProblem(block)).toBe(problem);
  });
});

const MON = "2026-10-12" as DateKey;
const WED = "2026-10-14" as DateKey;

function at(date: DateKey, time: string): LocalMoment {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  return { date, minute: hours * 60 + mins };
}

function span(date: DateKey, time: string, minutes: number): LaneSpan {
  return {
    ...at(date, time),
    startMin: at(date, time).minute,
    durationMin: minutes,
  };
}

describe("isRunning and editTarget", () => {
  const write = planned("write", 780, 60); // 13:00–14:00

  test.each([
    ["12:59", false],
    ["13:00", true],
    ["13:59", true],
    ["14:00", false],
  ])("a planned block at %s is running: %s", (time, running) => {
    expect(isRunning(write, at(TUE, time))).toBe(running);
  });

  test("a block marked early or skipped is no longer running", () => {
    const now = at(TUE, "13:30");
    expect(isRunning({ ...write, status: "skipped" }, now)).toBe(false);
    expect(
      isRunning(
        {
          ...write,
          status: "done",
          actualStartMin: 780,
          actualDurationMin: 30,
        },
        now,
      ),
    ).toBe(false);
    expect(isRunning(drift, now)).toBe(false);
  });

  test("last night's sleep is running after midnight", () => {
    const sleep = { ...planned("sleep", 1380, 480), date: MON };
    expect(isRunning(sleep, at(TUE, "03:00"))).toBe(true);
    expect(isRunning(sleep, at(TUE, "07:00"))).toBe(false);
  });

  test.each<[string, LocalMoment, "plan" | "actual"]>([
    ["before it starts, today: the plan", at(TUE, "12:00"), "plan"],
    ["once it has started: what happened", at(TUE, "13:00"), "actual"],
    ["after it ended: what happened", at(TUE, "15:00"), "actual"],
    [
      "on a later day (the block is past): what happened",
      at(WED, "09:00"),
      "actual",
    ],
    [
      "on an earlier day (the block is ahead): the plan",
      at(MON, "20:00"),
      "plan",
    ],
  ])("edits %s", (_, now, target) => {
    expect(editTarget(write, now)).toBe(target);
  });

  test("an unplanned entry is only ever edited as what happened", () => {
    expect(editTarget(drift, at(MON, "09:00"))).toBe("actual");
  });
});

describe("applyStatus", () => {
  const write = planned("write", 780, 60); // 13:00–14:00
  const evening = at(TUE, "18:00");
  const done: StatusAction = { type: "done" };

  test("Done after the block: what was planned", () => {
    expect(applyStatus(write, done, [], evening)).toEqual({
      fields: {
        status: "done",
        actualStartMin: 780,
        actualDurationMin: 60,
        skipReason: undefined,
      },
    });
  });

  test("Done after an overrun: a late start and the planned end", () => {
    const lunch = span(TUE, "12:00", 75); // until 13:15
    expect(applyStatus(write, done, [lunch], evening)).toMatchObject({
      fields: { status: "done", actualStartMin: 795, actualDurationMin: 45 },
    });
  });

  test("Done while running: ends now", () => {
    expect(applyStatus(write, done, [], at(TUE, "13:50"))).toMatchObject({
      fields: { actualStartMin: 780, actualDurationMin: 50 },
    });
  });

  test("Done and Partly wait until the block has started", () => {
    const early = at(TUE, "12:55");
    expect(applyStatus(write, done, [], early)).toEqual({
      problem: "NOT_STARTED",
    });
    expect(
      applyStatus(write, { type: "partial", minutes: 30 }, [], early),
    ).toEqual({ problem: "NOT_STARTED" });
  });

  test("Done finds no room when the lane holds the whole plan", () => {
    expect(
      applyStatus(write, done, [span(TUE, "12:00", 150)], evening),
    ).toEqual({ problem: "NO_ROOM" });
  });

  test("Done on a skipped block replaces the skip", () => {
    const skipped: TestBlock = {
      ...write,
      status: "skipped",
      skipReason: "tired",
    };
    expect(applyStatus(skipped, done, [], evening)).toMatchObject({
      fields: { status: "done", skipReason: undefined },
    });
  });

  test("Partly: the minutes given, from where Done would start", () => {
    expect(
      applyStatus(write, { type: "partial", minutes: 25 }, [], evening),
    ).toEqual({
      fields: {
        status: "partial",
        actualStartMin: 780,
        actualDurationMin: 25,
        skipReason: undefined,
      },
    });
    expect(
      applyStatus(
        write,
        { type: "partial", minutes: 25 },
        [span(TUE, "12:00", 75)],
        evening,
      ),
    ).toMatchObject({ fields: { actualStartMin: 795, actualDurationMin: 25 } });
  });

  test("Partly refuses a length that runs into the next entry, or is no length", () => {
    expect(
      applyStatus(
        write,
        { type: "partial", minutes: 45 },
        [span(TUE, "13:30", 30)],
        evening,
      ),
    ).toEqual({ problem: "NO_ROOM" });
    for (const minutes of [0, 7, -30]) {
      expect(
        applyStatus(write, { type: "partial", minutes }, [], evening),
      ).toEqual({ problem: "INVALID_TIME" });
    }
  });

  test("Skip works at any time, with or without a reason, and clears actual times", () => {
    const marked: TestBlock = {
      ...write,
      status: "done",
      actualStartMin: 780,
      actualDurationMin: 60,
    };
    expect(
      applyStatus(marked, { type: "skip", reason: "noTime" }, [], evening),
    ).toEqual({
      fields: {
        status: "skipped",
        actualStartMin: undefined,
        actualDurationMin: undefined,
        skipReason: "noTime",
      },
    });
    // Skipping ahead of time, say tomorrow's block tonight.
    expect(applyStatus(write, { type: "skip" }, [], at(MON, "21:00"))).toEqual({
      fields: {
        status: "skipped",
        actualStartMin: undefined,
        actualDurationMin: undefined,
        skipReason: undefined,
      },
    });
  });

  test("Undo goes back to planned, without actual times or a reason", () => {
    const skipped: TestBlock = {
      ...write,
      status: "skipped",
      skipReason: "tired",
    };
    expect(applyStatus(skipped, { type: "undo" }, [], evening)).toEqual({
      fields: {
        status: "planned",
        actualStartMin: undefined,
        actualDurationMin: undefined,
        skipReason: undefined,
      },
    });
  });

  test("an unplanned entry has no status to change", () => {
    for (const action of [
      done,
      { type: "partial", minutes: 10 },
      { type: "skip" },
      { type: "undo" },
    ] satisfies StatusAction[]) {
      expect(applyStatus(drift, action, [], evening)).toEqual({
        problem: "UNPLANNED",
      });
    }
  });

  test("every change it makes keeps the block's shape", () => {
    const actions: StatusAction[] = [
      done,
      { type: "partial", minutes: 20 },
      { type: "skip", reason: "forgot" },
      { type: "undo" },
    ];
    for (const action of actions) {
      const result = applyStatus(write, action, [], evening);
      if (!("fields" in result)) throw new Error("expected a change");
      expect(blockShapeProblem({ ...write, ...result.fields })).toBeNull();
    }
  });
});

describe("partlyChoices", () => {
  test.each<[number, number | undefined, number[]]>([
    [180, undefined, [45, 90, 135]],
    [60, undefined, [15, 30, 45]],
    [90, undefined, [25, 45, 70]], // 22.5 and 67.5 round up to the step
    [180, 37, [35, 45, 90, 135]], // and the time so far, while running
    [60, 30, [15, 30, 45]], // without repeats
    [10, undefined, [5]],
    [5, undefined, []],
    [60, 2, [15, 30, 45]], // under 5 minutes so far is not offered
  ])("%d minutes planned, %s so far: %o", (planned, soFar, expected) => {
    expect(partlyChoices(planned, soFar)).toEqual(expected);
  });
});

describe("liveActualLane", () => {
  const write = planned("write", 780, 60);
  const lunchDone: TestBlock = {
    ...planned("lunch", 720, 60),
    status: "done",
    actualStartMin: 720,
    actualDurationMin: 75, // ran until 13:15
  };

  test("what was recorded, and the running block up to now", () => {
    const lane = liveActualLane([lunchDone, write, drift], at(TUE, "13:40"));
    expect(
      lane.map(({ id, startMin, durationMin, live }) => ({
        id,
        startMin,
        durationMin,
        live,
      })),
    ).toEqual([
      { id: "lunch", startMin: 720, durationMin: 75, live: false },
      { id: "drift", startMin: 780, durationMin: 45, live: false },
    ]);
  });

  test("the running block grows from where Done would start it", () => {
    const lane = liveActualLane([lunchDone, write], at(TUE, "13:40"));
    expect(lane.find((entry) => entry.live)).toMatchObject({
      id: "write",
      startMin: 795,
      durationMin: 25,
    });
  });

  test("no running block, no live entry", () => {
    expect(
      liveActualLane([lunchDone, write], at(TUE, "15:00")).some(
        (entry) => entry.live,
      ),
    ).toBe(false);
  });
});

describe("actualStartFromClock", () => {
  test.each([
    [690, 660, 690], // 11:30 for a block at 11:00
    [10, 1410, 1450], // 00:10 for a block that began at 23:30: after midnight
    [1430, 1450, 1430], // 23:50 for one at 00:10 next day: back before midnight
    [420, 1380, 1860], // 07:00 for last night's sleep: the next morning
    [1430, 30, null], // 23:50 for a block at 00:30: the day before, not possible
  ])("%d near %d is %s", (clock, current, expected) => {
    expect(actualStartFromClock(clock, current)).toBe(expected);
  });
});

describe("Start the minimum (PRD V3)", () => {
  const write = planned("write", 780, 60); // 13:00–14:00
  const evening = at(TUE, "18:00");
  const chosen: TestBlock & { minimumChosen?: boolean } = {
    ...write,
    minimumChosen: true,
  };

  test("keeps the block planned and remembers the choice, even ahead of time", () => {
    expect(
      applyStatus(write, { type: "startMinimum" }, [], at(MON, "20:00")),
    ).toEqual({
      fields: {
        status: "planned",
        actualStartMin: undefined,
        actualDurationMin: undefined,
        skipReason: undefined,
        minimumChosen: true,
      },
    });
  });

  test("finishing it counts as Partly with the minimum noted, never Done", () => {
    expect(applyStatus(chosen, { type: "done" }, [], at(TUE, "13:25"))).toEqual(
      {
        fields: {
          status: "partial",
          actualStartMin: 780,
          actualDurationMin: 25,
          skipReason: undefined,
          minimumChosen: true,
        },
      },
    );
    expect(
      applyStatus(chosen, { type: "partial", minutes: 20 }, [], evening),
    ).toMatchObject({ fields: { status: "partial", minimumChosen: true } });
  });

  test("never a skip: skipping on purpose lets the minimum go", () => {
    expect(
      applyStatus(chosen, { type: "skip", reason: "tired" }, [], evening),
    ).toMatchObject({
      fields: { status: "skipped", minimumChosen: undefined },
    });
  });

  test("Undo unmarks and keeps the choice; on a block not marked, it drops it", () => {
    const marked = {
      ...chosen,
      status: "partial" as const,
      actualStartMin: 780,
      actualDurationMin: 25,
    };
    expect(applyStatus(marked, { type: "undo" }, [], evening)).toMatchObject({
      fields: { status: "planned", minimumChosen: true },
    });
    expect(applyStatus(chosen, { type: "undo" }, [], evening)).toMatchObject({
      fields: { status: "planned", minimumChosen: undefined },
    });
  });

  test("never on a block already marked: that would erase what happened", () => {
    const marked: TestBlock[] = [
      { ...write, status: "done", actualStartMin: 780, actualDurationMin: 60 },
      {
        ...write,
        status: "partial",
        actualStartMin: 780,
        actualDurationMin: 20,
      },
      { ...write, status: "skipped" },
    ];
    for (const block of marked) {
      expect(applyStatus(block, { type: "startMinimum" }, [], evening)).toEqual(
        { problem: "MARKED" },
      );
    }
  });

  test("every change keeps the block's shape", () => {
    const actions: StatusAction[] = [
      { type: "startMinimum" },
      { type: "done" },
      { type: "partial", minutes: 10 },
      { type: "skip" },
      { type: "undo" },
    ];
    for (const action of actions) {
      const result = applyStatus(chosen, action, [], evening);
      if (!("fields" in result)) throw new Error("expected a change");
      expect(blockShapeProblem({ ...chosen, ...result.fields })).toBeNull();
    }
  });

  test.each<[string, BlockShape["status"], boolean]>([
    ["planned", "planned", true],
    ["partly done", "partial", true],
    ["done", "done", false],
    ["skipped", "skipped", false],
  ])("the minimum on a %s block is %s", (_, status, allowed) => {
    const happened =
      status === "done" || status === "partial"
        ? { actualStartMin: 780, actualDurationMin: 20 }
        : {};
    expect(
      blockShapeProblem({ ...write, ...happened, status, minimumChosen: true }),
    ).toBe(allowed ? null : "INVALID_INPUT");
  });
});
