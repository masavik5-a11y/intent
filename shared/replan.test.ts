import { describe, expect, test } from "vitest";
import { pushToTomorrow, restOfDay, shiftRest } from "./replan";
import { parseDateKey, type DateKey } from "./time";

function key(value: string): DateKey {
  const parsed = parseDateKey(value);
  if (parsed === null) throw new Error(`Bad DateKey in test: ${value}`);
  return parsed;
}

const FRI = key("2026-10-16");
const SAT = key("2026-10-17");
const GRID = 300;
const NOW = { date: FRI, minute: 860 }; // 14:20

type B = {
  _id: string;
  title: string;
  date: DateKey;
  status: "planned" | "done" | "partial" | "skipped";
  plannedStartMin?: number;
  plannedDurationMin?: number;
  actualStartMin?: number;
  actualDurationMin?: number;
};

const plan = (
  title: string,
  date: DateKey,
  start: number,
  length: number,
  extra: Partial<B> = {},
): B => ({
  _id: title,
  title,
  date,
  status: "planned",
  plannedStartMin: start,
  plannedDurationMin: length,
  ...extra,
});

const script = plan("Script", FRI, 540, 120, {
  status: "done",
  actualStartMin: 540,
  actualDurationMin: 120,
});
const edit = plan("Edit", FRI, 840, 120); // running
const gym = plan("Gym", FRI, 1020, 90); // 17:00–18:30
const dinner = plan("Dinner", FRI, 1140, 45); // 19:00–19:45
const read = plan("Read", FRI, 1260, 30, { status: "skipped" }); // 21:00
const sleep = plan("Sleep", FRI, 1380, 480); // 23:00–07:00
const meditation = plan("Meditation", SAT, 420, 20); // Sat 07:00
const day = [script, edit, gym, dinner, read, sleep];

const ids = (moves: { block: B }[]) => moves.map(({ block }) => block._id);

describe("restOfDay", () => {
  test("what is still ahead and not marked; not the running block, not the past", () => {
    expect(restOfDay(day, FRI, GRID, NOW).map((block) => block._id)).toEqual([
      "Gym",
      "Dinner",
      "Sleep",
    ]);
  });
});

const isSleep = (block: B) => block.title === "Sleep";

