import { describe, expect, test } from "vitest";
import { dropSpan } from "@shared/drag";
import type { DateKey } from "@shared/time";
import type { Doc, Id } from "@/lib/api";
import { dragSetup, dragTimeLabel, dropUpdate } from "./blockDrag";

const FRI = "2026-10-16" as DateKey;
const SAT = "2026-10-17" as DateKey;
const GRID = 300; // 05:00

function block(id: string, extra: Partial<Doc<"blocks">> = {}): Doc<"blocks"> {
  return {
    _id: id as Id<"blocks">,
    _creationTime: 0,
    userId: "u" as Id<"users">,
    date: FRI,
    title: id,
    categoryId: "c" as Id<"categories">,
    status: "planned",
    ...extra,
  };
}

const plan = (start: number, length: number) => ({
  plannedStartMin: start,
  plannedDurationMin: length,
});
const actual = (start: number, length: number) => ({
  actualStartMin: start,
  actualDurationMin: length,
});

const script = block("Script", {
  ...plan(540, 120),
  status: "done",
  ...actual(545, 115),
});
const lunch = block("Lunch", {
  ...plan(720, 60),
  status: "done",
  ...actual(720, 60),
});
const edit = block("Edit", plan(840, 120)); // running at 14:20
const gym = block("Gym", plan(1020, 90));
const sleep = block("Sleep", plan(1380, 480));
const phone = block("phone", { status: "done", ...actual(780, 30) });
const blocks = [script, lunch, edit, gym, sleep, phone];
const today = {
  blocks,
  day: FRI,
  gridStartMin: GRID,
  now: { date: FRI, minute: 860 },
  tense: "today" as const,
  planUnlocked: false,
};

describe("dragSetup: what a drag may change (PRD section 7, rule 4)", () => {
  test("a block still ahead today moves in the plan, not before now", () => {
    const setup = dragSetup(gym, "plan", today);
    expect(setup?.origin).toEqual({ top: 720, height: 90 });
    expect(setup?.limits).toEqual({
      minTop: 560,
      maxTop: 1435,
      maxBottom: 1440,
    });
    // The others in the plan lane, the sleep after it included.
    expect(setup?.taken).toContainEqual({ top: 540, height: 120 });
  });

  test("a block that has started does not move in the plan", () => {
    expect(dragSetup(edit, "plan", today)).toBeNull();
    expect(dragSetup(script, "plan", today)).toBeNull();
  });

  test("what happened moves in the actual lane, ending no later than now", () => {
    const setup = dragSetup(lunch, "actual", today);
    expect(setup?.origin).toEqual({ top: 420, height: 60 });
    expect(setup?.limits.maxBottom).toBe(560);
    expect(setup?.taken).toContainEqual({ top: 245, height: 115 });
    expect(dragSetup(phone, "actual", today)).not.toBeNull();
    // The running block has no recorded actual to move.
    expect(dragSetup(edit, "actual", today)).toBeNull();
  });

  test("a card cut at the grid's edge stays put", () => {
    expect(dragSetup(sleep, "plan", today)).toBeNull();
  });

  test("a day to come has only a plan; a past day's plan waits for Edit plan", () => {
    const future = { ...today, day: SAT, tense: "future" as const };
    const saturday = block("Run", { date: SAT, ...plan(480, 60) });
    expect(
      dragSetup(saturday, "plan", { ...future, blocks: [saturday] }),
    ).not.toBeNull();
    const past = {
      ...today,
      now: { date: SAT, minute: 600 },
      tense: "past" as const,
    };
    expect(dragSetup(lunch, "plan", past)).toBeNull();
    expect(dragSetup(lunch, "actual", past)?.limits.maxBottom).toBe(1440);
    const unlocked = dragSetup(lunch, "plan", { ...past, planUnlocked: true });
    // With actual times it keeps its calendar day: no start after midnight.
    expect(unlocked?.limits).toEqual({
      minTop: 0,
      maxTop: 1135,
      maxBottom: 1440,
    });
  });
});

describe("a drag never overlaps and moves nothing else", () => {
  test("Gym dragged up into Edit stops where Edit ends", () => {
    const setup = dragSetup(gym, "plan", today);
    if (setup === null) throw new Error("Gym should drag");
    const landed = dropSpan({ ...setup, mode: "move", deltaMin: -100 });
    expect(landed).toEqual({ top: 660, height: 90 }); // 16:00
    const update = dropUpdate(gym, "plan", landed, FRI, GRID);
    expect(update).toEqual({ blockId: "Gym", plannedStartMin: 960 });
  });

  test("Lunch's actual stretched into the phone entry stops where it begins", () => {
    const setup = dragSetup(lunch, "actual", today);
    if (setup === null) throw new Error("Lunch should drag");
    const landed = dropSpan({ ...setup, mode: "resize", deltaMin: 45 });
    expect(landed).toEqual({ top: 420, height: 60 });
    expect(dropUpdate(lunch, "actual", landed, FRI, GRID)).toBeNull();
  });
});

test("Lunch's actual stretched toward now stops where the running block's bar begins", () => {
  const withoutPhone = blocks.filter((item) => item !== phone);
  const setup = dragSetup(lunch, "actual", { ...today, blocks: withoutPhone });
  if (setup === null) throw new Error("Lunch should drag");
  // Edit runs from 14:00; its bar is what Done would record.
  expect(setup.taken).toContainEqual({ top: 540, height: 20 });
  expect(dropSpan({ ...setup, mode: "resize", deltaMin: 80 })).toEqual({
    top: 420,
    height: 120,
  });
});

describe("dropUpdate", () => {
  test("a plan dropped after midnight moves to the next calendar day", () => {
    expect(
      dropUpdate(gym, "plan", { top: 1170, height: 90 }, FRI, GRID),
    ).toEqual({
      blockId: "Gym",
      date: SAT,
      plannedStartMin: 30,
    });
  });

  test("a resize sends only the length", () => {
    expect(
      dropUpdate(gym, "plan", { top: 720, height: 60 }, FRI, GRID),
    ).toEqual({
      blockId: "Gym",
      plannedDurationMin: 60,
    });
  });

  test("a planned block's actual counts from its own day; an entry moves its date", () => {
    expect(
      dropUpdate(lunch, "actual", { top: 400, height: 60 }, FRI, GRID),
    ).toEqual({ blockId: "Lunch", actualStartMin: 700 });
    expect(
      dropUpdate(phone, "actual", { top: 1160, height: 30 }, FRI, GRID),
    ).toEqual({ blockId: "phone", date: SAT, actualStartMin: 20 });
  });

  test("the time label follows the card", () => {
    expect(dragTimeLabel(FRI, GRID, { top: 660, height: 90 })).toBe(
      "16:00–17:30",
    );
  });
});
