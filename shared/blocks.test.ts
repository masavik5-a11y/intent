import { describe, expect, test } from "vitest";
import {
  actualLaneOf,
  blockShapeProblem,
  blockSpan,
  effectiveIntent,
  hasActual,
  hasPlan,
  INTENT_FIELDS,
  isValidActualStart,
  planLaneOf,
  type BlockShape,
  type IntentTexts,
} from "./blocks";
import type { DateKey } from "./time";

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
        actualStartMin: 1440,
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
      { ...base, status: "done", actualStartMin: 2400, actualDurationMin: 600 },
      "INVALID_TIME",
    ],
  ])("refuses %s", (_, block, problem) => {
    expect(blockShapeProblem(block)).toBe(problem);
  });
});