describe("shiftRest never overlaps and moves only the rest of today", () => {
  test("sleep is kept to the clock: the afternoon moves, bedtime does not", () => {
    const result = shiftRest([...day, meditation], FRI, GRID, NOW, 30, isSleep);
    if (!("moves" in result)) throw new Error(JSON.stringify(result));
    expect(ids(result.moves)).toEqual(["Gym", "Dinner"]);
  });

  test("what would run into sleep is refused, and sleep says so", () => {
    expect(shiftRest(day, FRI, GRID, NOW, 120, isSleep)).toMatchObject({
      problem: "IN_THE_WAY",
      block: dinner,
      by: read,
    });
    const lateRead = plan("Read", FRI, 1320, 45); // 22:00–22:45
    expect(shiftRest([lateRead, sleep], FRI, GRID, NOW, 30, isSleep)).toEqual({
      problem: "IN_THE_WAY",
      block: lateRead,
      by: sleep,
    });
  });

  test("in the order of the day, whatever order they came in", () => {
    const result = shiftRest([sleep, dinner, gym], FRI, GRID, NOW, 15);
    if (!("moves" in result)) throw new Error(JSON.stringify(result));
    expect(ids(result.moves)).toEqual(["Gym", "Dinner", "Sleep"]);
  });

  test("half an hour later: each keeps its length, sleep crosses midnight as before", () => {
    const result = shiftRest(day, FRI, GRID, NOW, 30);
    if (!("moves" in result)) throw new Error(JSON.stringify(result));
    expect(ids(result.moves)).toEqual(["Gym", "Dinner", "Sleep"]);
    expect(result.moves.map(({ to }) => to)).toEqual([
      { date: FRI, startMin: 1050, durationMin: 90 },
      { date: FRI, startMin: 1170, durationMin: 45 },
      { date: FRI, startMin: 1410, durationMin: 480 },
    ]);
  });

  test("a move past midnight lands on the next calendar day, still today's grid", () => {
    const late = plan("Late", FRI, 1410, 30); // 23:30
    const result = shiftRest([late], FRI, GRID, NOW, 60);
    expect(result).toEqual({
      moves: [
        { block: late, to: { date: SAT, startMin: 30, durationMin: 30 } },
      ],
    });
  });

  test("tomorrow morning's first block in the way: refused as a whole", () => {
    expect(shiftRest([...day, meditation], FRI, GRID, NOW, 30)).toEqual({
      problem: "IN_THE_WAY",
      block: sleep,
      by: meditation,
    });
  });

  test("a skipped block stays and can be in the way", () => {
    expect(shiftRest(day, FRI, GRID, NOW, 120)).toMatchObject({
      problem: "IN_THE_WAY",
      block: dinner,
      by: read,
    });
  });

  test("earlier: not into the running block, not before now", () => {
    expect(shiftRest([edit, gym], FRI, GRID, NOW, -60)).toEqual({
      moves: [
        { block: gym, to: { date: FRI, startMin: 960, durationMin: 90 } },
      ],
    });
    expect(shiftRest([edit, gym], FRI, GRID, NOW, -90)).toEqual({
      problem: "IN_THE_WAY",
      block: gym,
      by: edit,
    });
    expect(shiftRest([gym], FRI, GRID, NOW, -180)).toEqual({
      problem: "OUT_OF_DAY",
      block: gym,
    });
  });

  test("past the end of today's grid is not today any more", () => {
    expect(shiftRest([sleep], FRI, GRID, NOW, 360)).toEqual({
      problem: "OUT_OF_DAY",
      block: sleep,
    });
  });

  test("nothing left, or a shift that is not one", () => {
    expect(shiftRest([script, edit], FRI, GRID, NOW, 30)).toEqual({
      problem: "NOTHING",
    });
    for (const minutes of [0, 7, -13, 725, 1.5]) {
      expect(shiftRest(day, FRI, GRID, NOW, minutes)).toEqual({
        problem: "INVALID",
      });
    }
  });
});

describe("pushToTomorrow", () => {
  test("a block still ahead moves to the same time tomorrow", () => {
    expect(pushToTomorrow(gym, day, FRI, GRID, NOW)).toEqual({
      kind: "move",
      block: gym,
      to: { date: SAT, startMin: 1020, durationMin: 90 },
    });
  });

  test("where tomorrow is taken then, the first free time after it", () => {
    const run = plan("Run", SAT, 1020, 60);
    expect(pushToTomorrow(gym, [...day, run], FRI, GRID, NOW)).toMatchObject({
      kind: "move",
      to: { date: SAT, startMin: 1080, durationMin: 90 },
    });
  });

  test("a block that has begun stays today and is copied to tomorrow", () => {
    expect(pushToTomorrow(edit, day, FRI, GRID, NOW)).toEqual({
      kind: "copy",
      block: edit,
      to: { date: SAT, startMin: 840, durationMin: 120 },
    });
  });

  test("a block after midnight goes to the same place in tomorrow's grid", () => {
    const late = plan("Late", SAT, 60, 30); // Fri's grid, 01:00 Saturday
    expect(pushToTomorrow(late, [late], FRI, GRID, NOW)).toMatchObject({
      kind: "move",
      to: { date: key("2026-10-18"), startMin: 60 },
    });
  });

  test("a marked block does not go; a full tomorrow has no room", () => {
    expect(pushToTomorrow(script, day, FRI, GRID, NOW)).toEqual({
      problem: "MARKED",
    });
    const allEvening = plan("Away", SAT, 1020, 720); // Sat 17:00 to Sun 05:00
    expect(pushToTomorrow(gym, [...day, allEvening], FRI, GRID, NOW)).toEqual({
      problem: "NO_ROOM",
    });
  });
});
